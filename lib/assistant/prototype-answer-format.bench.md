# Benchmark: Answer and observation format

Model `qwen3:4b-q8_0` in Ollama, 100% GPU, num_ctx 16384, thinking off, temperature 0.3. 10 runs, 571 s total, 2026-11-07T21:51:16.957Z. After round 3 of fixes (pick the signal group matching the question; round 2: no ranges, baseline checked per saved figure, owners attached by the server instead of retried, exact point count; on top of round 1: set_priorities returns the overview, the overview carries the signal groups, site_id "all" is the whole Customer, one server retry, server-owned tags). The tag checks on observations are now enforced by the server, so they pass by construction. Before any fixes: prototype-answer-format.bench.before.md. After round 1: prototype-answer-format.bench.after1.md. After round 2: prototype-answer-format.bench.after2.md.

| Item | Fully passed | Time |
|---|---|---|
| 1. Show the value created for NorthStar Foods Group in 2025. (KAM) | 10/10 | median 8 s, max 19 s |
| 2. Focus on water and emissions for the food-industry sites. (KAM) | 10/10 | median 5 s, max 11 s |
| 3. Which sites have the greatest textile-allocation optimization potential? (KAM) | 1/10 | median 5 s, max 5 s |
| 4. How can we improve our performance next year? (Customer) | 9/10 | median 7 s, max 11 s |
| 5. Compare our circular service with local laundry. (Customer) | 9/10 | median 8 s, max 8 s |
| 6. Prepare five discussion points for the annual steering committee. (KAM) | 10/10 | median 11 s, max 14 s |
| 7. What did the service cost us in euros last year? (Customer) | 10/10 | median 1 s, max 1 s |
| Generate observations, KAM view | 10/10 | median 4 s, max 10 s |
| Generate observations, Customer view | 10/10 | median 4 s, max 5 s |

## Checks

### 1. Show the value created for NorthStar Foods Group in 2025. (KAM)

- fetched figures: 10/10
- water saved names its baseline: 10/10
- no unmatched numbers: 10/10
- no rule 7 words: 10/10
- no em dash: 10/10
- no model error: 10/10

<details><summary>Notes</summary>

- run 3: retried for: Name the baseline ("vs outsourced local laundry") after each saved figure in: "Dataset laundry energy (0.70 kWh/kg) is about 30% below Lind".
- run 3: still after retry: Name the baseline ("vs outsourced local laundry") after each saved figure in: "Dataset laundry energy (0.70 kWh/kg) is about 30% below Lind".
- run 8: retried for: Name the baseline ("vs outsourced local laundry") after each saved figure in: "Dataset laundry energy (0.70 kWh/kg) is about 30% below Lind".
- run 8: still after retry: Name the baseline ("vs outsourced local laundry") after each saved figure in: "Dataset laundry energy (0.70 kWh/kg) is about 30% below Lind".

</details>

### 2. Focus on water and emissions for the food-industry sites. (KAM)

- priorities set Water, Emissions first: 10/10
- fetched figures after set_priorities: 10/10
- no unmatched numbers: 10/10
- no rule 7 words: 10/10
- no em dash: 10/10
- no model error: 10/10

<details><summary>Notes</summary>

- run 1: owner only in attached signal groups, not in text
- run 1: attached signal groups: washes_per_garment_above_peers (owner: Customer), service_request_rate_above_peers (owner: Joint), late_service_cycles_above_peers (owner: Lindström), garment_allocation_above_peers (owner: Joint)
- run 9: retried for: Name the baseline ("vs outsourced local laundry") after each saved figure in: "Caveats: Water saved and emissions saved tie back to the wor".
- run 9: still after retry: Name the baseline ("vs outsourced local laundry") after each saved figure in: "Caveats: Water saved and emissions saved tie back to the wor".

</details>

### 3. Which sites have the greatest textile-allocation optimization potential? (KAM)

- had the signal groups: 10/10
- names at least 3 garment-allocation Sites: 1/10
- names no other Site: 1/10
- no unmatched numbers: 10/10
- no rule 7 words: 10/10
- no em dash: 10/10
- no model error: 10/10

