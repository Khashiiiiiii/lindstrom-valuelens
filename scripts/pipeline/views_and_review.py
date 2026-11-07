"""Views, first screen and exported review: what each view, the first screen and the review contain (#11)."""

from __future__ import annotations

from .catalogue import IMPROVEMENT, catalogue_id
from .workbook import Record


# ADR 0011: the Customer view, and the export that follows it, leave out weak evidence.

KAM = "KAM"
CUSTOMER = "Customer"
BOTH = "Both"


def in_view(item_view: str, view: str) -> bool:
    """Whether an item with this view setting shows in the KAM or the Customer view."""
    return view == KAM or item_view != KAM


def signal_groups(fired: list[Record], signals: dict[str, Record], order: list[str], view: str) -> list[Record]:
    """One Customer's fired signal results in the view, grouped by signal.

    signals maps a signal id to its lever, lever_owner and customer_priority_ids. Groups rank by the
    position of their highest matching priority in order, then by their largest gap. Groups that match
    no priority come last. Results in a group are ordered by gap, largest first.
    """
    by_signal: dict[str, list[Record]] = {}
    for result in fired:
        if in_view(result["view"], view):
            by_signal.setdefault(result["signal_id"], []).append(result)

    def matched(signal_id: str) -> str | None:
        positions = [order.index(p) for p in signals[signal_id]["customer_priority_ids"] if p in order]
        return order[min(positions)] if positions else None

    groups = []
    for signal_id, results in by_signal.items():
        results = sorted(results, key=lambda r: (-r["gap"], r["site_id"], r["product_id"] or ""))
        priority_id = matched(signal_id)
        groups.append({
            "signal_id": signal_id,
            "lever": signals[signal_id]["lever"],
            "lever_owner": signals[signal_id]["lever_owner"],
            "matched_priority_id": priority_id,
            "largest_gap": results[0]["gap"],
            "fired_count": len(results),
            "results": [{"site_id": r["site_id"], "product_id": r["product_id"], "gap": r["gap"]} for r in results],
        })
    groups.sort(key=lambda g: (
        order.index(g["matched_priority_id"]) if g["matched_priority_id"] else len(order),
        -g["largest_gap"],
        g["signal_id"],
    ))
    return [{"rank": i, **g} for i, g in enumerate(groups, start=1)]


MAX_PRIORITY_BLOCKS = 3
ON_COMMON_ROW = "on_common_row"
KAM_ONLY = "kam_only"


def priority_blocks(
    order: list[str],
    headlines: dict[str, list[str]],
    common_kpi_ids: set[str],
    kam_only_kpi_ids: set[str],
    groups: list[Record],
    signals: dict[str, Record],
    view: str,
) -> list[Record]:
    """The first-screen priority row: one block per priority, up to 3, in priority order.

    A block lists its headline KPIs, skipping any on the common row and, in the Customer view, any KAM-only
    KPI. It names the top-ranked signal group in groups whose signal matches the priority, or None.
    """
    blocks = []
    for position, priority_id in enumerate(order[:MAX_PRIORITY_BLOCKS], start=1):
        kpi_ids, skipped = [], []
        for kpi_id in headlines[priority_id]:
            if kpi_id in common_kpi_ids:
                skipped.append({"kpi_id": kpi_id, "reason": ON_COMMON_ROW})
            elif kpi_id in kam_only_kpi_ids and view == CUSTOMER:
                skipped.append({"kpi_id": kpi_id, "reason": KAM_ONLY})
            else:
                kpi_ids.append(kpi_id)
        group = next((g for g in groups if priority_id in signals[g["signal_id"]]["customer_priority_ids"]), None)
        blocks.append({
            "position": position,
            "priority_id": priority_id,
            "kpi_ids": kpi_ids,
            "skipped_kpis": skipped,
            "signal_group_signal_id": group["signal_id"] if group else None,
        })
    return blocks


