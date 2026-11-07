import assert from "node:assert/strict";
import { test } from "node:test";

import type { KpiAnswer, KpiResult } from "../data.ts";
import { defaultPriorities, firstScreen, getViewsAndReview, priorityKpis, proposedNextSteps, signalGroups, signalResults } from "../data.ts";

const VIEWS = ["KAM", "Customer"] as const;
const DEFAULTS = getViewsAndReview().data.defaults_by_customer;

function result(answer: KpiAnswer): KpiResult {
  assert.ok(!("withheld" in answer), `${answer.kpi_id} was withheld`);
  return answer;
}

test("defaultPriorities gives the Customer's default order", () => {
  assert.deepEqual(defaultPriorities("CUST001"), ["water", "service_reliability", "emissions"]);
  assert.deepEqual(defaultPriorities("CUST002"), ["garment_utilisation", "circularity"]);
  assert.throws(() => defaultPriorities("CUST999"));
});

test("priorityKpis gives a priority's KPI set, by name or id, and throws on an unknown priority", () => {
  const water = ["water_use_allocated", "water_saved", "washed_kg", "washes_per_garment"];
  assert.deepEqual(priorityKpis("Water"), water);
  assert.deepEqual(priorityKpis("water"), water);
  assert.deepEqual(priorityKpis("Traceability"), ["scan_coverage", "turnaround_by_stage", "on_time_service_cycle_share"]);
  assert.throws(() => priorityKpis("Hygiene"), /Unknown Customer priority "Hygiene"/);
});

test("signalResults gives fired results only in the Customer view, without signal 4", () => {
  const fired = (customer_id: string, view: "KAM" | "Customer") =>
    signalResults({ customer_id, view }).filter((r) => r.fired);
  const customerView = signalResults({ customer_id: "CUST001", view: "Customer" });
  assert.equal(customerView.length, 13);
  assert.equal(new Set(customerView.map((r) => r.signal_id)).size, 5);
  assert.ok(customerView.every((r) => r.fired && r.signal_id !== "service_request_rate_above_peers"));
  assert.equal(signalResults({ customer_id: "CUST002", view: "Customer" }).length, 6);
  assert.equal(signalResults({ customer_id: "CUST003", view: "Customer" }).length, 3);
  assert.deepEqual(["CUST001", "CUST002", "CUST003"].map((c) => fired(c, "KAM").length), [18, 8, 3]);
});

test("signalResults in the KAM view includes results that did not fire, and narrows to a Site", () => {
  const all = signalResults({ customer_id: "CUST001", view: "KAM" });
  assert.ok(all.some((r) => !r.fired));
  assert.ok(all.every((r) => r.customer_id === "CUST001"));
  const site = signalResults({ customer_id: "CUST001", site_id: "S008", view: "KAM" });
  assert.ok(site.length > 0 && site.every((r) => r.site_id === "S008"));
  assert.throws(() => signalResults({ customer_id: "CUST002", site_id: "S008", view: "KAM" }));
});

test("signalGroups with default priorities equals the stored groups for every Customer and view", () => {
  for (const stored of DEFAULTS) {
    for (const view of VIEWS) {
      assert.deepEqual(signalGroups({ customer_id: stored.customer_id, view }), stored.views[view].signal_groups);
    }
  }
});

test("signalGroups re-rank when the priorities change, and unmatched groups come last by largest gap", () => {
  const groups = signalGroups({ customer_id: "CUST001", view: "Customer", priorities: ["Water", "Emissions"] });
  assert.deepEqual(
    groups.map((g) => [g.rank, g.signal_id, g.matched_priority_id]),
    [
      [1, "washes_per_garment_above_peers", "water"],
      [2, "late_service_cycles_above_peers", null],
      [3, "garment_allocation_above_peers", null],
      [4, "allocated_garments_with_no_scan_activity_above_peers", null],
      [5, "repair_rate_above_peers", null],
    ],
  );
  assert.throws(() => signalGroups({ customer_id: "CUST001", view: "Customer", priorities: ["Hygiene"] }));
});