<details><summary>Notes</summary>

- run 1: attached signal groups: washes_per_garment_above_peers (owner: Customer), service_request_rate_above_peers (owner: Joint), late_service_cycles_above_peers (owner: Lindström), garment_allocation_above_peers (owner: Joint)
- run 1: Sites named: Lahti, Pori, Gdańsk, Kraków
- run 1: named the washes-per-garment signal instead
- run 2: attached signal groups: washes_per_garment_above_peers (owner: Customer), service_request_rate_above_peers (owner: Joint), late_service_cycles_above_peers (owner: Lindström), garment_allocation_above_peers (owner: Joint)
- run 2: Sites named: Lahti, Pori, Gdańsk, Kraków
- run 2: named the washes-per-garment signal instead
- run 3: attached signal groups: washes_per_garment_above_peers (owner: Customer), service_request_rate_above_peers (owner: Joint), late_service_cycles_above_peers (owner: Lindström), garment_allocation_above_peers (owner: Joint)
- run 3: Sites named: Lahti, Pori, Gdańsk, Kraków
- run 3: named the washes-per-garment signal instead
- run 4: attached signal groups: washes_per_garment_above_peers (owner: Customer), service_request_rate_above_peers (owner: Joint), late_service_cycles_above_peers (owner: Lindström), garment_allocation_above_peers (owner: Joint)
- run 4: Sites named: Lahti, Pori, Gdańsk, Kraków
- run 4: named the washes-per-garment signal instead
- run 5: attached signal groups: washes_per_garment_above_peers (owner: Customer), service_request_rate_above_peers (owner: Joint), late_service_cycles_above_peers (owner: Lindström), garment_allocation_above_peers (owner: Joint)
- run 5: Sites named: Lahti, Pori, Gdańsk, Kraków
- run 5: named the washes-per-garment signal instead
- run 6: attached signal groups: washes_per_garment_above_peers (owner: Customer), service_request_rate_above_peers (owner: Joint), late_service_cycles_above_peers (owner: Lindström), garment_allocation_above_peers (owner: Joint)
- run 6: Sites named: Lahti, Pori, Gdańsk, Kraków
- run 6: named the washes-per-garment signal instead
- run 7: attached signal groups: washes_per_garment_above_peers (owner: Customer), service_request_rate_above_peers (owner: Joint), late_service_cycles_above_peers (owner: Lindström), garment_allocation_above_peers (owner: Joint)
- run 7: Sites named: Lahti, Pori, Gdańsk, Kraków
- run 7: named the washes-per-garment signal instead
- run 8: attached signal groups: washes_per_garment_above_peers (owner: Customer), service_request_rate_above_peers (owner: Joint), late_service_cycles_above_peers (owner: Lindström), garment_allocation_above_peers (owner: Joint)
- run 8: Sites named: Lahti, Pori, Gdańsk, Kraków
- run 8: named the washes-per-garment signal instead
- run 9: attached signal groups: washes_per_garment_above_peers (owner: Customer), garment_allocation_above_peers (owner: Joint), repair_rate_above_peers (owner: Joint)
- run 9: Sites named: Vaasa, Lappeenranta, Malmö, Gothenburg, Kraków
- run 10: attached signal groups: washes_per_garment_above_peers (owner: Customer), service_request_rate_above_peers (owner: Joint), late_service_cycles_above_peers (owner: Lindström), garment_allocation_above_peers (owner: Joint)
- run 10: Sites named: Lahti, Pori, Gdańsk, Kraków
- run 10: named the washes-per-garment signal instead

</details>

### 4. How can we improve our performance next year? (Customer)

- had the signal groups: 10/10
- names Sites from the top signal: 10/10
- names only fired Sites: 10/10
- lever owners shown (text or attached signal groups): 10/10
- never calls a next step agreed: 10/10
- no unmatched numbers: 9/10
- no rule 7 words: 10/10
- no em dash: 10/10
- no model error: 10/10

<details><summary>Notes</summary>