# References. Every item in this file points into another output with a ref:
#   {"file", "catalogue_ids"}: ids in that file's catalogue.
#   {"file", "data_key"[, "id_field", "ids"]}: a dotted key in that file's data, and optionally items of
#   the list found there, matched on id_field.

_MISSING = object()


def _lookup(data: object, dotted_key: str) -> object:
    for part in dotted_key.split("."):
        if not isinstance(data, dict) or part not in data:
            return _MISSING
        data = data[part]
    return data


def unknown_references(ref: Record, outputs: dict[str, Record]) -> list[str]:
    """What ref names that outputs does not hold, as readable strings."""
    built = outputs.get(ref["file"])
    if built is None:
        return [f"file {ref['file']}"]
    if "catalogue_ids" in ref:
        known = {entry["id"] for entry in built["catalogue"]}
        return [f"{ref['file']} catalogue id {i}" for i in ref["catalogue_ids"] if i not in known]
    found = _lookup(built["data"], ref["data_key"])
    if found is _MISSING:
        return [f"{ref['file']} data key {ref['data_key']}"]
    if "ids" not in ref:
        return []
    known = {item.get(ref["id_field"]) for item in found} if isinstance(found, list) else set()
    return [f"{ref['file']} {ref['data_key']} {ref['id_field']} {i}" for i in ref["ids"] if i not in known]


def check_references(refs: list[Record], outputs: dict[str, Record]) -> None:
    """Fail when a ref names a file, catalogue id, data key or item that outputs does not hold."""
    missing = [text for ref in refs for text in unknown_references(ref, outputs)]
    if missing:
        raise ValueError(f"views-and-review references found in no output: {missing}")


MAX_NEXT_STEPS = 3
PROPOSED = "proposed"
PROPOSED_TEXT = "Proposed, to be agreed in the meeting."


def proposed_next_steps(groups: list[Record]) -> list[Record]:
    """The top 3 signal groups, or fewer, each as 1 proposed next step with its lever owner and no date."""
    return [
        {
            "position": g["rank"],
            "signal_id": g["signal_id"],
            "lever": g["lever"],
            "lever_owner": g["lever_owner"],
            "results": [{"site_id": r["site_id"], "product_id": r["product_id"]} for r in g["results"]],
            "status": PROPOSED,
            "status_text": PROPOSED_TEXT,
        }
        for g in groups[:MAX_NEXT_STEPS]
    ]


# Spec tuples, built with their ids in place. Every ref is checked against the other outputs.


def catalogue_ref(file: str, *ids: str) -> Record:
    return {"file": file, "catalogue_ids": list(ids)}


def data_ref(file: str, data_key: str, id_field: str | None = None, ids: list[str] | None = None) -> Record:
    ref: Record = {"file": file, "data_key": data_key}
    if id_field:
        ref["id_field"], ref["ids"] = id_field, list(ids or [])
    return ref


def item(name: str, text: str, refs: list[Record], **extra: object) -> Record:
    """An entry of a view list, tile list, Data transparency list or review part list."""
    return {"id": catalogue_id(name), "name": name, "text": text, "refs": refs, **extra}


MASTER = "master-data"
SERVICE = "service-kpis"
FOOTPRINT = "footprint-handprint-kpis"
OPERATIONAL = "operational-circularity-kpis"
PUBLIC = "public-reference"
HEALTH = "account-health"
COMPARISONS = "period-comparisons"
PRIORITIES = "customer-priorities"
SIGNALS = "opportunity-signals"
THIS_FILE = "views-and-review"

IMPROVEMENT_IDS = ("improvement_on_time_service_cycles", "improvement_service_requests", "improvement_scan_coverage")

