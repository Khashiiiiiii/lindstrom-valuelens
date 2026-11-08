// The read tools of an Assistant answer, built per request from listKpis(view), so the Customer view never offers a
// KAM-only id (ADR 0011). The server checks every argument itself, since Ollama has no strict schemas, and a failed
// check throws a ToolError the runner hands back to the model. Ported from the prototype (Spec: AI assistant #39).

import type { BaselineId, KpiAnswer, KpiQuery, KpiResult, Period } from "../data.ts";
import { firstScreen, getMasterData, getOpportunitySignals, listKpis, proposedNextSteps, runKpi, signalGroups } from "../data.ts";
import type { CheckState } from "./checks.ts";
import { signalNumbers, siteShortName } from "./checks.ts";
import type { AssistantRequest } from "./contract.ts";
import { customerOf, priorityName } from "./context.ts";
import type { ChatTool } from "./ollama.ts";

/** A tool call the server refused. Its message goes back to the model. */
export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolError";
  }
}

/** What the tools collected over one answer, which the answer checks read. sources are deduped by kpi_id, scope, period and baseline. */
export type ToolState = CheckState;

export interface Tools {
  definitions: ChatTool[];
  /** Runs one tool and returns what the model sees. Throws ToolError on a bad call. */
  run(name: string, args: unknown): unknown;
  state: ToolState;
}

const UNITS = ["total", "per_active_wearer"] as const;
const GAP_MEANING = "A gap is how far the Site is above the median of the Customer's other Sites, as a share: a gap of 0.25 would mean 25% above.";