- run 1: owner only in attached signal groups, not in text
- run 1: attached signal groups: washes_per_garment_above_peers (owner: Customer), late_service_cycles_above_peers (owner: Lindström), garment_allocation_above_peers (owner: Joint), repair_rate_above_peers (owner: Joint)
- run 2: unmatched: 31
- run 2: retried for: These numbers are in no tool result: 31. Remove them or use the exact figure from a result.
- run 2: still after retry: These numbers are in no tool result: 31. Remove them or use the exact figure from a result.
- run 2: owner only in attached signal groups, not in text
- run 2: attached signal groups: washes_per_garment_above_peers (owner: Customer), late_service_cycles_above_peers (owner: Lindström), garment_allocation_above_peers (owner: Joint), repair_rate_above_peers (owner: Joint)
- run 3: owner only in attached signal groups, not in text
- run 3: attached signal groups: washes_per_garment_above_peers (owner: Customer), late_service_cycles_above_peers (owner: Lindström), garment_allocation_above_peers (owner: Joint), allocated_garments_with_no_scan_activity_above_peers (owner: Joint), repair_rate_above_peers (owner: Joint)
- run 4: owner only in attached signal groups, not in text
- run 4: attached signal groups: washes_per_garment_above_peers (owner: Customer), late_service_cycles_above_peers (owner: Lindström), garment_allocation_above_peers (owner: Joint), repair_rate_above_peers (owner: Joint)
- run 5: owner only in attached signal groups, not in text
- run 5: attached signal groups: washes_per_garment_above_peers (owner: Customer), late_service_cycles_above_peers (owner: Lindström), garment_allocation_above_peers (owner: Joint), repair_rate_above_peers (owner: Joint)
- run 6: owner only in attached signal groups, not in text
- run 6: attached signal groups: washes_per_garment_above_peers (owner: Customer), late_service_cycles_above_peers (owner: Lindström), garment_allocation_above_peers (owner: Joint), repair_rate_above_peers (owner: Joint)
- run 7: attached signal groups: washes_per_garment_above_peers (owner: Customer), late_service_cycles_above_peers (owner: Lindström), garment_allocation_above_peers (owner: Joint), repair_rate_above_peers (owner: Joint)
- run 8: owner only in attached signal groups, not in text
- run 8: attached signal groups: washes_per_garment_above_peers (owner: Customer), late_service_cycles_above_peers (owner: Lindström), garment_allocation_above_peers (owner: Joint)
- run 9: retried for: These numbers are in no tool result: 31. Remove them or use the exact figure from a result.
- run 9: attached signal groups: washes_per_garment_above_peers (owner: Customer), late_service_cycles_above_peers (owner: Lindström), garment_allocation_above_peers (owner: Joint), repair_rate_above_peers (owner: Joint)
- run 10: owner only in attached signal groups, not in text
- run 10: attached signal groups: washes_per_garment_above_peers (owner: Customer), late_service_cycles_above_peers (owner: Lindström), garment_allocation_above_peers (owner: Joint), repair_rate_above_peers (owner: Joint)

</details>

### 5. Compare our circular service with local laundry. (Customer)

- whole Customer, not one Site: 9/10
- names the baseline: 10/10
- has a Caveats line: 10/10
- no unmatched numbers: 10/10
- no rule 7 words: 10/10
- no em dash: 10/10
- no model error: 10/10

### 6. Prepare five discussion points for the annual steering committee. (KAM)

- exactly 5 points: 10/10
- no unmatched numbers: 10/10
- no rule 7 words: 10/10
- no em dash: 10/10
- no model error: 10/10

<details><summary>Notes</summary>

