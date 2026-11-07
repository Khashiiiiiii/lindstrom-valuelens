import assert from "node:assert/strict";
import { test } from "node:test";

import type { AssistantAnswer } from "../../lib/assistant/contract.ts";
import { runKpi, signalGroups } from "../../lib/data.ts";
import { metadataPage } from "../../lib/pages/metadata.ts";
import { answerCard } from "./answer-cards.ts";

const query = { scope: { customer_id: "CUST001" }, period: "2025", view: "Customer" } as const;
const meta = metadataPage({ customer_id: "CUST001", period: "2025", view: "Customer" });
const answer: AssistantAnswer = {
  answer: "Water saved was 1,406,483 l.",
  sources: [runKpi("water_saved", query), runKpi("account_health", query)],
  signal_groups: signalGroups({ customer_id: "CUST001", view: "Customer", priorities: ["water"] }).slice(0, 1),
  priority_change: null,
  unmatched_numbers: [],
};

test("each source shows its value, data status, baseline and caveats, and a Withheld source reads KAM view only", () => {
  const card = answerCard("en", answer, meta);
  assert.equal(card.text, "Water saved was 1,406,483 l.");
  assert.deepEqual(card.sources, [
    {
      withheld: false,
      label: "Water saved",
      value: "1,406,483",
      unit: "l",
      data_status: "ALLOCATED ESTIMATE, SYNTHETIC",
      baseline: "vs outsourced local laundry",
      caveats: [
        'Every value names its baseline, for example "vs outsourced local laundry".',
        "It ties back to the workbook's water_saving_vs_local_l for B_LOCAL.",
      ],
    },
    { withheld: true, label: "Account health", note: "KAM view only" },
  ]);
  assert.deepEqual(answerCard("fi", answer, meta).sources[1], { withheld: true, label: "Account health", note: "Vain KAM-näkymä" });
});

test("an answer with unmatched numbers carries a warning that names them, and one without has none", () => {
  assert.equal(answerCard("en", answer, meta).warning, null);
  assert.equal(
    answerCard("en", { ...answer, unmatched_numbers: ["12%", "3.4"] }, meta).warning,
    "Numbers not found in the sources: 12%, 3.4",
  );
});

test("a signal group in the answer shows as a group card with its lever, owner and Sites", () => {
  assert.deepEqual(answerCard("en", answer, meta).groups, [
    {
      name: "Washes per garment above peers",
      lever: "Review the Site's garment change routine.",
      owner: "Owner: Customer",
      // The Sites of the 4 fired washes_per_garment results in opportunity-signals.json, largest gap first.
      sites: ["NorthStar Pori", "NorthStar Gdańsk", "NorthStar Kraków", "NorthStar Lahti"],
    },
  ]);
});