/** The tools for one request. */
export function buildTools(req: AssistantRequest): Tools {
  const master = getMasterData().data;
  const { customer, sites } = customerOf(req.customer_id);
  const siteName = (id: string) => sites.find((s) => s.site_id === id)?.site_name ?? id;
  const listing = listKpis(req.view);
  const kpiIds = listing.map((k) => k.id);
  const year = master.months[0].slice(0, 4);
  const periods = [year, `${year}-H1`, `${year}-H2`, ...master.months];
  const baselines = master.baselines.map((b) => b.baseline_id);
  const state: ToolState = {
    sources: [],
    signal_groups: [],
    // The context block gives the model the Site count.
    extra_numbers: [sites.length],
    sites: sites.map((s) => ({ site_id: s.site_id, short_name: siteShortName(s.site_name, customer.customer_name) })),
  };

  // ---------------------------------------------------------------- argument checks

  const objectArgs = (args: unknown): Record<string, unknown> => {
    let value = args;
    if (typeof value === "string") {
      if (value.trim() === "") return {};
      try {
        value = JSON.parse(value);
      } catch {
        throw new ToolError("The arguments are not valid JSON. Send them as a JSON object.");
      }
    }
    if (value === undefined || value === null) return {};
    if (typeof value !== "object" || Array.isArray(value)) throw new ToolError("The arguments must be a JSON object.");
    return value as Record<string, unknown>;
  };

  const oneOf = <T extends string>(value: unknown, allowed: readonly T[], field: string): T | undefined => {
    if (value === undefined || value === null || value === "") return undefined;
    if (typeof value !== "string" || !allowed.includes(value as T)) {
      throw new ToolError(`${field} must be one of ${allowed.join(", ")}; got ${JSON.stringify(value)}.`);
    }
    return value as T;
  };

  const period = (value: unknown): Period => oneOf(value, periods, "period") ?? req.period;

  /** undefined for the whole Customer. Left out, the request's Site filter. */
  const site = (value: unknown): string | undefined => {
    if (typeof value === "string" && isWholeCustomer(value, req.customer_id)) return undefined;
    return oneOf(value, sites.map((s) => s.site_id), "site_id") ?? req.site_id;
  };

  const addSources = (answers: KpiAnswer[]) => {
    const seen = new Set(state.sources.map(sourceKey));
    for (const a of answers) {
      if (seen.has(sourceKey(a))) continue;
      state.sources.push(a);
      seen.add(sourceKey(a));
    }
  };

  // ---------------------------------------------------------------- results the model sees

  const compact = (answer: KpiAnswer): unknown => {
    if ("withheld" in answer) return answer;
    const r: KpiResult = answer;
    return {
      kpi_id: r.kpi_id,
      name: r.name,
      value: r.value,
      unit: r.unit,
      volume: r.volume,
      period: r.period,
      site: r.scope.site_id ? siteName(r.scope.site_id) : "all Sites",
      baseline_id: r.baseline_id,
      data_status: r.data_status,
      not_evaluated_reason: r.not_evaluated_reason,
      caveats: r.caveats,
      ...(r.breakdown ? { breakdown: r.breakdown } : {}),
      ...(r.detail?.kind === "handprint" ? { baseline_label: r.detail.baseline_label } : {}),
      ...(r.detail?.kind === "account_health" ? { rating: r.detail.rating } : {}),
      ...(r.detail?.kind === "period_comparison" ? { comparison: r.detail.comparison } : {}),
    };
  };

  const signalPayload = () => {
    const query = { customer_id: req.customer_id, view: req.view, priorities: req.priorities };
    const groups = signalGroups(query);
    state.signal_groups = groups;
    state.extra_numbers.push(...signalNumbers(groups));
    const catalogue = getOpportunitySignals().catalogue;
    return {
      period: year,
      gap_meaning: GAP_MEANING,
      groups: groups.map((g) => {
        const entry = catalogue.find((e) => e.id === g.signal_id)!;
        return {
          rank: g.rank,
          signal_id: g.signal_id,
          signal_name: entry.name,
          what_it_flags: entry.definition,
          lever: g.lever,
          lever_owner: g.lever_owner,
          matched_priority: g.matched_priority_id ? priorityName(g.matched_priority_id) : null,
          fired_count: g.fired_count,
          results: g.results.map((r) => ({ site_name: siteName(r.site_id), product_id: r.product_id, gap: r.gap })),
        };
      }),
      proposed_next_steps: proposedNextSteps(query).map((s) => ({
        ...s,
        results: s.results.map((r) => ({ ...r, site_name: siteName(r.site_id) })),
      })),
    };
  };

  // ---------------------------------------------------------------- the tools

  const handlers: Record<string, (args: Record<string, unknown>) => unknown> = {
    get_overview(args) {
      const fs = firstScreen({ customer_id: req.customer_id, view: req.view, period: period(args.period), priorities: req.priorities });
      const answers = [...fs.tiles.flatMap((t) => t.answers), ...fs.priority_blocks.flatMap((b) => b.answers)];
      if (fs.kam_additions) answers.push(fs.kam_additions.account_health);
      addSources(answers);
      state.extra_numbers.push(fs.site_count, fs.optimisation_potential.fired_count, fs.optimisation_potential.signal_count);
      const signals = signalPayload();
      return {
        period: fs.period,
        priorities: fs.priority_ids.map(priorityName),
        site_count: fs.site_count,
        tiles: fs.tiles.map((t) => ({ name: t.name, results: t.answers.map(compact) })),
        optimisation_potential: fs.optimisation_potential,
        opportunity_signals: { ...signals, proposed_next_steps: signals.proposed_next_steps.slice(0, 3) },
        priority_blocks: fs.priority_blocks.map((b) => ({
          priority: priorityName(b.priority_id),
          results: b.answers.map(compact),
          signal_group: b.signal_group_signal_id,
        })),
        ...(fs.kam_additions ? { account_health: compact(fs.kam_additions.account_health) } : {}),
      };
    },
    get_kpis(args) {
      const ids: unknown[] = Array.isArray(args.kpi_ids) ? args.kpi_ids : typeof args.kpi_ids === "string" ? [args.kpi_ids] : [];
      if (ids.length === 0) throw new ToolError("kpi_ids must be a non-empty list of KPI ids.");
      const bad = ids.filter((id) => typeof id !== "string" || !kpiIds.includes(id));
      if (bad.length) throw new ToolError(`Unknown KPI ids in this view: ${bad.join(", ")}. Use ids from the tool description.`);
      const site_id = site(args.site_id);
      const query: KpiQuery = {
        scope: { customer_id: req.customer_id, ...(site_id ? { site_id } : {}) },
        period: period(args.period),
        view: req.view,
        baseline_id: oneOf<BaselineId>(args.baseline_id, baselines, "baseline_id"),
        unit: oneOf(args.unit, UNITS, "unit"),
      };
      const answers = (ids as string[]).map((id) => runKpi(id, query));
      addSources(answers);
      return answers.map(compact);
    },
    get_signal_groups() {
      return signalPayload();
    },
  };

  // ---------------------------------------------------------------- definitions the model sees

  const areas = [...new Set(listing.map((k) => k.evidence_area))];
  const kpiText = areas
    .map((a) => `${a}: ${listing.filter((k) => k.evidence_area === a).map((k) => `${k.id} (${k.name})`).join("; ")}`)
    .join("\n");
  const fn = (name: string, description: string, properties: Record<string, unknown>, required: string[] = []): ChatTool => ({
    type: "function",
    function: { name, description, parameters: { type: "object", properties, required } },
  });
  const periodProperty = { type: "string", enum: periods, description: "Leave out for the dashboard's period." };
  const definitions = [
    fn(
      "get_overview",
      "The dashboard's first screen for the whole Customer: the 9 common tiles with their KPI results, the Site count, the fired opportunity signal groups with their Sites, gaps, levers and owners (use these for outlier and optimisation questions), and up to 3 priority blocks with their KPI results.",
      { period: periodProperty },
    ),
    fn(
      "get_kpis",
      `Runs KPIs for one scope: one Site or the whole Customer, one period, one baseline and one unit. To compare Sites, call it once per Site. Period comparisons are the improvement_* KPIs.\n\nKPIs by evidence area:\n${kpiText}`,
      {
        kpi_ids: { type: "array", items: { type: "string", enum: kpiIds } },
        site_id: { type: "string", enum: ["all", ...sites.map((s) => s.site_id)], description: 'One Site, or "all" for the whole Customer. Left out, the Site filter, or the whole Customer when there is none.' },
        period: periodProperty,
        baseline_id: { type: "string", enum: baselines, description: "Handprint KPIs only. B_LOCAL outsourced local laundry (default), B_HOME home washing, B_INHOUSE in-house laundry." },
        unit: { type: "string", enum: UNITS, description: "Footprint KPIs only. Default total." },
      },
      ["kpi_ids"],
    ),
    fn(
      "get_signal_groups",
      `The fired opportunity signals for ${year}, grouped by signal and ranked by the Customer priorities, then by largest gap. Each group gives its lever, lever owner and the Sites it fired on with their gaps. Also gives the top 3 proposed next steps.`,
      {},
    ),
  ];

  return {
    definitions,
    state,
    run(name, args) {
      const handler = handlers[name];
      if (!handler) throw new ToolError(`Unknown tool ${JSON.stringify(name)}. Use ${Object.keys(handlers).join(", ")}.`);
      try {
        return handler(objectArgs(args));
      } catch (e) {
        // A calculation that throws (for example a Site outside the data) is a bad call, not a crash.
        if (e instanceof ToolError) throw e;
        throw new ToolError((e as Error).message);
      }
    },
  };
}

/** "all", "all sites", "customer" or the Customer's id mean the whole Customer. */
function isWholeCustomer(value: string, customer_id: string): boolean {
  const v = value.trim().toLowerCase();
  return v === "all" || v === "all sites" || v === "customer" || v === customer_id.toLowerCase();
}

function sourceKey(a: KpiAnswer): string {
  if ("withheld" in a) return `${a.kpi_id}|withheld`;
  const { site_id, product_id, preset_id } = a.scope;
  return [a.kpi_id, site_id ?? "", product_id ?? "", preset_id ?? "", a.period, a.baseline_id ?? ""].join("|");
}
