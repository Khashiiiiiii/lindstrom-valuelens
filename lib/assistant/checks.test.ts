import assert from "node:assert/strict";
import { test } from "node:test";

import type { KpiAnswer } from "../data.ts";
import { getMasterData, runKpi, signalGroups } from "../data.ts";
import type { CheckState } from "./checks.ts";
import { answerProblems, namedSignalGroups, signalNumbers, siteShortName, unmatchedNumbers } from "./checks.ts";

const query = { scope: { customer_id: "CUST001" }, period: "2025", view: "KAM" } as const;
// washed_kg 502074.7 kg; water_saved 1406482.75 l vs outsourced local laundry, baseline 4769709.65 l, share 0.294878.
const washed = runKpi("washed_kg", query);
const water = runKpi("water_saved", query);
// on_time_service_cycle_share 0.983264, volume 11353.
const onTime = runKpi("on_time_service_cycle_share", query);
const sources: KpiAnswer[] = [washed, water, onTime];

test("a written number matches a value rounded to the places it writes", () => {
  assert.deepEqual(unmatchedNumbers("Washed 502,074.7 kg, about 502,075 kg or 502,074.70 kg.", sources, []), []);
  assert.deepEqual(unmatchedNumbers("Washed 502,074.8 kg and 502,076 kg.", sources, []), ["502,074.8", "502,076"]);
  assert.deepEqual(unmatchedNumbers("Water saved 1,406,483 l.", sources, []), []);
});

test("a share also matches as a percent", () => {
  assert.deepEqual(unmatchedNumbers("On time: 0.98, or 98.3% of 11,353 cycles.", sources, []), []);
  assert.deepEqual(unmatchedNumbers("On time: 97.3%.", sources, []), ["97.3"]);
});

test('a range "15-31" is two numbers', () => {
  const gaps = [0.152, 0.31];
  assert.deepEqual(unmatchedNumbers("Gaps of 15-31% and 15.2 – 31.0%.", [], gaps.flatMap((g) => [g, g * 100])), []);
  assert.deepEqual(unmatchedNumbers("Gaps of 15-40%.", [], gaps.flatMap((g) => [g, g * 100])), ["40"]);
});

test("years, periods, ids and list markers are skipped", () => {
  const text = "1. In 2025, 2025-H1 and 2025-03 (H2 too), S001, CUST001, P003 and B_LOCAL.\n2) Helsinki.\n 3. Turku.";
  assert.deepEqual(unmatchedNumbers(text, [], []), []);
  assert.deepEqual(unmatchedNumbers("Helsinki had 4 Sites.", [], []), ["4"]);
});

test("handprint baseline amounts and shares are known", () => {
  assert.deepEqual(unmatchedNumbers("Baseline 4,769,709.65 l; saved 29.5% (0.29) of it.", sources, []), []);
});

test("numbers inside a result's unit, name and caveats are known", () => {
  const rate = runKpi("service_requests_per_100_wearers", query);
  assert.deepEqual(unmatchedNumbers("0.44 service requests per 100 wearers per month.", [rate], []), []);
});

test("signal fired counts, gaps and the thresholds in signal definitions are known", () => {
  const groups = signalGroups({ customer_id: "CUST001", view: "KAM" });
  const g = groups.find((x) => x.signal_id === "garment_allocation_above_peers")!;
  const gap = g.results[0].gap;
  const known = signalNumbers(groups);
  const text = `${g.fired_count} Sites, gap ${gap.toFixed(2)} or ${(gap * 100).toFixed(1)}%. Flags at 30% or more, 1,000 packed pieces, about 1.6 points.`;
  assert.deepEqual(unmatchedNumbers(text, [], known), []);
  assert.deepEqual(unmatchedNumbers("Flags at 35% or more.", [], known), ["35"]);
});

const groups = signalGroups({ customer_id: "CUST001", view: "KAM" });
const sites = getMasterData().data.sites.filter((s) => s.customer_id === "CUST001");
const state: CheckState = {
  sources,
  signal_groups: groups,
  extra_numbers: signalNumbers(groups),
  sites: sites.map((s) => ({ site_id: s.site_id, short_name: siteShortName(s.site_name, "NorthStar Foods Group") })),
};

test("a Site's short name is its name without the Customer's brand prefix", () => {
  assert.equal(siteShortName("NorthStar Helsinki", "NorthStar Foods Group"), "Helsinki");
  assert.equal(siteShortName("Apex Malmö", "Apex Industrial Systems"), "Malmö");
  assert.equal(siteShortName("Central Kitchen", "NorthStar Foods Group"), "Central Kitchen");
});

test("a clean answer has no problems", () => {
  const text = "Water saved was 1,406,482.75 l vs outsourced local laundry for all Sites in 2025. Pori is flagged for discussion.";
  assert.deepEqual(answerProblems(text, state), []);
});

test("an unmatched number is a problem", () => {
  const [problem, ...rest] = answerProblems("All Sites washed 600,000 kg.", state);
  assert.match(problem, /600,000/);
  assert.deepEqual(rest, []);
});

test("each banned word is a problem", () => {
  for (const word of ["issue", "Problems", "inefficient", "overuse", "poor", "failing", "proves"]) {
    const problems = answerProblems(`Pori shows ${word} here.`, state);
    assert.equal(problems.length, 1, word);
    assert.match(problems[0], new RegExp(`"${word}"`));
  }
  assert.deepEqual(answerProblems("Pori tissues and approved poorer words.", state).length, 0);
});

test("a saved figure in a sentence without a baseline the sources used is a problem, but not on the Caveats line", () => {
  const problems = answerProblems("Water saved was 1,406,482.75 l. Washed 502,074.7 kg.", state);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /"vs outsourced local laundry"/);
  assert.match(problems[0], /Water saved was 1,406,482.75 l/);
  assert.deepEqual(answerProblems("Water saved 1,406,482.75 l vs outsourced local laundry.\nCaveats: water saved 1,406,482.75 l is modelled.", state), []);
});

test("a Site outside the signal the text names is a problem", () => {
  const text = 'Garment allocation above peers fired on Malmö (gap 43.6%), Kraków and Pori, flagged for discussion.';
  const [problem, ...rest] = answerProblems(text, state);
  assert.match(problem, /^Pori is not in the signal you describe/);
  assert.match(problem, /"Garment allocation above peers" fired on: Malmö \(gap 43\.\d\d%\), Kraków/);
  assert.deepEqual(rest, []);
  // Named by its lever.
  const byLever = answerProblems("Check wearer counts and spares, then right-size the allocation at Malmö and Lahti.", state);
  assert.match(byLever[0], /^Lahti is not in the signal/);
  // No signal named: any Site may appear.
  assert.deepEqual(answerProblems("Malmö and Pori are flagged for discussion.", state), []);
});

test("namedSignalGroups gives the groups whose Sites the text names", () => {
  const named = namedSignalGroups("Late cycles at Pori are flagged for discussion.", state);
  assert.deepEqual(
    named.map((g) => g.signal_id),
    ["washes_per_garment_above_peers", "late_service_cycles_above_peers"],
  );
  assert.deepEqual(namedSignalGroups("Helsinki and Poriville are fine.", state), []);
});