KAM_ONLY_ITEMS: tuple[Record, ...] = (
    item(
        "Account health",
        "Decided in the account health thresholds ticket.",
        [catalogue_ref(HEALTH, "account_health", "account_health_on_time_service_cycle_share",
                       "account_health_service_requests_per_100_wearers_per_month", "account_health_scan_coverage")],
    ),
    item(
        "Turnaround by stage",
        "Decided in the service performance and adoption KPIs ticket.",
        [catalogue_ref(SERVICE, "turnaround_by_stage")],
    ),
    item("Dashboard emphasis", "Decided in the industry KPIs ticket.", [data_ref(PRIORITIES, "dashboard_emphasis")]),
    item(
        "Improvement Site grain",
        "Site results are within what chance gives. The Customer view shows Customer grain only, which reads "
        "\"no clear change\" on all 3 comparisons in 2025.",
        [catalogue_ref(COMPARISONS, *IMPROVEMENT_IDS)],
    ),
    item(
        "Service request rate above peers",
        "Opportunity signal 4 mostly flags small Sites in this data, which is weak evidence to show a Customer.",
        [catalogue_ref(SIGNALS, "service_request_rate_above_peers")],
    ),
    item(
        "Signal results that did not fire or were not evaluated",
        "The Customer view shows fired results only, each with its lever and lever owner.",
        [data_ref(SIGNALS, "evaluations")],
    ),
    item("Full Data transparency", "The Customer view shows the Customer version of Data transparency.", []),
)

DATA_STATUS_LEGEND: tuple[Record, ...] = (
    {"data_status": "SYNTHETIC", "text": "Synthetic data from the workbook, not real Customer data."},
    {"data_status": "SYNTHETIC_ESTIMATE", "text": "An estimate calculated from synthetic data and an assumption."},
    {"data_status": "SYNTHETIC_STRUCTURALLY_REPRESENTATIVE",
     "text": "Synthetic values with a realistic structure, not approved figures."},
    {"data_status": "ALLOCATED_ESTIMATE_SYNTHETIC",
     "text": "The Customer's share of a laundry total, allocated by washed kg, not measured at the Site."},
    {"data_status": "PUBLIC_REFERENCE",
     "text": "A published figure shown as context. It never stands in for a Customer's own value."},
    {"data_status": "TEAM_ASSUMPTION",
     "text": "A threshold or factor the team set where no source gives one. It can be changed."},
)

DATA_GAPS: tuple[Record, ...] = (
    item("Customer Experience", "The workbook holds no CSAT or NPS survey results.",
         [data_ref(HEALTH, "customer_experience_gap")]),
    item("Contract SLAs", "No contract service level is in the data. On-time thresholds are team assumptions.",
         [data_ref(PUBLIC, "gaps", "id", ["on_time_service_cycle_target"])]),
    item("Cost", "The data holds no Customer cost or price, so Financial Value is deferred.",
         [data_ref(PRIORITIES, "cost_note")]),
    item("Hygiene", "The workbook holds no hygiene data.", [data_ref(PRIORITIES, "term_map", "term", ["Hygiene"])]),
    item("Safety", "The workbook holds no safety data.", [data_ref(PRIORITIES, "term_map", "term", ["Safety"])]),
    item("Compliance", "The workbook holds no compliance data.",
         [data_ref(PRIORITIES, "term_map", "term", ["Compliance"])]),
)

CUSTOMER_TRANSPARENCY: tuple[Record, ...] = (
    item(
        "Baseline used",
        "The washing alternative every handprint value is compared against: outsourced local laundry (B_LOCAL) "
        "by default, or the one the user chose.",
        [data_ref(MASTER, "baselines", "baseline_id", ["B_LOCAL", "B_HOME", "B_INHOUSE"]),
         data_ref(FOOTPRINT, "baselines.default_baseline_id")],
    ),
    item(
        "Assumption list",
        "The assumptions A001 to A005 with their labels, and the TEAM_ASSUMPTION label on every threshold and "
        "factor the team set.",
        [data_ref(MASTER, "assumptions", "assumption_id", ["A001", "A002", "A003", "A004", "A005"])],
    ),
    item("Data status legend", "What each data status label means.", [], entries=list(DATA_STATUS_LEGEND)),
    item(
        "Data gaps",
        "What the data does not hold, so no figure is shown for it.",
        [ref for gap in DATA_GAPS for ref in gap["refs"]],
        entries=list(DATA_GAPS),
    ),
)

