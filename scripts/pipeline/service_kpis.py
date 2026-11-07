"""Service performance and adoption KPIs (#3)."""

from __future__ import annotations

from .catalogue import ADOPTION, CYCLE_FIELDS, PERFORMANCE, SAMPLE_CAVEAT, catalogue_id
from .facts import (
    ACTIVITY_FIELDS,
    turnaround_stats,
    cycle_rows,
    cycles_outside_data_months_notes,
    month_facts,
    product_presets,
    site_month_facts,
)
from .workbook import Record, Workbook, data_months, data_year


def turnaround_rows(cycles: list[Record], months: list[str], presets: list[Record]) -> list[Record]:
    """Turnaround stats per scope {Customer, Site} x product {all, each product, each preset} x period
    {each data month, the data year}. Cycles delivered outside the data months fall outside every period.
    Combinations with no cycles get no row."""
    year = data_year(months)
    in_period = [c for c in cycles if c["month"] in months]
    product_ids = sorted({c["product_id"] for c in in_period})
    product_scopes = [("all", None, None)]
    product_scopes += [("product", p, {p}) for p in product_ids]
    product_scopes += [("preset", p["preset_id"], set(p["product_ids"])) for p in presets]
    periods = [(m, {m}) for m in months] + [(year, set(months))]

    groups: dict[tuple, list[Record]] = {}
    for cycle in in_period:
        for scope, scope_id in (("customer", cycle["customer_id"]), ("site", cycle["site_id"])):
            for product_scope, product_scope_id, products in product_scopes:
                if products is not None and cycle["product_id"] not in products:
                    continue
                for period, period_months in periods:
                    if cycle["month"] in period_months:
                        key = (scope, scope_id, cycle["customer_id"], product_scope, product_scope_id or "", period)
                        groups.setdefault(key, []).append(cycle)

    rows = []
    for key in sorted(groups):
        scope, scope_id, customer_id, product_scope, product_scope_id, period = key
        rows.append({
            "scope": scope,
            "scope_id": scope_id,
            "customer_id": customer_id,
            "product_scope": product_scope,
            "product_scope_id": product_scope_id or None,
            "period": period,
            **turnaround_stats(groups[key]),
        })
    return rows


SERVICE_GRAIN = "Customer, Site, product, month"

CYCLE_LIMIT_CAVEAT = (
    "The 120-hour limit comes from the synthetic data. A KAM-entered contract target replaces it where one exists."
)
WEARER_CAVEAT = (
    "Assumes every wearer has the most-issued garment type. Summing rows counts a wearer once per garment type."
)
SCAN_CAVEAT = "A reason to investigate, not a finding (customer brief note 2)."

STAGE_FIELDS = [
    "Service_Cycles.pickup_timestamp",
    "Service_Cycles.in_laundry_timestamp",
    "Service_Cycles.out_laundry_timestamp",
    "Service_Cycles.delivered_timestamp",
]

