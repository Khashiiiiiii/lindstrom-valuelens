"""Master data, the shared context every other output file joins against (#2)."""

from __future__ import annotations

from .facts import default_baseline_id, product_presets
from .workbook import Record, Workbook, data_months, split_topics


def site_type_groups(sites: list[Record]) -> list[Record]:
    """Sites per Customer per site_type, ordered by Customer, then site_type."""
    groups: dict[tuple[str, str], list[str]] = {}
    for site in sites:
        groups.setdefault((site["customer_id"], site["site_type"]), []).append(site["site_id"])
    return [
        {"customer_id": customer_id, "site_type": site_type, "site_count": len(ids), "site_ids": sorted(ids)}
        for (customer_id, site_type), ids in sorted(groups.items())
    ]


def build_master_data(wb: Workbook) -> Record:
    customers = wb.records("Customers")
    for customer in customers:
        customer["priority_topics"] = split_topics(customer["priority_topics"])

    baselines = wb.records("Baselines")

    products = wb.records("Products")
    sites = wb.records("Sites")

    return {
        "catalogue": [],
        "data": {
            "assumptions": wb.records("Assumptions"),
            "baselines": baselines,
            "customers": customers,
            "data_quality": wb.records("Data_Quality"),
            "default_baseline_id": default_baseline_id(baselines),
            "industry_priorities": wb.records("Industry_Priorities"),
            "laundries": wb.records("Laundries"),
            "months": data_months(wb),
            "product_presets": product_presets({p["product_id"] for p in products}),
            "products": products,
            "site_type_groups": site_type_groups(sites),
            "sites": sites,
        },
    }