THRESHOLDS_AND_GUARDS = "thresholds_and_guards"

KAM_TRANSPARENCY_ADDITIONS: tuple[Record, ...] = (
    item("Laundry water and energy factors", "Water and energy per washed kg, by laundry and month.",
         [data_ref(FOOTPRINT, "transparency.laundry_month_factors")]),
    item("Laundry waste factors", "Textile waste per washed kg, by laundry.",
         [data_ref(OPERATIONAL, "laundry_waste_factors")]),
    item("Process CO2e per kWh", "Process CO2e per kWh by laundry, set by the country grid.",
         [data_ref(FOOTPRINT, "transparency.laundry_process_co2e_per_kwh")]),
    item("Baseline factors and dataset actuals against public figures",
         "The baseline factors and the dataset's laundry actuals set against public figures, with the low case.",
         [data_ref(FOOTPRINT, "transparency.public_figure_ids"), data_ref(FOOTPRINT, "baselines.low_cases")]),
    item("Group emissions intensity notes",
         "The 13% note and the Johnson Service Group note on the group emissions intensity context line.",
         [data_ref(PUBLIC, "context_lines.group_emissions_intensity.kam_notes")]),
    item("January 2026 cycles", "Sampled service cycles delivered in January 2026 fall outside every 2025 period.",
         [data_ref(SERVICE, "data_transparency_notes", "id", ["cycles_delivered_in_2026_01"])]),
    item("Thresholds and guards", "Every threshold and guard with its rationale, all TEAM_ASSUMPTION values.",
         [data_ref(HEALTH, "defaults"), data_ref(COMPARISONS, "defaults"), data_ref(SIGNALS, "defaults")]),
)


def tile(name: str, brief_candidate: str, text: str, refs: list[Record]) -> Record:
    return item(name, text, refs, brief_candidate=brief_candidate)


SAVED_TILE = "emissions_saved_and_water_saved"
OVERSTATED = "may be overstated"

COMMON_TILES: tuple[Record, ...] = (
    tile("Site count", "Delivery sites", "The Customer's Sites, an Account context figure.",
         [data_ref(MASTER, "sites")]),
    tile("Active wearers", "Active users/wearers", "Monthly average over the period.",
         [catalogue_ref(SERVICE, "active_wearers")]),
    tile("Garments in circulation", "Garments in circulation", "Monthly average over the period.",
         [catalogue_ref(SERVICE, "garments_in_circulation")]),
    tile("Washed kg", "Service activity", "Washed kg over the period.", [catalogue_ref(FOOTPRINT, "washed_kg")]),
    tile("Repairs", "Repair activity", "Completed repairs over the period.",
         [catalogue_ref(OPERATIONAL, "repairs")]),
    tile("On-time service cycle share", "Service-request performance", "Share of sampled cycles on time.",
         [catalogue_ref(SERVICE, "on_time_service_cycle_share")]),
    tile("Service requests per 100 wearers", "Service-request performance", "Per month over the period.",
         [catalogue_ref(SERVICE, "service_requests_per_100_wearers")]),
    tile("Emissions saved and Water saved", "Emissions and water impact",
         "Each value names its baseline and carries the \"may be overstated\" caveat where it applies.",
         [catalogue_ref(FOOTPRINT, "emissions_saved", "water_saved"), data_ref(MASTER, "baselines"),
          data_ref(MASTER, "default_baseline_id")]),
    tile("Optimisation potential", "Optimisation potential",
         "The count of fired signal results in the view, with the top-ranked signal group named.",
         [data_ref(SIGNALS, "evaluations")]),
)

KAM_ADDITIONS: tuple[Record, ...] = (
    item("Account health", "The account health rating.", [catalogue_ref(HEALTH, "account_health")]),
    item("Dashboard emphasis", "The workbook's dashboard_emphasis text for the Customer's industry.",
         [data_ref(PRIORITIES, "dashboard_emphasis")]),
)