# (evidence area, name, definition, source fields, view, caveats), in catalogue order.
SERVICE_KPIS: tuple[tuple, ...] = (
    (
        PERFORMANCE,
        "On-time service cycle share",
        "On-time cycles divided by all sampled cycles, assigned to the month of delivered_timestamp. "
        "A cycle is on time when cycle_hours is 120 or less.",
        CYCLE_FIELDS,
        "Both",
        [CYCLE_LIMIT_CAVEAT, SAMPLE_CAVEAT],
    ),
    (
        PERFORMANCE,
        "Late service cycles",
        "Count of cycles over 120 hours. Always shown next to the number of sampled cycles, never alone.",
        CYCLE_FIELDS,
        "Both",
        ["Cycle counts fall through the year because of the sample, so the count alone misleads."],
    ),
    (
        PERFORMANCE,
        "Turnaround hours, median",
        "Median cycle_hours of cycles delivered in the period.",
        ["Service_Cycles.cycle_hours"],
        "Both",
        [SAMPLE_CAVEAT],
    ),
    (
        PERFORMANCE,
        "Turnaround hours, 90th percentile",
        "90th percentile of cycle_hours. Describes the spread.",
        ["Service_Cycles.cycle_hours"],
        "Both",
        [SAMPLE_CAVEAT],
    ),
    (
        PERFORMANCE,
        "Turnaround by stage",
        "Median hours for pickup to in-laundry, in-laundry to out-laundry, and out-laundry to delivered.",
        STAGE_FIELDS,
        "KAM",
        [SAMPLE_CAVEAT],
    ),
    (
        PERFORMANCE,
        "Service requests",
        "Sum of service_requests over the period.",
        ["Service_Activity.service_requests"],
        "Both",
        ["The workbook records no type or outcome."],
    ),
    (
        PERFORMANCE,
        "Service requests per 100 wearers",
        "Service requests divided by number of months, divided by monthly average active wearers, times 100.",
        ["Service_Activity.service_requests", "Service_Activity.active_wearers"],
        "Both",
        ["Uses the wearer counting rule: per Site and month, the largest active_wearers across product rows."],
    ),
    (
        PERFORMANCE,
        "Service-request-free Site-months",
        "Share of Site-months with zero service requests.",
        ["Service_Activity.service_requests"],
        "Both",
        ["Replaces \"service-request-free days\" from Industry_Priorities, because no daily data exists."],
    ),
    (
        ADOPTION,
        "Active wearers",
        "Per Site and month, the largest active_wearers across the Site's product rows. A Customer is the sum of "
        "its Sites. At product grain, the row value. Over a period, the monthly average.",
        ["Service_Activity.active_wearers"],
        "Both",
        [WEARER_CAVEAT],
    ),
    (
        ADOPTION,
        "Garments per wearer",
        "Allocated pieces across all products divided by active wearers. "
        "Example: Helsinki, January, 2,132 divided by 654 is 3.3.",
        ["Service_Activity.allocated_pieces", "Service_Activity.active_wearers"],
        "Both",
        [WEARER_CAVEAT],
    ),
    (
        ADOPTION,
        "Scan coverage",
        "Active assets scanned divided by allocated pieces.",
        ["Service_Activity.active_assets_scanned", "Service_Activity.allocated_pieces"],
        "Both",
        [SCAN_CAVEAT],
    ),
    (
        ADOPTION,
        "Allocated garments with no scan activity",
        "Allocated pieces minus active assets scanned, as a count.",
        ["Service_Activity.allocated_pieces", "Service_Activity.active_assets_scanned"],
        "Both",
        [
            "The garments may be spares, not yet picked up, or not needing a wash that month (customer brief note 2).",
            "Shown to the Customer because returning garments that are not needed saves money.",
        ],
    ),
    (
        ADOPTION,
        "Washes per garment",
        "Washed pieces divided by allocated pieces, per month. Shown as a number (\"2.6 washes per garment per "
        "month\"), not as the source washing_pct. Aggregated as total washed over total allocated.",
        ["Service_Activity.washed_pieces", "Service_Activity.allocated_pieces"],
        "Both",
        ["Never an average of row percentages."],
    ),
    (
        ADOPTION,
        "Garments in circulation",
        "Monthly average of allocated_pieces across all products, rounded to a whole number.",
        ["Service_Activity.allocated_pieces"],
        "Both",
        ["Garments assigned to the Customer, not garments in use."],
    ),
)


def service_catalogue() -> list[Record]:
    """The 14 Service Performance and Service Adoption KPIs, in SERVICE_KPIS order."""
    return [
        {
            "id": catalogue_id(name),
            "name": name,
            "evidence_area": area,
            "core_or_industry": "Core KPI",
            "customer_question": question,
            "definition": definition,
            "source_fields": list(source_fields),
            "grain": SERVICE_GRAIN,
            "view": view,
            "review_part": "Look back",
            "data_status": "SYNTHETIC",
            "assumptions": [],
            "caveats": list(caveats),
        }
        for (area, question), name, definition, source_fields, view, caveats in SERVICE_KPIS
    ]


def build_service_kpis(wb: Workbook) -> Record:
    months = data_months(wb)
    activity = wb.records("Service_Activity")
    cycles = cycle_rows(wb.records("Service_Cycles"))
    presets = product_presets({p["product_id"] for p in wb.records("Products")})
    return {
        "catalogue": service_catalogue(),
        "data": {
            "activity": month_facts(activity, ["customer_id", "site_id", "product_id"], ACTIVITY_FIELDS),
            "site_month": site_month_facts(activity),
            "cycles": month_facts(cycles, ["customer_id", "site_id", "product_id"], ["cycles", "late_cycles"]),
            "data_transparency_notes": cycles_outside_data_months_notes(cycles, months),
            "turnaround": turnaround_rows(cycles, months, presets),
        },
    }