test("proposedNextSteps with default priorities equals the stored steps for every Customer and view", () => {
  for (const stored of DEFAULTS) {
    for (const view of VIEWS) {
      assert.deepEqual(proposedNextSteps({ customer_id: stored.customer_id, view }), stored.views[view].proposed_next_steps);
    }
  }
});

test("proposedNextSteps are the top 3 signal groups, or fewer, proposed with their lever owner and no date", () => {
  const northstar = proposedNextSteps({ customer_id: "CUST001", view: "Customer" });
  assert.deepEqual(
    northstar.map((s) => [s.signal_id, s.lever_owner]),
    [
      ["washes_per_garment_above_peers", "Customer"],
      ["late_service_cycles_above_peers", "Lindström"],
      ["garment_allocation_above_peers", "Joint"],
    ],
  );
  assert.ok(northstar.every((s) => s.status === "proposed" && s.status_text === "Proposed, to be agreed in the meeting."));
  assert.ok(northstar.every((s) => !("date" in s)));
  assert.equal(proposedNextSteps({ customer_id: "CUST002", view: "Customer" }).length, 3);
  assert.equal(proposedNextSteps({ customer_id: "CUST003", view: "Customer" }).length, 2);
});

test("firstScreen with default priorities equals the stored first screen for every Customer and view", () => {
  for (const stored of DEFAULTS) {
    for (const view of VIEWS) {
      const screen = firstScreen({ customer_id: stored.customer_id, view, period: "2025" });
      assert.deepEqual(screen.priority_ids, stored.priority_ids);
      assert.deepEqual(screen.optimisation_potential, stored.views[view].optimisation_potential);
      assert.deepEqual(
        screen.priority_blocks.map(({ answers, ...block }) => block),
        stored.views[view].priority_blocks,
      );
    }
  }
});

test("firstScreen gives the 9 common tiles as runKpi answers for the period", () => {
  const screen = firstScreen({ customer_id: "CUST001", view: "Customer", period: "2025" });
  assert.equal(screen.tiles.length, 9);
  assert.equal(screen.site_count, 24);
  const values = Object.fromEntries(screen.tiles.flatMap((t) => t.answers.map((a) => [a.kpi_id, result(a).value])));
  const expected: Record<string, number> = {
    active_wearers: 9647.333333,
    garments_in_circulation: 31670,
    washed_kg: 502074.7,
    repairs: 15233,
    on_time_service_cycle_share: 0.983264,
    service_requests_per_100_wearers: 0.444855,
    emissions_saved: 255073.8285,
    water_saved: 1406482.75,
  };
  assert.deepEqual(Object.keys(values), Object.keys(expected));
  for (const [kpi_id, value] of Object.entries(expected)) {
    assert.ok(Math.abs(values[kpi_id]! - value) < 1e-3, `${kpi_id} is ${values[kpi_id]}, not ${value}`);
  }
  assert.deepEqual(screen.tiles.find((t) => t.id === "site_count")?.answers, []);
  const h1 = firstScreen({ customer_id: "CUST001", view: "Customer", period: "2025-H1" });
  assert.equal(h1.tiles[0].answers.length, 0);
  assert.equal(result(h1.tiles.find((t) => t.id === "repairs")!.answers[0]).period, "2025-H1");
});

test("firstScreen gives every priority block KPI an answer", () => {
  const screen = firstScreen({ customer_id: "CUST003", view: "Customer", period: "2025" });
  for (const block of screen.priority_blocks) {
    assert.deepEqual(block.answers.map((a) => result(a).kpi_id), block.kpi_ids);
  }
});

test("firstScreen adds account health and dashboard_emphasis in the KAM view only", () => {
  const kam = firstScreen({ customer_id: "CUST001", view: "KAM", period: "2025" }).kam_additions;
  assert.ok(kam);
  assert.equal(result(kam.account_health).detail?.kind, "account_health");
  assert.equal(kam.dashboard_emphasis?.industry, "Food & Beverage");
  assert.equal(firstScreen({ customer_id: "CUST001", view: "Customer", period: "2025" }).kam_additions, null);
});

