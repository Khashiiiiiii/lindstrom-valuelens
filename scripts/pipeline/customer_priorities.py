"""Customer priorities: the fixed list, the source-term map and each Customer's default order (#7)."""

from __future__ import annotations

from .catalogue import ADOPTION, IMPROVEMENT, PERFORMANCE, SUSTAINABILITY_VALUE, catalogue_id
from .workbook import Record, Workbook, split_topics


# ADR 0006: industry only sets the default Customer priorities. Every KPI is a
# Core KPI, and industry never hides one.

UNMAPPED = "unmapped"
BRIEF = "brief"
INDUSTRY_PRIORITIES = "Industry_Priorities"
PRIORITY_TOPICS = "priority_topics"

# Source terms from the customer brief. The others come from the workbook.
BRIEF_TERMS = ("water", "emissions", "circularity", "service performance", "cost", "improvement")

INDUSTRY_RULE_CAVEAT = "Every KPI is a Core KPI. Industry sets the default priorities and never hides a KPI."
COST_NOTE = "Cost maps to Garment utilisation. Financial Value is deferred, so no euro figure is shown."
DATA_GAP_NOTE = "The workbook holds no hygiene, safety or compliance data, so the term maps to no Customer priority."


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


def priorities_catalogue() -> list[Record]:
    return [
        {
            "id": p["id"],
            "name": p["name"],
            "evidence_area": p["evidence_area"],
            "core_or_industry": "Core KPI",
            "customer_question": p["customer_question"],
            "definition": (
                f"The Customer priority {p['name']}. Source terms: {', '.join(p['source_terms'])}. "
                "Its KPI set is listed in kpi_ids."
            ),
            "source_fields": ["Customers.priority_topics", "Industry_Priorities.priority_theme"],
            "grain": "Customer",
            "view": "Both",
            "review_part": "Look back",
            "data_status": "SYNTHETIC",
            "assumptions": [],
            "caveats": list(p["caveats"]),
            "source_terms": list(p["source_terms"]),
            "kpi_ids": list(p["kpi_ids"]),
        }
        for p in PRIORITIES
    ]


def term_map(customers: list[Record], industry_priorities: list[Record]) -> list[Record]:
    """Every source term from the brief, Industry_Priorities and priority_topics, with the priority it maps to."""
    sources: dict[str, set[str]] = {}
    for term in BRIEF_TERMS:
        sources.setdefault(term, set()).add(BRIEF)
    for row in industry_priorities:
        sources.setdefault(row["priority_theme"], set()).add(INDUSTRY_PRIORITIES)
    for customer in customers:
        for term in customer["priority_topics"]:
            sources.setdefault(term, set()).add(PRIORITY_TOPICS)
    rows = []
    for term, found in sorted(sources.items(), key=lambda item: item[0].lower()):
        priority_id = mapped_priority(term)
        rows.append({
            "term": term,
            "sources": sorted(found),
            "priority_id": priority_id,
            "note": DATA_GAP_NOTE if priority_id == UNMAPPED else None,
        })
    return rows


def industry_ranking(industry_priorities: list[Record], industry: str) -> list[str]:
    rows = sorted((r for r in industry_priorities if r["industry"] == industry), key=lambda r: r["priority_rank"])
    return [r["priority_theme"] for r in rows]


def dashboard_emphasis(industry_priorities: list[Record]) -> list[Record]:
    """The workbook's dashboard_emphasis texts per industry, as KAM-only illustrative context."""
    return [
        {
            "industry": industry,
            "view": "KAM",
            "illustrative": True,
            "data_status": "SYNTHETIC",
            "texts": [
                {"priority_rank": r["priority_rank"], "term": r["priority_theme"], "text": r["dashboard_emphasis"]}
                for r in sorted(industry_priorities, key=lambda r: r["priority_rank"])
                if r["industry"] == industry
            ],
        }
        for industry in sorted({r["industry"] for r in industry_priorities})
    ]


def build_customer_priorities(wb: Workbook) -> Record:
    customers = wb.records("Customers")
    for customer in customers:
        customer["priority_topics"] = split_topics(customer["priority_topics"])
    industry_priorities = wb.records("Industry_Priorities")
    return {
        "catalogue": priorities_catalogue(),
        "data": {
            "term_map": term_map(customers, industry_priorities),
            "default_order": [
                {
                    "customer_id": c["customer_id"],
                    "industry": c["industry"],
                    **default_order(c["priority_topics"], industry_ranking(industry_priorities, c["industry"])),
                }
                for c in sorted(customers, key=lambda c: c["customer_id"])
            ],
            "dashboard_emphasis": dashboard_emphasis(industry_priorities),
            "cost_note": {"term": "cost", "priority_id": "garment_utilisation", "text": COST_NOTE},
        },
    }