# Headline KPIs per Customer priority, in the fixed priority list order.
HEADLINES: tuple[Record, ...] = (
    {"priority_id": "water", "kpi_ids": ["water_use_allocated", "washes_per_garment"], "notes": []},
    {"priority_id": "emissions",
     "kpi_ids": ["emissions_allocated", "energy_saved", "avoided_product_co2e_estimated"],
     "notes": ["Avoided product CO2e (estimated) is shown apart from Emissions saved and never added to it."]},
    {"priority_id": "circularity",
     "kpi_ids": ["repair_rate", "replacements_postponed_estimated", "recycled_or_reused_share"], "notes": []},
    {"priority_id": "service_reliability",
     "kpi_ids": ["turnaround_hours_median", "late_service_cycles", "service_request_free_site_months"],
     "notes": ["Late service cycles are shown with the sampled cycles behind them."]},
    {"priority_id": "garment_utilisation",
     "kpi_ids": ["garments_per_wearer", "scan_coverage", "allocated_garments_with_no_scan_activity"], "notes": []},
    {"priority_id": "traceability",
     "kpi_ids": ["scan_coverage", "allocated_garments_with_no_scan_activity", "turnaround_by_stage"],
     "notes": ["Turnaround by stage is KAM view only."]},
    {"priority_id": "improvement", "kpi_ids": list(IMPROVEMENT_IDS),
     "notes": ["The 3 period comparisons at Customer grain."]},
)

PRIORITY_BLOCK_RULES = [
    "One block for each of the Customer's priorities, up to 3, in priority order.",
    "A block skips headline KPIs already on the common row.",
    "In the Customer view a block skips KAM-only KPIs.",
    "A block shows the top fired signal group that matches its priority, if one exists.",
    "When the user changes the priorities, the blocks change with them.",
]

SIGNAL_GROUP_RULES = [
    "Fired signal results are grouped by signal. A group shows 1 lever, its lever owner and the Sites "
    "(and products) it fired on.",
    "Groups rank by the position of their highest matching Customer priority, then by their largest relative gap.",
    "Groups that match no priority come last.",
    "The Customer view and the export leave out signal 4.",
    "The signal tool still returns one result per Site.",
]

EVIDENCE_AND_VALUE = "evidence_and_value"
FUTURE_PLANNING = "future_planning"
SPLIT = {EVIDENCE_AND_VALUE: 0.65, FUTURE_PLANNING: 0.35}


def part(name: str, split_group: str, text: str, evidence_areas: list[str], refs: list[Record]) -> Record:
    return item(name, text, refs, split_group=split_group, evidence_areas=evidence_areas)


REVIEW_PARTS: tuple[Record, ...] = (
    part("Look back", EVIDENCE_AND_VALUE, "Account context, Service Performance and Service Adoption.",
         ["Account context", "Service Performance", "Service Adoption"], [data_ref(MASTER, "customers")]),
    part("Show value", EVIDENCE_AND_VALUE,
         "Operational Value, Sustainability Value with the PUBLIC_REFERENCE context line, and the Financial "
         "Value note: deferred, because the data holds no Customer cost or price.",
         ["Operational Value", "Sustainability Value", "Financial Value"],
         [data_ref(PUBLIC, "context_lines.group_emissions_intensity")]),
    part("Build trust", EVIDENCE_AND_VALUE,
         "Data transparency, Customer version, including the Customer Experience data gap.",
         ["Data transparency", "Customer Experience"], [data_ref(HEALTH, "customer_experience_gap")]),
    part("Look forward", FUTURE_PLANNING,
         "Improvement at Customer grain, and every fired signal group in rank order.",
         ["Improvement"], [catalogue_ref(COMPARISONS, *IMPROVEMENT_IDS)]),
    part("Agree actions", FUTURE_PLANNING, "Up to 3 proposed next steps.", [], []),
)

REVIEW_PART_NAMES = [p["name"] for p in REVIEW_PARTS]
SITE_BREAKDOWN_PARTS = ("Look back", "Show value")
VIEW_NAMES = [KAM, CUSTOMER, BOTH]

