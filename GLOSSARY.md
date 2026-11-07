# Customer Value KPIs

The vocabulary for the KPIs shown on the Lindström Customer Value & Sustainability Review dashboard and its exported annual review.

## Account structure

**Customer**:
The parent organisation that holds the textile-service relationship with Lindström, identified by `customer_id`.
_Avoid_: Account, client, company

**Site**:
One delivery point of a Customer. Every Customer has one or more Sites.
_Avoid_: Location, delivery customer, branch

**KAM**:
The Lindström key account manager who prepares and runs the review with the Customer.
_Avoid_: Sales rep, account owner

**Customer decision-maker**:
The senior manager on the Customer side who receives the review and agrees next actions.
_Avoid_: High-level manager, customer user, stakeholder

## Views

**KAM view**:
The dashboard as the KAM sees it while preparing and running the review, including internal signals and data transparency detail.
_Avoid_: Internal view, sales view

**Customer view**:
The dashboard as the Customer decision-maker sees it: customer-ready figures, the assumptions and data gaps behind them, and proposed next steps. The exported review follows the same content.
_Avoid_: Manager view, executive view

## KPIs

**KPI catalogue**:
The single list of every KPI the dashboard and review may show, with each KPI's definition, sources and data status.
_Avoid_: Metric list, KPI spec

**Evidence area**:
One of the nine questions a Customer asks about the service. Each KPI belongs to exactly one. Examples: Service Performance, Sustainability Value.
_Avoid_: Category, pillar, theme

**Core KPI**:
A KPI shown for every Customer, whatever its industry.
_Avoid_: General KPI, standard KPI

**Industry KPI**:
A KPI shown or emphasised only for Customers in a given industry, following that industry's priorities.
_Avoid_: Specific KPI, custom KPI

No KPI is an Industry KPI at present: industry only sets the default Customer priorities, so every catalogue entry reads "Core KPI".

**KAM-entered KPI**:
A KPI whose value the KAM types in because no source data holds it. Examples: CSAT, a contractual SLA target, agreed actions.
_Avoid_: Manual KPI, custom KPI

Out of scope for now: the project stores no KAM-entered values, and data with no source is shown as a data gap.

**Customer priority**:
A topic the Customer wants the review to focus on. It is one of Water, Emissions, Circularity, Service reliability, Garment utilisation, Traceability or Improvement. A Customer's priorities default to the topics it has stated, then to its industry's ranking, and the user can change them.
_Avoid_: Focus area, preference, theme

**Opportunity signal**:
A fixed rule that flags a Site, or one product at a Site, for discussion when it does worse than the Customer's other Sites, and names the lever it points to.
_Avoid_: Insight, alert, recommendation

**Lever**:
The change an opportunity signal points to that could close its gap, together with who can make it: the Customer, Lindström or both (Joint).
_Avoid_: Action, fix, recommendation

**Proposed next step**:
The lever of a fired opportunity signal, offered in the review for the KAM and the Customer to agree. Its owner comes from the signal rule, and it has no date.
_Avoid_: Agreed action, action item, recommendation

**Account health**:
The green, amber or red rating of how well the service runs for a Customer, judged on service cycles, service requests and scan coverage against fixed thresholds. Only the KAM sees it. It is "not rated" when too little data exists to judge.
_Avoid_: Customer score, RAG status, Customer satisfaction

**Comparison period**:
The period a KPI value is compared against, for example H1 when the selected period is H2.
_Avoid_: Baseline, prior period, reference period

**Period comparison**:
A KPI's value in the selected period set against its value in the comparison period, labelled better, worse, no clear change or not evaluated.
_Avoid_: Trend, delta, baseline comparison

**Data status**:
The label on every KPI value that says how the number was obtained, for example synthetic, allocated estimate or KAM-entered.
_Avoid_: Confidence, quality flag

## Service

**Service cycle**:
One round trip of a garment: picked up at a Site, washed at the laundry and delivered back. A service cycle is on time when it takes 120 hours or less.
_Avoid_: Delivery, loop, rotation

**Garments in circulation**:
The garments assigned to a Customer or Site, counted as a monthly average over a period. They are assigned, not necessarily in use.
_Avoid_: Fleet, garment stock, garments in use

**Service request**:
A contact the Customer raised with Lindström about the service at a Site. It may be a routine request or a problem; the source does not say which.
_Avoid_: Complaint, ticket, case

**Allocated garments with no scan activity**:
Garments assigned to a Site that recorded no scan in the period. A reason to investigate, not proof that the garments are unused.
_Avoid_: Idle garments, unused garments, waste

## Circularity

**Repair**:
One completed fix to a garment at the laundry, of one repair type.
_Avoid_: Mend, fix, alteration

**Replacement postponed**:
A new garment purchase pushed later because a garment was repaired. Always an estimate.
_Avoid_: Avoided purchase, saved garment

**Textile waste**:
Worn-out textiles the laundry discards. A Customer's figure is an allocated share, not a measured amount.
_Avoid_: Scrap, garment waste

**Treatment route**:
What happens to textile waste: recycling, reuse, energy recovery or incineration.
_Avoid_: Disposal method, waste stream

## Environmental impact

**Footprint**:
The water, energy and emissions of washing a Customer's textiles. A Customer's figure is its allocated share of laundry totals, not a measured amount.
_Avoid_: Impact, consumption

**Baseline**:
The alternative way of washing the same textiles that a handprint compares against: outsourced local laundry (the default), home washing or in-house laundry.
_Avoid_: Benchmark, reference scenario

**Handprint**:
The water, energy or emissions saved by the circular service compared with a baseline. Always stated with its baseline.
_Avoid_: Savings, positive impact, avoided impact

**Public reference**:
A published figure about Lindström or the textile service industry, shown as context next to a Customer's KPIs. It never stands in for a Customer's own value.
_Avoid_: Benchmark, industry average

## In this repository

How the terms above appear in `data/processed/*.json`, `scripts/preprocess.py` and `lib/data.ts`.

- Every KPI, opportunity signal and period comparison has an `id` that is the snake_case of its catalogue name, for example `on_time_service_cycle_share`, `allocated_garments_with_no_scan_activity`, `garments_in_circulation`.
- The _Avoid_ terms never appear in JSON keys, TS identifiers or labels. There is no `idle_garments`, `complaints` or `rag_status`.
- One exception: a workbook column copied as it is keeps its workbook name, so `source_fields` always matches the workbook. Examples are `priority_theme`, `confidence` and `category`. A key the pipeline creates itself follows the rule above.
- One more exception: the caveat "Baseline factors are illustrative. Savings may be overstated." on Energy saved and Emissions saved keeps the wording of ADR 0007. Every other label says "saved", for example Water saved.
- `baseline` always means the washing alternative: `B_LOCAL` (default), `B_HOME`, `B_INHOUSE`. The period a value is compared against is `comparison_period`, and the parameter that picks it is `compare_to` (`previous_period`, `h2_vs_h1`, `none`).
- `view` is `KAM`, `Customer` or `Both`. `review_part` is `Look back`, `Show value`, `Build trust`, `Look forward` or `Agree actions`.
- Data status values used by the workbook and the catalogue: `SYNTHETIC`, `SYNTHETIC_ESTIMATE`, `SYNTHETIC_STRUCTURALLY_REPRESENTATIVE`, `ALLOCATED_ESTIMATE_SYNTHETIC`, `PUBLIC_REFERENCE`, `TEAM_ASSUMPTION`.
- Period comparison labels are `better`, `worse`, `no_clear_change`, `not_evaluated`. Account health ratings are `green`, `amber`, `red`, `not_rated`.