test("firstScreen follows changed priorities: NorthStar with Water and Emissions gets 2 blocks", () => {
  const screen = firstScreen({ customer_id: "CUST001", view: "Customer", period: "2025", priorities: ["Water", "Emissions"] });
  assert.deepEqual(screen.priority_ids, ["water", "emissions"]);
  assert.deepEqual(
    screen.priority_blocks.map((b) => [b.position, b.priority_id, b.signal_group_signal_id]),
    [
      [1, "water", "washes_per_garment_above_peers"],
      [2, "emissions", "washes_per_garment_above_peers"],
    ],
  );
  assert.equal(screen.optimisation_potential.top_signal_group_signal_id, "washes_per_garment_above_peers");
  assert.throws(
    () => firstScreen({ customer_id: "CUST001", view: "Customer", period: "2025", priorities: ["Hygiene"] }),
    /Unknown Customer priority "Hygiene"/,
  );
});

test("firstScreen with a NorthStar Site gives a Site count of 1 and runs every tile and block for the Site", () => {
  for (const view of VIEWS) {
    const screen = firstScreen({ customer_id: "CUST001", site_id: "S008", view, period: "2025" });
    assert.equal(screen.site_count, 1);
    const answers = [...screen.tiles, ...screen.priority_blocks].flatMap((t) => t.answers);
    assert.ok(answers.length > 0);
    for (const answer of answers) {
      if ("withheld" in answer) continue;
      assert.deepEqual(answer.scope, { customer_id: "CUST001", site_id: "S008" }, answer.kpi_id);
    }
  }
});

test("firstScreen with a Site counts that Site's fired results and keeps only signal groups with a result there", () => {
  // Fired results per Site in opportunity-signals.json. Signal 4 is KAM view only (ADR 0011).
  const scan = "allocated_garments_with_no_scan_activity_above_peers";
  const s008 = ["washes_per_garment_above_peers", "late_service_cycles_above_peers"];
  const s023 = ["garment_allocation_above_peers", "washes_per_garment_above_peers"];
  const expected = {
    S008: { KAM: s008, Customer: s008 },
    S018: { KAM: [scan, "service_request_rate_above_peers"], Customer: [scan] },
    S023: { KAM: s023, Customer: s023 },
  };
  for (const [site_id, byView] of Object.entries(expected)) {
    for (const view of VIEWS) {
      const signals: string[] = byView[view];
      const screen = firstScreen({ customer_id: "CUST001", site_id, view, period: "2025" });
      const { fired_count, signal_count, top_signal_group_signal_id } = screen.optimisation_potential;
      assert.equal(fired_count, signals.length, `${site_id} ${view}`);
      assert.equal(signal_count, signals.length, `${site_id} ${view}`);
      assert.ok(top_signal_group_signal_id !== null && signals.includes(top_signal_group_signal_id), `${site_id} ${view}`);
      for (const block of screen.priority_blocks) {
        const id = block.signal_group_signal_id;
        assert.ok(id === null || signals.includes(id), `${site_id} ${view} ${block.priority_id}`);
      }
    }
  }
});

test("firstScreen with a Site uses the Site's account health rating in the KAM view", () => {
  const rating = (site_id?: string) => {
    const kam = firstScreen({ customer_id: "CUST001", site_id, view: "KAM", period: "2025-02" }).kam_additions;
    assert.ok(kam);
    const detail = result(kam.account_health).detail;
    assert.equal(detail?.kind, "account_health");
    return detail.rating;
  };
  assert.deepEqual([rating().scope_id, rating().rating], ["CUST001", "green"]);
  assert.deepEqual([rating("S018").scope_id, rating("S018").rating], ["S018", "amber"]);
});

test("firstScreen throws on a Site of another Customer", () => {
  assert.throws(
    () => firstScreen({ customer_id: "CUST002", site_id: "S008", view: "Customer", period: "2025" }),
    /Site S008 belongs to CUST001, not CUST002/,
  );
});