REVIEW_RULES = [
    "The export follows the Customer view's content rules: no account health, no KAM-only items and the "
    "Customer version of Data transparency.",
    "Look back and Show value hold every Customer-view KPI at Customer grain. The KPIs in the Customer's "
    "priority blocks also get a Site breakdown.",
    "65% and 35% are a page-count target for the session that builds the export. Slide counts and layout are "
    "out of scope.",
]

NEXT_STEP_RULES = [
    "The top 3 signal groups, or fewer if fewer fire, each become 1 proposed next step.",
    "Each has the signal's lever owner and no date.",
    PROPOSED_TEXT,
]


def rule_entry(name: str, definition: str, review_part: str, source_fields: list[str], caveats: list[str]) -> Record:
    return {
        "id": catalogue_id(name),
        "name": name,
        "evidence_area": IMPROVEMENT[0],
        "core_or_industry": "Core KPI",
        "customer_question": IMPROVEMENT[1],
        "definition": definition,
        "source_fields": source_fields,
        "grain": "Customer",
        "view": BOTH,
        "review_part": review_part,
        "data_status": "SYNTHETIC",
        "assumptions": [],
        "caveats": caveats,
    }


def views_catalogue(signal_source_fields: list[str]) -> list[Record]:
    thresholds = "Signal thresholds and guards are TEAM_ASSUMPTION values."
    return [
        rule_entry(
            "Optimisation potential",
            "The count of fired opportunity signal results in the view, with the top-ranked signal group named. "
            "The Customer view leaves out signal 4.",
            "Look forward", signal_source_fields,
            [thresholds, "It counts Sites to discuss, not an amount saved."],
        ),
        rule_entry(
            "Signal group",
            "The fired results of one opportunity signal for one Customer, with 1 lever, its lever owner and the "
            "Sites (and products) it fired on. Groups rank by the position of their highest matching Customer "
            "priority, then by their largest relative gap. Groups that match no priority come last.",
            "Look forward", signal_source_fields, [thresholds],
        ),
        rule_entry(
            "Proposed next step",
            "The lever of one of the top 3 signal groups, or fewer if fewer fire, with the signal's lever owner. "
            "Marked proposed, to be agreed in the meeting. It has no date.",
            "Agree actions", signal_source_fields, [PROPOSED_TEXT],
        ),
    ]


# Checks on the other outputs. Each stops the build.


def _walk(value: object):
    if isinstance(value, dict):
        for key, child in value.items():
            yield key, child
            yield from _walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from _walk(child)


def check_catalogue_views_and_parts(outputs: dict[str, Record]) -> None:
    """Fail when a catalogue entry in any output lacks a known view or review_part."""
    bad = [
        (name, entry.get("id"), entry.get("view"), entry.get("review_part"))
        for name, built in outputs.items()
        for entry in built["catalogue"]
        if entry.get("view") not in VIEW_NAMES or entry.get("review_part") not in REVIEW_PART_NAMES
    ]
    if bad:
        raise ValueError(f"catalogue entries without a known view or review_part (file, id, view, part): {bad}")


def check_kam_only(outputs: dict[str, Record]) -> None:
    """Fail when a KAM-view catalogue entry is missing from KAM_ONLY_ITEMS, or a listed one is not KAM-only."""
    listed = {(r["file"], i) for it in KAM_ONLY_ITEMS for r in it["refs"] for i in r.get("catalogue_ids", [])}
    entries = {(name, e["id"]): e for name, built in outputs.items() for e in built["catalogue"]}
    unlisted = sorted(key for key, e in entries.items() if e["view"] == KAM and key not in listed)
    not_kam = sorted(
        key for key in listed if key in entries and KAM not in (entries[key]["view"], entries[key].get("site_view"))
    )
    if unlisted or not_kam:
        raise ValueError(f"KAM-only list out of step with the catalogues: unlisted {unlisted}, not KAM {not_kam}")


