"""KPI catalogue entry parts that more than one output file uses (#1)."""

from __future__ import annotations

from .workbook import Record, split_topics


OPERATIONAL_VALUE = ("Operational Value", "Is the service making operations better?")
SUSTAINABILITY_VALUE = ("Sustainability Value", "What environmental value are we creating together?")
PERFORMANCE = ("Service Performance", "Is the service reliable?")
ADOPTION = ("Service Adoption", "Are we using the service effectively?")
IMPROVEMENT = ("Improvement", "Are the issues we raise being solved?")

SAMPLE_CAVEAT = "Based on a sample of tracked garments."
CYCLE_FIELDS = ["Service_Cycles.cycle_hours", "Service_Cycles.performance_flag", "Service_Cycles.delivered_timestamp"]


def kpi(
    id: str,
    name: str,
    area: tuple[str, str],
    definition: str,
    source_fields: list[str],
    grain: str,
    data_status: str,
    assumptions: list[str],
    caveats: list[str],
) -> Record:
    """A Core KPI catalogue entry shown in both views, in the Show value part of the review."""
    return {
        "id": id,
        "name": name,
        "evidence_area": area[0],
        "core_or_industry": "Core KPI",
        "customer_question": area[1],
        "definition": definition,
        "source_fields": source_fields,
        "grain": grain,
        "view": "Both",
        "review_part": "Show value",
        "data_status": data_status,
        "assumptions": assumptions,
        "caveats": caveats,
    }


def catalogue_id(name: str) -> str:
    """The snake_case id of a catalogue name, for example "Turnaround hours, median" -> "turnaround_hours_median"."""
    words = "".join(ch if ch.isalnum() else " " for ch in name.lower()).split()
    return "_".join(words)


def check_kpi_references(outputs: dict[str, Record]) -> None:
    """Fail when a catalogue entry's kpi_ids names an id that no other output's catalogue holds.

    Ids from the entry's own file do not count, so a Customer priority cannot list another priority as a KPI.
    """
    ids = {name: {entry["id"] for entry in built["catalogue"]} for name, built in outputs.items()}
    missing = [
        (name, entry["id"], kpi_id)
        for name, built in outputs.items()
        for entry in built["catalogue"]
        for kpi_id in entry.get("kpi_ids", [])
        if not any(kpi_id in known for other, known in ids.items() if other != name)
    ]
    if missing:
        raise ValueError(f"KPI ids found in no catalogue (file, entry, id): {missing}")


# Customer priorities (ADR 0006): the fixed list, the source-term map and the default order.
# Customer priorities and opportunity signals both use them.

UNMAPPED = "unmapped"
INDUSTRY_PRIORITIES = "Industry_Priorities"
PRIORITY_TOPICS = "priority_topics"

INDUSTRY_RULE_CAVEAT = "Every KPI is a Core KPI. Industry sets the default priorities and never hides a KPI."
COST_NOTE = "Cost maps to Garment utilisation. Financial Value is deferred, so no euro figure is shown."


def priority(name: str, area: tuple[str, str], source_terms: list[str], kpi_ids: list[str], caveats: list[str]) -> Record:
    """One Customer priority. evidence_area is the area that most of its KPI set belongs to."""
    return {
        "id": catalogue_id(name),
        "name": name,
        "evidence_area": area[0],
        "customer_question": area[1],
        "source_terms": source_terms,
        "kpi_ids": kpi_ids,
        "caveats": [*caveats, INDUSTRY_RULE_CAVEAT],
    }