- run 1: owner only in attached signal groups, not in text
- run 1: attached signal groups: washes_per_garment_above_peers (owner: Customer), service_request_rate_above_peers (owner: Joint), garment_allocation_above_peers (owner: Joint)
- run 1: 5 points
- run 2: owner only in attached signal groups, not in text
- run 2: attached signal groups: washes_per_garment_above_peers (owner: Customer), service_request_rate_above_peers (owner: Joint), repair_rate_above_peers (owner: Joint), garment_allocation_above_peers (owner: Joint), allocated_garments_with_no_scan_activity_above_peers (owner: Joint)
- run 2: 5 points
- run 3: owner only in attached signal groups, not in text
- run 3: attached signal groups: washes_per_garment_above_peers (owner: Customer), service_request_rate_above_peers (owner: Joint), late_service_cycles_above_peers (owner: Lindström), repair_rate_above_peers (owner: Joint), garment_allocation_above_peers (owner: Joint), allocated_garments_with_no_scan_activity_above_peers (owner: Joint)
- run 3: 5 points
- run 4: owner only in attached signal groups, not in text
- run 4: attached signal groups: washes_per_garment_above_peers (owner: Customer), service_request_rate_above_peers (owner: Joint), late_service_cycles_above_peers (owner: Lindström), repair_rate_above_peers (owner: Joint), garment_allocation_above_peers (owner: Joint), allocated_garments_with_no_scan_activity_above_peers (owner: Joint)
- run 4: 5 points
- run 5: owner only in attached signal groups, not in text
- run 5: attached signal groups: washes_per_garment_above_peers (owner: Customer), service_request_rate_above_peers (owner: Joint), late_service_cycles_above_peers (owner: Lindström), repair_rate_above_peers (owner: Joint), garment_allocation_above_peers (owner: Joint), allocated_garments_with_no_scan_activity_above_peers (owner: Joint)
- run 5: 5 points
- run 6: owner only in attached signal groups, not in text
- run 6: attached signal groups: washes_per_garment_above_peers (owner: Customer), service_request_rate_above_peers (owner: Joint), repair_rate_above_peers (owner: Joint), garment_allocation_above_peers (owner: Joint), allocated_garments_with_no_scan_activity_above_peers (owner: Joint)
- run 6: 5 points
- run 7: owner only in attached signal groups, not in text
- run 7: attached signal groups: washes_per_garment_above_peers (owner: Customer), service_request_rate_above_peers (owner: Joint), late_service_cycles_above_peers (owner: Lindström), garment_allocation_above_peers (owner: Joint), allocated_garments_with_no_scan_activity_above_peers (owner: Joint)
- run 7: 5 points
- run 8: owner only in attached signal groups, not in text
- run 8: attached signal groups: washes_per_garment_above_peers (owner: Customer), service_request_rate_above_peers (owner: Joint), late_service_cycles_above_peers (owner: Lindström), garment_allocation_above_peers (owner: Joint), allocated_garments_with_no_scan_activity_above_peers (owner: Joint)
- run 8: 5 points
- run 9: owner only in attached signal groups, not in text
- run 9: attached signal groups: washes_per_garment_above_peers (owner: Customer), service_request_rate_above_peers (owner: Joint), late_service_cycles_above_peers (owner: Lindström), repair_rate_above_peers (owner: Joint), garment_allocation_above_peers (owner: Joint), allocated_garments_with_no_scan_activity_above_peers (owner: Joint)
- run 9: 5 points
- run 10: 5 points

</details>

### 7. What did the service cost us in euros last year? (Customer)

- says "the data does not hold": 10/10
- gives no euro figure: 10/10
- no unmatched numbers: 10/10
- no rule 7 words: 10/10
- no em dash: 10/10
- no model error: 10/10

### Generate observations, KAM view

- 1 to 3 observations: 10/10
- no unmatched numbers: 10/10
- no rule 7 words: 10/10
- at most 40 words each: 10/10
- signal tags match the text: 10/10
- kpi_ids are KPI ids: 10/10
- no em dash: 10/10

<details><summary>Notes</summary>

- run 4: retried for: Observation 3: Do not write "issues". An opportunity signal only flags a Site for discussion.

</details>

### Generate observations, Customer view

- 1 to 3 observations: 10/10
- no unmatched numbers: 10/10
- no rule 7 words: 10/10
- at most 40 words each: 10/10
- signal tags match the text: 10/10
- kpi_ids are KPI ids: 10/10
- no em dash: 10/10
