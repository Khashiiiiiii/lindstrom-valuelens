"""Customer priorities: the fixed list, the source-term map and each Customer's default order (#7)."""

from __future__ import annotations

from .catalogue import (
    COST_NOTE,
    INDUSTRY_PRIORITIES,
    PRIORITIES,
    PRIORITY_TOPICS,
    UNMAPPED,
    customer_default_orders,
    mapped_priority,
)
from .workbook import Record, Workbook, split_topics


# ADR 0006: industry only sets the default Customer priorities. Every KPI is a
# Core KPI, and industry never hides one.

BRIEF = "brief"
# Source terms from the customer brief. The others come from the workbook.
BRIEF_TERMS = ("water", "emissions", "circularity", "service performance", "cost", "improvement")

DATA_GAP_NOTE = "The workbook holds no hygiene, safety or compliance data, so the term maps to no Customer priority."


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
    industry_priorities = wb.records("Industry_Priorities")
    orders = customer_default_orders(wb.records("Customers"), industry_priorities)
    customers = wb.records("Customers")
    for customer in customers:
        customer["priority_topics"] = split_topics(customer["priority_topics"])
    return {
        "catalogue": priorities_catalogue(),
        "data": {
            "term_map": term_map(customers, industry_priorities),
            "default_order": [
                {
                    "customer_id": c["customer_id"],
                    "industry": c["industry"],
                    **orders[c["customer_id"]],
                }
                for c in sorted(customers, key=lambda c: c["customer_id"])
            ],
            "dashboard_emphasis": dashboard_emphasis(industry_priorities),
            "cost_note": {"term": "cost", "priority_id": "garment_utilisation", "text": COST_NOTE},
        },
    }