def check_data_status_legend(outputs: dict[str, Record]) -> None:
    """Fail when an output uses a data status the legend does not explain."""
    legend = {row["data_status"] for row in DATA_STATUS_LEGEND}
    used = {
        value for built in outputs.values() for key, value in _walk(built)
        if key in ("data_status", "threshold_data_status") and isinstance(value, str)
    }
    if used - legend:
        raise ValueError(f"data statuses missing from the legend: {sorted(used - legend)}")


def check_headlines(outputs: dict[str, Record], kpi_files: dict[str, str]) -> None:
    """Fail when a headline KPI is in no catalogue, or the priorities differ from the Customer priority list."""
    priority_ids = [e["id"] for e in outputs[PRIORITIES]["catalogue"]]
    unknown = [i for h in HEADLINES for i in h["kpi_ids"] if i not in kpi_files]
    if unknown or [h["priority_id"] for h in HEADLINES] != priority_ids:
        raise ValueError(f"headline KPIs: unknown ids {unknown}, priorities differ from {priority_ids}")


# Builder.


def all_refs() -> list[Record]:
    items = [*KAM_ONLY_ITEMS, *CUSTOMER_TRANSPARENCY, *KAM_TRANSPARENCY_ADDITIONS, *COMMON_TILES, *KAM_ADDITIONS,
             *REVIEW_PARTS]
    return [ref for it in items for ref in it["refs"]]


def thresholds_and_guards(outputs: dict[str, Record]) -> list[Record]:
    """Every catalogue entry with a TEAM_ASSUMPTION threshold, with its rationale."""
    return [
        {"file": name, "catalogue_id": e["id"], "rationale": e["rationale"]}
        for name, built in outputs.items()
        for e in built["catalogue"]
        if e.get("threshold_data_status")
    ]


def common_tiles(outputs: dict[str, Record]) -> list[Record]:
    footprint = {e["id"]: e for e in outputs[FOOTPRINT]["catalogue"]}
    tiles = []
    for position, t in enumerate(COMMON_TILES, start=1):
        kpi_ids = [i for r in t["refs"] for i in r.get("catalogue_ids", [])]
        extra: Record = {}
        if t["id"] == SAVED_TILE:
            extra["caveats"] = [
                {"kpi_id": kpi_id, "caveat": c}
                for kpi_id in kpi_ids for c in footprint[kpi_id]["caveats"] if OVERSTATED in c
            ]
        tiles.append({"position": position, **t, "kpi_ids": kpi_ids, **extra})
    return tiles


def review_parts(outputs: dict[str, Record]) -> list[Record]:
    """The 5 parts, each with the Customer-view catalogue entries of every output that sit in it."""
    parts = []
    for p in REVIEW_PARTS:
        refs = []
        for name, built in outputs.items():
            ids = [e["id"] for e in built["catalogue"] if e["review_part"] == p["name"] and e["view"] != KAM]
            if ids:
                refs.append(catalogue_ref(name, *ids))
        parts.append({**p, "catalogue_refs": refs})
    return parts


def customer_defaults(
    customer_id: str,
    order: list[str],
    fired: list[Record],
    signals: dict[str, Record],
    common_kpi_ids: set[str],
    kam_only_kpi_ids: set[str],
    evidence_kpi_ids: set[str],
) -> Record:
    """One Customer's resolved first screen and review content in each view, for its default priorities.

    The export gives a Site breakdown for the Customer view's priority block KPIs in Look back and Show value.
    """
    headlines = {h["priority_id"]: h["kpi_ids"] for h in HEADLINES}
    own = [r for r in fired if r["customer_id"] == customer_id]
    views = {}
    for view in (KAM, CUSTOMER):
        groups = signal_groups(own, signals, order, view)
        views[view] = {
            "optimisation_potential": {
                "fired_count": sum(g["fired_count"] for g in groups),
                "signal_count": len(groups),
                "top_signal_group_signal_id": groups[0]["signal_id"] if groups else None,
            },
            "signal_groups": groups,
            "priority_blocks": priority_blocks(order, headlines, common_kpi_ids, kam_only_kpi_ids, groups, signals, view),
            "proposed_next_steps": proposed_next_steps(groups),
        }
    blocks = views[CUSTOMER]["priority_blocks"]
    return {
        "customer_id": customer_id,
        "priority_ids": list(order),
        "views": views,
        "export": {
            "follows_view": CUSTOMER,
            "site_breakdown_kpi_ids": list(dict.fromkeys(i for b in blocks for i in b["kpi_ids"] if i in evidence_kpi_ids)),
        },
    }