# The 7 Customer priorities, in the fixed list order. KPI ids come from the other catalogue files;
# preprocess.py stops the build when one is missing. A KPI may sit in more than one set.
PRIORITIES: tuple[Record, ...] = (
    priority(
        "Water",
        SUSTAINABILITY_VALUE,
        ["Water efficiency", "water"],
        ["water_use_allocated", "water_saved", "washed_kg", "washes_per_garment"],
        [],
    ),
    priority(
        "Emissions",
        SUSTAINABILITY_VALUE,
        ["Scope 3 evidence", "emissions"],
        ["emissions_allocated", "emissions_saved", "energy_use_allocated", "energy_saved",
         "avoided_product_co2e_estimated"],
        [],
    ),
    priority(
        "Circularity",
        SUSTAINABILITY_VALUE,
        ["Repair", "Repair and lifetime", "circularity"],
        ["repairs", "repair_rate", "replacements_postponed_estimated", "avoided_product_co2e_estimated",
         "textile_waste_allocated", "textile_waste_by_treatment_route", "recycled_or_reused_share",
         "textile_waste_diverted_from_mixed_waste_estimated"],
        [],
    ),
    priority(
        "Service reliability",
        PERFORMANCE,
        ["Service continuity", "Service reliability", "service performance"],
        ["on_time_service_cycle_share", "late_service_cycles", "turnaround_hours_median",
         "turnaround_hours_90th_percentile", "turnaround_by_stage", "service_requests",
         "service_requests_per_100_wearers", "service_request_free_site_months"],
        [],
    ),
    priority(
        "Garment utilisation",
        ADOPTION,
        ["Cost optimization", "Cost and allocation efficiency", "Garment utilization", "cost"],
        ["garments_per_wearer", "scan_coverage", "allocated_garments_with_no_scan_activity", "washes_per_garment"],
        [COST_NOTE],
    ),
    priority(
        "Traceability",
        PERFORMANCE,
        ["Traceability", "Hygiene and traceability"],
        ["scan_coverage", "turnaround_by_stage", "on_time_service_cycle_share"],
        [],
    ),
    priority(
        "Improvement",
        IMPROVEMENT,
        ["improvement"],
        ["improvement_on_time_service_cycles", "improvement_service_requests", "improvement_scan_coverage"],
        ["The KPI set is the 3 Improvement period comparisons."],
    ),
)

# Source terms with no data behind them. "Hygiene and compliance" and "Safety and availability"
# are Industry_Priorities themes built from these terms, so they map to no priority either.
UNMAPPED_TERMS = (
    "Hygiene",
    "Safety",
    "Compliance",
    "Compliance-ready evidence",
    "Hygiene and compliance",
    "Safety and availability",
)

TERM_MAP: dict[str, str] = {
    **{term: p["id"] for p in PRIORITIES for term in p["source_terms"]},
    **{term: UNMAPPED for term in UNMAPPED_TERMS},
}


def mapped_priority(term: str) -> str:
    """The priority id a source term maps to, or "unmapped". A term missing from the map stops the build."""
    if term not in TERM_MAP:
        raise ValueError(f"source term {term!r} is not in the Customer priority term map")
    return TERM_MAP[term]


def default_order(priority_topics: list[str], industry_ranking: list[str]) -> Record:
    """A Customer's default priorities: its own topics in sheet order, or its industry's ranking when it has none.

    Duplicates keep their first place and unmapped terms are skipped.
    """
    source, terms = (PRIORITY_TOPICS, priority_topics) if priority_topics else (INDUSTRY_PRIORITIES, industry_ranking)
    priority_ids: list[str] = []
    skipped: list[str] = []
    for term in terms:
        priority_id = mapped_priority(term)
        if priority_id == UNMAPPED:
            skipped.append(term)
        elif priority_id not in priority_ids:
            priority_ids.append(priority_id)
    return {"source": source, "priority_ids": priority_ids, "skipped_terms": skipped}


def industry_ranking(industry_priorities: list[Record], industry: str) -> list[str]:
    rows = sorted((r for r in industry_priorities if r["industry"] == industry), key=lambda r: r["priority_rank"])
    return [r["priority_theme"] for r in rows]


def customer_default_orders(customers: list[Record], industry_priorities: list[Record]) -> dict[str, Record]:
    """default_order() per customer_id. customers carry priority_topics as the raw "|"-separated cell."""
    return {
        c["customer_id"]: default_order(
            split_topics(c["priority_topics"]), industry_ranking(industry_priorities, c["industry"])
        )
        for c in customers
    }