def build_views_and_review(outputs: dict[str, Record]) -> Record:
    """Build from the other outputs, which are checked first. An unknown id stops the build."""
    kpi_files = {e["id"]: name for name, built in outputs.items() for e in built["catalogue"]}
    check_references(all_refs(), outputs)
    check_headlines(outputs, kpi_files)
    check_kam_only(outputs)
    check_data_status_legend(outputs)

    signal_entries = outputs[SIGNALS]["catalogue"]
    catalogue = views_catalogue(sorted({f for e in signal_entries for f in e["source_fields"]}))
    check_catalogue_views_and_parts({**outputs, THIS_FILE: {"catalogue": catalogue}})

    signals = {e["id"]: e for e in signal_entries}
    fired = [r for e in outputs[SIGNALS]["data"]["evaluations"] for r in e["results"] if r["fired"]]
    kam_only_kpi_ids = {e["id"] for built in outputs.values() for e in built["catalogue"] if e["view"] == KAM}
    tiles = common_tiles(outputs)
    common_kpi_ids = {i for t in tiles for i in t["kpi_ids"]}
    evidence_kpi_ids = {
        e["id"] for built in outputs.values() for e in built["catalogue"] if e["review_part"] in SITE_BREAKDOWN_PARTS
    }
    kam_transparency = [
        *CUSTOMER_TRANSPARENCY,
        *(
            {**it, "entries": thresholds_and_guards(outputs)} if it["id"] == THRESHOLDS_AND_GUARDS else it
            for it in KAM_TRANSPARENCY_ADDITIONS
        ),
    ]
    return {
        "catalogue": catalogue,
        "data": {
            "period": outputs[SIGNALS]["data"]["defaults"]["period"],
            "views": {
                "default_view": BOTH,
                "default_text": "Every item not listed in kam_only shows in both views, as its own ticket set it.",
                "prompt_answers_text": (
                    "The view applies to prompt answers too. In the Customer view no KAM-only result is returned."
                ),
                "kam_only": list(KAM_ONLY_ITEMS),
                "data_transparency": {
                    "customer": {"items": list(CUSTOMER_TRANSPARENCY)},
                    "kam": {"items": kam_transparency},
                },
            },
            "first_screen": {
                "common_tiles": tiles,
                "kam_additions": list(KAM_ADDITIONS),
                "priority_blocks": {
                    "max_blocks": MAX_PRIORITY_BLOCKS,
                    "rules": PRIORITY_BLOCK_RULES,
                    "headline_kpis": [
                        {**h, "refs": [catalogue_ref(kpi_files[i], i) for i in h["kpi_ids"]]} for h in HEADLINES
                    ],
                },
                "signal_group_rules": SIGNAL_GROUP_RULES,
            },
            "review": {
                "follows_view": CUSTOMER,
                "rules": REVIEW_RULES,
                "split": [
                    {
                        "split_group": group,
                        "page_share": share,
                        "part_ids": [p["id"] for p in REVIEW_PARTS if p["split_group"] == group],
                    }
                    for group, share in SPLIT.items()
                ],
                "parts": review_parts(outputs),
                "proposed_next_step_rules": NEXT_STEP_RULES,
            },
            "defaults_by_customer": [
                customer_defaults(
                    o["customer_id"], o["priority_ids"], fired, signals, common_kpi_ids, kam_only_kpi_ids,
                    evidence_kpi_ids,
                )
                for o in outputs[PRIORITIES]["data"]["default_order"]
            ],
        },
    }
