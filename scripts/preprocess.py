"""Turn the source workbook into the JSON files in data/processed/.

Run: python scripts/preprocess.py [--xlsx <path>] [--out data/processed]

Each output file has the shape {"meta": {...}, "catalogue": [...], "data": {...}}
and is written by one build_<name>() function listed in BUILDERS. The same
workbook always gives byte-identical files: keys are sorted and no timestamp is
written. meta.source_sha256 names the workbook.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
from pathlib import Path
from typing import Any, Callable

import openpyxl

REPO = Path(__file__).resolve().parent.parent
DEFAULT_XLSX = REPO / "data" / "raw" / "Lindstrom_SinceAI_Customer_Value_Synthetic_Data_Pack.xlsx"
DEFAULT_OUT = REPO / "data" / "processed"

Record = dict[str, Any]


# Workbook loading


class Workbook:
    """The source workbook, read once, with each sheet as a list of records keyed by its header row."""

    def __init__(self, path: Path):
        self.path = path
        self.sha256 = hashlib.sha256(path.read_bytes()).hexdigest()
        book = openpyxl.load_workbook(path, read_only=True, data_only=True)
        try:
            self._sheets = {ws.title: _sheet_records(ws) for ws in book.worksheets}
        finally:
            book.close()

    def records(self, sheet: str) -> list[Record]:
        """The sheet's rows in sheet order. Callers get copies, so a builder cannot change another's input."""
        return [dict(row) for row in self._sheets[sheet]]


def _sheet_records(ws) -> list[Record]:
    rows = ws.iter_rows(values_only=True)
    header = next(rows, None) or ()
    keys = [str(h).strip() if h is not None else None for h in header]
    records = []
    for row in rows:
        if all(v is None for v in row):
            continue
        records.append({k: v for k, v in zip(keys, row) if k is not None})
    return records


# Deterministic JSON writer


def write_json(path: Path, payload: Any) -> None:
    """Write sorted-key, 2-space-indented UTF-8 JSON with a trailing newline."""
    text = json.dumps(payload, sort_keys=True, indent=2, ensure_ascii=False, allow_nan=False)
    path.write_text(text + "\n", encoding="utf-8", newline="\n")


# Shared helpers for every builder


# Months

MONTHLY_SHEETS = ("Service_Activity", "Repairs", "Laundry_Resources", "Waste_Circularity", "Customer_Impacts")


def month_key(value: Any) -> str:
    """A month cell as a "YYYY-MM" string. Accepts "2025-01" text or a date."""
    if hasattr(value, "strftime"):
        return value.strftime("%Y-%m")
    text = str(value).strip()
    if len(text) < 7 or text[4] != "-":
        raise ValueError(f"not a YYYY-MM month: {value!r}")
    return text[:7]


def data_months(wb: Workbook) -> list[str]:
    """Every month that the monthly fact sheets hold, in order."""
    return sorted({month_key(row["month"]) for sheet in MONTHLY_SHEETS for row in wb.records(sheet)})


# Period rule (ADR 0002): fact rows store additive components (sums, counts) at
# month grain, so a caller can aggregate any period. A ratio is rebuilt from
# summed totals, never by averaging row ratios. Medians and percentiles do not
# add up, so a builder precomputes them for each grain it needs.

FLOAT_DIGITS = 6


def month_facts(rows: list[Record], keys: list[str], fields: list[str]) -> list[Record]:
    """Sum the additive fields per key and month, ordered by key, then month.

    Float sums are rounded to FLOAT_DIGITS places so float addition noise does not reach the JSON.
    """
    totals: dict[tuple, dict[str, float]] = {}
    for row in rows:
        group = tuple(row[k] for k in keys) + (month_key(row["month"]),)
        sums = totals.setdefault(group, {f: 0 for f in fields})
        for f in fields:
            sums[f] += row[f] or 0
    facts = []
    for group in sorted(totals):
        fact: Record = dict(zip(keys, group[:-1]))
        fact["month"] = group[-1]
        for f, value in totals[group].items():
            fact[f] = round(value, FLOAT_DIGITS) if isinstance(value, float) else value
        facts.append(fact)
    return facts


def ratio_of_totals(facts: list[Record], numerator: str, denominator: str) -> float | None:
    """sum(numerator) / sum(denominator) over the facts, or None when the denominator sums to 0."""
    den = sum(f[denominator] for f in facts)
    if not den:
        return None
    return sum(f[numerator] for f in facts) / den


# Wearer counting rule (ADR 0003): per Site and month, active wearers are the
# largest active_wearers across that Site's product rows. A Customer is the sum
# of its Sites. Over a period, the figure is the monthly average.


def site_active_wearers(service_activity: list[Record]) -> dict[tuple[str, str], int]:
    """Active wearers per (site_id, month): the largest product row."""
    wearers: dict[tuple[str, str], int] = {}
    for row in service_activity:
        key = (row["site_id"], month_key(row["month"]))
        wearers[key] = max(wearers.get(key, 0), row["active_wearers"])
    return wearers


def customer_active_wearers(service_activity: list[Record]) -> dict[tuple[str, str], int]:
    """Active wearers per (customer_id, month): the sum of its Sites."""
    site_customer = {row["site_id"]: row["customer_id"] for row in service_activity}
    wearers: dict[tuple[str, str], int] = {}
    for (site_id, month), count in site_active_wearers(service_activity).items():
        key = (site_customer[site_id], month)
        wearers[key] = wearers.get(key, 0) + count
    return wearers


def period_average(monthly: dict[tuple[str, str], float], entity_id: str, months: list[str]) -> float:
    """The monthly average of an (entity_id, month) series over the given months. A missing month counts as 0."""
    if not months:
        raise ValueError("a period needs at least one month")
    return sum(monthly.get((entity_id, m), 0) for m in months) / len(months)


# Product presets: named product sets that every ticket taking a product
# parameter shares. They are parameter values, not KPIs (ADR 0006).
PRODUCT_PRESETS: tuple[Record, ...] = (
    {"preset_id": "food_industry_garments", "name": "Food industry garments", "product_ids": ["P1004"]},
    {"preset_id": "safety_garments", "name": "Safety garments", "product_ids": ["P1003", "P1006"]},
    {"preset_id": "healthcare_garments", "name": "Healthcare garments", "product_ids": ["P1005"]},
)


def product_presets(product_ids: set[str]) -> list[Record]:
    """The presets, checked against the workbook's products."""
    presets = []
    for preset in PRODUCT_PRESETS:
        unknown = [p for p in preset["product_ids"] if p not in product_ids]
        if unknown:
            raise ValueError(f"preset {preset['preset_id']} names unknown products {unknown}")
        presets.append({**preset, "product_ids": list(preset["product_ids"])})
    return presets


# Builders: one per output file. Each returns {"catalogue": [...], "data": {...}}.


def split_topics(value: str | None) -> list[str]:
    """Split a "|"-separated topic cell into its topics, in sheet order."""
    if not value:
        return []
    return [t.strip() for t in str(value).split("|") if t.strip()]


def site_type_groups(sites: list[Record]) -> list[Record]:
    """Sites per Customer per site_type, ordered by Customer, then site_type."""
    groups: dict[tuple[str, str], list[str]] = {}
    for site in sites:
        groups.setdefault((site["customer_id"], site["site_type"]), []).append(site["site_id"])
    return [
        {"customer_id": customer_id, "site_type": site_type, "site_count": len(ids), "site_ids": sorted(ids)}
        for (customer_id, site_type), ids in sorted(groups.items())
    ]


def default_baseline_id(baselines: list[Record]) -> str:
    """The one baseline whose selection_status is DEFAULT."""
    defaults = [b["baseline_id"] for b in baselines if b["selection_status"] == "DEFAULT"]
    if len(defaults) != 1:
        raise ValueError(f"expected exactly one DEFAULT baseline, found {defaults}")
    return defaults[0]


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


# Operational and circularity KPIs

# A002 says 1 completed repair postpones 1 replacement. The KPI layer multiplies repair_count by this ratio.
DEFAULT_POSTPONEMENT_RATIO = 1


def repair_facts(repairs: list[Record], products: list[Record]) -> list[Record]:
    """Repairs per Site, product, repair type and month, with the product footprint from Products (A005)."""
    footprint = {p["product_id"]: p["synthetic_product_footprint_kgco2e"] for p in products}
    facts = month_facts(repairs, ["customer_id", "site_id", "product_id", "repair_type"], ["repair_count"])
    for fact in facts:
        fact["product_footprint_kgco2e"] = footprint[fact["product_id"]]
    return facts


TREATMENT_ROUTES = ("recycling", "reuse", "energy_recovery", "incineration")


def allocated_route_key(route: str) -> str:
    return f"allocated_{route}_kg"


def waste_facts(customer_impacts: list[Record], waste_circularity: list[Record]) -> list[Record]:
    """Allocated textile waste per Site, product, laundry and month, split by treatment route (A003).

    Each route is the Customer row's share of laundry washed kg times that laundry's route kg in the month.
    """
    laundry = {(month_key(w["month"]), w["laundry_id"]): w for w in waste_circularity}
    rows = []
    for impact in customer_impacts:
        row = {k: impact[k] for k in ("month", "customer_id", "site_id", "product_id", "laundry_id")}
        row["allocated_textile_waste_kg"] = impact["allocated_textile_waste_kg"]
        route_kg = laundry[(month_key(impact["month"]), impact["laundry_id"])]
        for route in TREATMENT_ROUTES:
            row[allocated_route_key(route)] = impact["share_of_laundry_washed_kg"] * route_kg[f"{route}_kg"]
        rows.append(row)
    fields = ["allocated_textile_waste_kg"] + [allocated_route_key(route) for route in TREATMENT_ROUTES]
    return month_facts(rows, ["customer_id", "site_id", "product_id", "laundry_id"], fields)


def laundry_waste_factors(waste_circularity: list[Record]) -> list[Record]:
    """Grams of textile waste per washed kg for each laundry. For Data transparency only (ADR 0012).

    The factor is fixed per laundry in the workbook, so one row per laundry holds it. A factor
    that changes by month would need month rows, so the build stops instead.
    """
    factors: dict[str, set[float]] = {}
    for row in waste_circularity:
        factors.setdefault(row["laundry_id"], set()).add(row["waste_kg_per_washed_kg"])
    rows = []
    for laundry_id, values in sorted(factors.items()):
        if len(values) != 1:
            raise ValueError(f"waste_kg_per_washed_kg of {laundry_id} changes by month: {sorted(values)}")
        grams = round(values.pop() * 1000, FLOAT_DIGITS)
        rows.append({"laundry_id": laundry_id, "waste_g_per_washed_kg": grams})
    return rows


OPERATIONAL_VALUE = ("Operational Value", "Is the service making operations better?")
SUSTAINABILITY_VALUE = ("Sustainability Value", "What environmental value are we creating together?")
REPAIR_GRAIN = "Customer, Site, product, month, repair type"
WASTE_GRAIN = "Customer, Site, product, month"
ALLOCATED_WASTE_CAVEAT = "The Customer's share of laundry waste by washed kg, not waste measured at the Site."
WASTE_ROUTE_FIELDS = [
    "Customer_Impacts.share_of_laundry_washed_kg",
    *(f"Waste_Circularity.{route}_kg" for route in TREATMENT_ROUTES),
]


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


OPERATIONAL_CIRCULARITY_CATALOGUE: tuple[Record, ...] = (
    kpi(
        "repairs",
        "Repairs",
        OPERATIONAL_VALUE,
        "Sum of repair_count over the period. Repair type is a breakdown, not a separate KPI.",
        ["Repairs.repair_count", "Repairs.repair_type"],
        REPAIR_GRAIN,
        "SYNTHETIC",
        [],
        ["The synthetic repair-type mix is close to flat. Each of the 5 repair types holds about 20% of repairs."],
    ),
    kpi(
        "repair_rate",
        "Repair rate",
        OPERATIONAL_VALUE,
        "Repairs per 1,000 packed pieces. It is summed repairs divided by summed packed_pieces, times 1,000.",
        ["Repairs.repair_count", "Service_Activity.packed_pieces"],
        REPAIR_GRAIN,
        "SYNTHETIC",
        [],
        [
            "Shown as a number per 1,000 packed pieces, never as the source repair_quotient_pct.",
            "Built from summed totals, never by averaging row rates.",
        ],
    ),
    kpi(
        "replacements_postponed_estimated",
        "Replacements postponed (estimated)",
        OPERATIONAL_VALUE,
        "Repairs times the postponement ratio. The ratio is a parameter with default 1 (A002).",
        ["Repairs.repair_count"],
        REPAIR_GRAIN,
        "SYNTHETIC_ESTIMATE",
        ["A002"],
        [
            "Always shown with the A002 label and the postponement ratio used.",
            "Input to avoided product CO2e.",
            "A Lindström UK page (2022) gives about 6 repairs in a garment life of about 50 washes, "
            "so 1 replacement postponed per repair is generous.",
        ],
    ),
    kpi(
        "avoided_product_co2e_estimated",
        "Avoided product CO2e (estimated)",
        SUSTAINABILITY_VALUE,
        "Replacements postponed times the product footprint, in kg CO2e.",
        ["Repairs.repair_count", "Products.synthetic_product_footprint_kgco2e"],
        REPAIR_GRAIN,
        "SYNTHETIC_ESTIMATE",
        ["A002", "A005"],
        [
            "Does not depend on the baseline, because no baseline does systematic repair.",
            "Shown next to Emissions saved and never added to it. "
            "It rests on 2 assumptions rated Low-Medium (A002) and Low (A005).",
        ],
    ),
    kpi(
        "textile_waste_allocated",
        "Textile waste (allocated)",
        SUSTAINABILITY_VALUE,
        "Sum of allocated_textile_waste_kg over the period.",
        ["Customer_Impacts.allocated_textile_waste_kg"],
        WASTE_GRAIN,
        "ALLOCATED_ESTIMATE_SYNTHETIC",
        ["A003"],
        [ALLOCATED_WASTE_CAVEAT, "Comes from the Customer's washed kg and a laundry factor."],
    ),
    kpi(
        "textile_waste_by_treatment_route",
        "Textile waste by treatment route",
        SUSTAINABILITY_VALUE,
        "For each treatment route (recycling, reuse, energy recovery, incineration), the Customer's share of "
        "laundry washed kg times the laundry's route kg, summed over the period.",
        WASTE_ROUTE_FIELDS,
        WASTE_GRAIN,
        "ALLOCATED_ESTIMATE_SYNTHETIC",
        ["A003"],
        [ALLOCATED_WASTE_CAVEAT, "The route mix is a laundry outcome the Customer cannot influence."],
    ),
    kpi(
        "recycled_or_reused_share",
        "Recycled or reused share",
        SUSTAINABILITY_VALUE,
        "Allocated recycling plus reuse kg divided by allocated textile waste kg, from summed totals. "
        "Energy recovery does not count.",
        ["Customer_Impacts.allocated_textile_waste_kg", *WASTE_ROUTE_FIELDS],
        WASTE_GRAIN,
        "ALLOCATED_ESTIMATE_SYNTHETIC",
        ["A003"],
        [ALLOCATED_WASTE_CAVEAT, "Public reference: Lindström recycled 66% of its textile waste in 2025."],
    ),
    kpi(
        "textile_waste_diverted_from_mixed_waste_estimated",
        "Textile waste diverted from mixed waste (estimated)",
        SUSTAINABILITY_VALUE,
        "Allocated recycling plus reuse kg, against A004, where the same kg all goes to mixed waste.",
        [*WASTE_ROUTE_FIELDS, "Baselines.mixed_waste_share"],
        WASTE_GRAIN,
        "ALLOCATED_ESTIMATE_SYNTHETIC",
        ["A003", "A004"],
        [
            ALLOCATED_WASTE_CAVEAT,
            "In kg only, because no CO2e factor for treatment routes exists.",
            "Does not assume that a baseline produces more textile waste.",
        ],
    ),
)


def build_operational_circularity_kpis(wb: Workbook) -> Record:
    return {
        "catalogue": [dict(entry) for entry in OPERATIONAL_CIRCULARITY_CATALOGUE],
        "data": {
            "defaults": {"postponement_ratio": DEFAULT_POSTPONEMENT_RATIO},
            "laundry_waste_factors": laundry_waste_factors(wb.records("Waste_Circularity")),
            "packed_pieces": month_facts(
                wb.records("Service_Activity"), ["customer_id", "site_id", "product_id"], ["packed_pieces"]
            ),
            "repairs": repair_facts(wb.records("Repairs"), wb.records("Products")),
            "waste": waste_facts(wb.records("Customer_Impacts"), wb.records("Waste_Circularity")),
        },
    }


# Service performance and adoption KPIs

# A service cycle over this many hours is late. The limit is built into the
# synthetic data (performance_flag is LATE exactly above it); it is not a contract term.
LATE_CYCLE_HOURS = 120


def cycle_rows(service_cycles: list[Record]) -> list[Record]:
    """Each cycle with its delivered month as "month" and its late flag as a 0/1 count."""
    rows = []
    for cycle in service_cycles:
        late = cycle["cycle_hours"] > LATE_CYCLE_HOURS
        if late != (cycle["performance_flag"] == "LATE"):
            raise ValueError(f"cycle {cycle['asset_id']}/{cycle['cycle_number']}: performance_flag disagrees with cycle_hours")
        rows.append({**cycle, "month": month_key(cycle["delivered_timestamp"]), "cycles": 1, "late_cycles": int(late)})
    return rows


def data_year(months: list[str]) -> str:
    """The one year the data months fall in."""
    years = {m[:4] for m in months}
    if len(years) != 1:
        raise ValueError(f"data months must fall in one year: {months}")
    return years.pop()


def cycles_outside_data_months_notes(cycles: list[Record], months: list[str]) -> list[Record]:
    """Data transparency notes for sampled cycles delivered after the data months."""
    outside: dict[str, int] = {}
    for row in cycles:
        if row["month"] not in months:
            outside[row["month"]] = outside.get(row["month"], 0) + 1
    year = data_year(months)
    return [
        {
            "id": f"cycles_delivered_in_{month.replace('-', '_')}",
            "view": "KAM",
            "text": (
                f"{count} sampled service cycles were delivered in {month}. They are kept in a {month} bucket "
                f"and fall outside every {year} period."
            ),
        }
        for month, count in sorted(outside.items())
    ]


TURNAROUND_DIGITS = 1
CYCLE_STAGES = (
    ("median_pickup_to_in_laundry_hours", "pickup_timestamp", "in_laundry_timestamp"),
    ("median_in_laundry_to_out_laundry_hours", "in_laundry_timestamp", "out_laundry_timestamp"),
    ("median_out_laundry_to_delivered_hours", "out_laundry_timestamp", "delivered_timestamp"),
)


def percentile(values: list[float], q: float) -> float:
    """The q-th quantile (0 to 1) by linear interpolation between closest ranks; q=0.5 is the median."""
    if not values:
        raise ValueError("a percentile needs at least one value")
    ordered = sorted(values)
    pos = (len(ordered) - 1) * q
    low = int(pos)
    high = min(low + 1, len(ordered) - 1)
    return ordered[low] + (ordered[high] - ordered[low]) * (pos - low)


def turnaround_stats(cycles: list[Record]) -> Record:
    """Median and 90th percentile of cycle_hours, and the median hours of each stage, over some cycles."""
    hours = [c["cycle_hours"] for c in cycles]
    stats: Record = {
        "cycles": len(cycles),
        "median_cycle_hours": round(percentile(hours, 0.5), TURNAROUND_DIGITS),
        "p90_cycle_hours": round(percentile(hours, 0.9), TURNAROUND_DIGITS),
    }
    for key, start, end in CYCLE_STAGES:
        stage = [(c[end] - c[start]).total_seconds() / 3600 for c in cycles]
        stats[key] = round(percentile(stage, 0.5), TURNAROUND_DIGITS)
    return stats


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


ACTIVITY_FIELDS = [
    "active_wearers",
    "allocated_pieces",
    "active_assets_scanned",
    "washed_pieces",
    "packed_pieces",
    "service_requests",
]
SITE_MONTH_SUMMED_FIELDS = [f for f in ACTIVITY_FIELDS if f != "active_wearers"]


def site_month_facts(service_activity: list[Record]) -> list[Record]:
    """One row per Site and month: active wearers by the wearer counting rule, the other fields summed."""
    wearers = site_active_wearers(service_activity)
    facts = month_facts(service_activity, ["customer_id", "site_id"], SITE_MONTH_SUMMED_FIELDS)
    for fact in facts:
        fact["active_wearers"] = wearers[(fact["site_id"], fact["month"])]
    return facts


SERVICE_GRAIN = "Customer, Site, product, month"
PERFORMANCE = ("Service Performance", "Is the service reliable?")
ADOPTION = ("Service Adoption", "Are we using the service effectively?")

CYCLE_LIMIT_CAVEAT = (
    "The 120-hour limit comes from the synthetic data. A KAM-entered contract target replaces it where one exists."
)
SAMPLE_CAVEAT = "Based on a sample of tracked garments."
WEARER_CAVEAT = (
    "Assumes every wearer has the most-issued garment type. Summing rows counts a wearer once per garment type."
)
SCAN_CAVEAT = "A reason to investigate, not a finding (customer brief note 2)."

CYCLE_FIELDS = ["Service_Cycles.cycle_hours", "Service_Cycles.performance_flag", "Service_Cycles.delivered_timestamp"]
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


def catalogue_id(name: str) -> str:
    """The snake_case id of a catalogue name, for example "Turnaround hours, median" -> "turnaround_hours_median"."""
    words = "".join(ch if ch.isalnum() else " " for ch in name.lower()).split()
    return "_".join(words)


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


# Public reference figures. The workbook holds none of them, so they are constants.
# Findings and sources: the public reference ranges research of 2026-11-07.

LINDSTROM_REPORT_2025 = (
    "Lindström Sustainability Report 2025, Lindström Oy, published March 2026. "
    "EY limited assurance (ISAE 3000) over E1 climate, E3 water and E5 circular economy."
)
LINDSTROM_REPORT_2025_URL = (
    "https://d2ris6qfzcz0wn.cloudfront.net/wp-content/uploads/2026/03/Lindstrom-Sustainability-Report-2025.pdf"
)
CUSTOMER_BRIEF_NOTE_6 = (
    "Customer brief note 6, peer table in kg CO2e per euro of turnover: "
    "Elis 0.40, Cintas 0.20, Salesianer 0.31, Johnson Service Group 0.38, Lindström 0.28. "
    "The brief names no sources or years."
)
JSG_REPORT_2024 = (
    "Johnson Service Group Sustainability Report 2024. Moderate assurance (AA1000AS v3) by Jacobs."
)
JSG_REPORT_2024_URL = "https://jsg.com/media/2249780/2025-0290-sustainability-report-2024.pdf"
NSW_LAUNDRIES = (
    "NSW Government, Commercial laundries water saving tips. "
    "The page has no date, so the year is the year it was read (2026)."
)
NSW_LAUNDRIES_URL = (
    "https://www.water.dcceew.nsw.gov.au/our-work/projects-and-programs/water-efficiency-program/"
    "water-saving-tips/commerical-laundries"
)
JRC_2017 = (
    "Boyano A. et al. (2017). Ecodesign and Energy Label for Household Washing machines and washer dryers, "
    "preparatory study, final report. JRC108604, EUR 28809 EN, Publications Office of the EU. Table 5.4."
)
JRC_2017_URL = (
    "https://www.energimyndigheten.se/4ae46a/globalassets/energieffektivisering_/jag-ar-saljare-eller-tillverkare/"
    "dokument/produkter-med-krav/tvattmaskiner-hushall/forstudie-revision-tvatt_20171117_jrc108604.pdf"
)
LINDSTROM_UK_2022 = "Lindström UK, The benefits of renting workwear rather than buying, 29.11.2022."
LINDSTROM_UK_2022_URL = "https://lindstromgroup.com/uk/article/the-benefits-of-renting-workwear-rather-than-buying/"

# Where a figure is used. Every figure names at least one.
CONTEXT_LINE = "context_line"
DATA_TRANSPARENCY = "data_transparency"
TEAM_ASSUMPTION_RATIONALE = "team_assumption_rationale"


def public_figure(
    id: str,
    name: str,
    value: float | dict[str, float],
    unit: str,
    scope: str,
    source: str,
    url: str | None,
    page: str | None,
    year: int,
    applicability: str,
    used_in: list[str],
    derived: bool = False,
) -> Record:
    """One citable public figure. value is a number, or {"low": ..., "high": ...} for a range.

    derived is True when the figure is arithmetic on published numbers, not a published number itself.
    """
    return {
        "id": id,
        "name": name,
        "value": value,
        "unit": unit,
        "scope": scope,
        "source": source,
        "url": url,
        "page": page,
        "year": year,
        "applicability": applicability,
        "used_in": used_in,
        "derived": derived,
        "data_status": "PUBLIC_REFERENCE",
    }


PUBLIC_FIGURES: tuple[Record, ...] = (
    # Lindström 2025 report
    public_figure(
        "lindstrom_water_per_washed_kg_group",
        "Lindström water per washed kg, group",
        6.82,
        "L/kg",
        "All Lindström laundries and all 7 service lines, 2025. It was 7.08 L/kg in 2024.",
        LINDSTROM_REPORT_2025, LINDSTROM_REPORT_2025_URL, "47, 53", 2025,
        "Close to the dataset's laundry water of 6.74 L/kg (washed-kg weighted). The dataset's laundries are "
        "workwear laundries, so the workwear figure may fit them better.",
        [DATA_TRANSPARENCY],
    ),
    public_figure(
        "lindstrom_water_per_washed_kg_workwear",
        "Lindström water per washed kg, workwear",
        12.5,
        "L/kg",
        "Lindström workwear laundries only, 2025. It was 13.0 L/kg in 2024.",
        LINDSTROM_REPORT_2025, LINDSTROM_REPORT_2025_URL, "53", 2025,
        "Above the B_LOCAL baseline of 9.5 L/kg and close to the B_INHOUSE baseline of 12.5 L/kg.",
        [DATA_TRANSPARENCY],
    ),
    public_figure(
        "lindstrom_laundry_energy_per_washed_kg",
        "Lindström laundry energy per washed kg",
        0.99,
        "kWh/kg",
        "Energy used in Lindström laundries only, 2025. Excludes Lindström's own vehicles. It was 1.01 in 2024.",
        LINDSTROM_REPORT_2025, LINDSTROM_REPORT_2025_URL, "44", 2025,
        "The dataset's laundry energy (0.70 kWh/kg, washed-kg weighted) is about 30% below it. "
        "The B_LOCAL baseline (1.05 kWh/kg) is close to it.",
        [DATA_TRANSPARENCY],
    ),
    public_figure(
        "lindstrom_emissions_per_washed_kg_scope_1_2",
        "Lindström emissions per washed kg, Scope 1+2",
        0.19,
        "kgCO2e/kg",
        "Lindström group, Scope 1+2, 2025. It was 0.23 in 2024 and 0.30 in 2021.",
        LINDSTROM_REPORT_2025, LINDSTROM_REPORT_2025_URL, "44", 2025,
        "The dataset's laundry process CO2e (0.106 kgCO2e/kg, washed-kg weighted) is below it. "
        "It is the low end of the Scope 1+2 range of large operators.",
        [DATA_TRANSPARENCY, TEAM_ASSUMPTION_RATIONALE],
    ),
    public_figure(
        "lindstrom_emissions_per_washed_kg_scope_1_2_3",
        "Lindström emissions per washed kg, Scope 1+2+3",
        0.71,
        "kgCO2e/kg",
        "Lindström group, Scope 1+2+3, 2025. It was 0.79 in 2024 and 0.90 in 2021.",
        LINDSTROM_REPORT_2025, LINDSTROM_REPORT_2025_URL, "44", 2025,
        "The B_LOCAL process factor (0.62 kgCO2e/kg) is close to this full-scope figure, while the dataset's "
        "laundry actuals are near Scope 1+2 levels. Emissions saved against B_LOCAL may be overstated.",
        [DATA_TRANSPARENCY],
    ),
    public_figure(
        "lindstrom_textile_waste_recycled_share",
        "Lindström textile waste recycled",
        66,
        "%",
        "Lindström group, 2025. It was 69.9% in 2024. The target of 100% by 2025 was missed after stoppages "
        "at recycling partners.",
        LINDSTROM_REPORT_2025, LINDSTROM_REPORT_2025_URL, "54, 61", 2025,
        "A group figure. It never stands in for a Customer's recycled or reused share.",
        [DATA_TRANSPARENCY],
    ),
    public_figure(
        "lindstrom_textiles_repaired",
        "Lindström textiles repaired",
        2_900_000,
        "pieces",
        "Lindström group, 2025. The report says this is not comparable with 2024 data.",
        LINDSTROM_REPORT_2025, LINDSTROM_REPORT_2025_URL, "54", 2025,
        "A group count. It never stands in for a Customer's repairs.",
        [DATA_TRANSPARENCY],
    ),
    public_figure(
        "lindstrom_emissions_per_euro_of_turnover",
        "Lindström emissions per euro of turnover",
        0.281,
        "kgCO2e/EUR",
        "Lindström group, Scope 1+2+3, market-based, net revenue EUR 541.9 million, 2025. Location-based it is "
        "0.296. The customer brief and the context line round it to 0.28.",
        LINDSTROM_REPORT_2025, LINDSTROM_REPORT_2025_URL, "44", 2025,
        "A group intensity. It is never multiplied into a Customer figure, because the data holds no "
        "Customer spend (ADR 0005).",
        [CONTEXT_LINE],
    ),
    # Peer context
    public_figure(
        "lindstrom_emissions_per_euro_gap_to_peer_average",
        "Lindström emissions per euro, gap to the peer average",
        13,
        "% below",
        "0.28 against 0.3225 kg CO2e/EUR, the average of the 4 peers in the customer brief: Elis, Cintas, "
        "Salesianer and Johnson Service Group. Lindström is left out of the average. The brief gives no years "
        "for the peer values, so the year is that of the Lindström value.",
        f"{CUSTOMER_BRIEF_NOTE_6} Lindström figure from the {LINDSTROM_REPORT_2025}", LINDSTROM_REPORT_2025_URL,
        "44", 2025,
        "Only the Lindström value is verified. The Elis, Cintas and Salesianer per-euro values are unverified, "
        "and Scope 3 boundaries differ between operators, so the gap is rough.",
        [CONTEXT_LINE],
        derived=True,
    ),
    public_figure(
        "lindstrom_emissions_per_euro_gap_to_average_with_lindstrom",
        "Lindström emissions per euro, gap to the average with Lindström included",
        10.8,
        "% below",
        "0.28 against the average of the 4 peers and Lindström in the customer brief. The brief gives no years "
        "for the peer values, so the year is that of the Lindström value.",
        f"{CUSTOMER_BRIEF_NOTE_6} Lindström figure from the {LINDSTROM_REPORT_2025}", LINDSTROM_REPORT_2025_URL,
        "44", 2025,
        "A KAM note under the context line uses it, next to the 13% of the line itself.",
        [CONTEXT_LINE],
        derived=True,
    ),
    public_figure(
        "jsg_emissions_per_gbp_of_revenue",
        "Johnson Service Group emissions per pound of revenue",
        0.31,
        "kgCO2e/GBP",
        "Johnson Service Group, 159,948 tCO2e (Scope 1+2+3) over GBP 513.4 million revenue, 2024.",
        JSG_REPORT_2024, JSG_REPORT_2024_URL, "39", 2024,
        "It does not match the customer brief's 0.38 per euro. A pound is worth more than a euro, so JSG's figure "
        "per euro is lower still. The brief may use another year or boundary.",
        [CONTEXT_LINE],
        derived=True,
    ),
    # Industrial laundry water and energy
    public_figure(
        "industrial_laundry_water_per_kg_by_machine_type",
        "Industrial laundry water per kg, by machine type",
        {"low": 4.5, "high": 22},
        "L/kg",
        "Machine level, Australia. Tunnel washers use 4.5 to 5 L/kg with water recycling and 7.5 to 12 without. "
        "Washer-extractors use 12 to 15 L/kg after water saving and 17 to 22 before.",
        NSW_LAUNDRIES, NSW_LAUNDRIES_URL, None, 2026,
        "The B_LOCAL (9.5 L/kg) and B_INHOUSE (12.5 L/kg) water factors fall inside this range.",
        [DATA_TRANSPARENCY, TEAM_ASSUMPTION_RATIONALE],
    ),
    public_figure(
        "jsg_water_per_kg",
        "Johnson Service Group water per kg",
        6.7,
        "L/kg",
        "Johnson Service Group, 6.698 m3 per tonne processed, 2024. UK healthcare linen, hospitality and workwear.",
        JSG_REPORT_2024, JSG_REPORT_2024_URL, "39", 2024,
        "A peer laundry figure, close to the dataset's laundry water of 6.74 L/kg.",
        [DATA_TRANSPARENCY, TEAM_ASSUMPTION_RATIONALE],
    ),
    public_figure(
        "salesianer_water_per_kg",
        "Salesianer water per kg",
        8.87,
        "L/kg",
        "Salesianer Miettex group, financial year 2025/2026. The 2030 target is 7.20 L/kg.",
        "Salesianer Miettex, sustainability report summary 2025/26.",
        "https://www.salesianer.com/files/Inhalte/Folder/SALESIANER-Nachhaltigkeitsbericht-Zusammenfassung-2025_26-EN-DIGITAL.pdf",
        None, 2025,
        "A peer laundry figure, a little below the B_LOCAL water factor of 9.5 L/kg.",
        [DATA_TRANSPARENCY, TEAM_ASSUMPTION_RATIONALE],
    ),
    public_figure(
        "whole_plant_laundry_energy_per_kg",
        "Whole-plant laundry energy per kg",
        {"low": 1.6, "high": 1.7},
        "kWh/kg",
        "Typical UK and European laundries, whole plant, per kg of dry textiles.",
        "Robarts S., Laundry and Cleaning News, 21.02.2024, quoting Richard Neale of LTC Worldwide. "
        "Trade press, with no cited dataset.",
        "https://laundryandcleaningnews.com/?p=18081", None, 2024,
        "It is the only whole-plant energy range found. It gives an upper end for the B_LOCAL energy factor "
        "(1.05 kWh/kg).",
        [DATA_TRANSPARENCY, TEAM_ASSUMPTION_RATIONALE],
    ),
    # Home washing
    public_figure(
        "home_washing_water_per_kg",
        "Home washing water per kg",
        {"low": 13, "high": 20},
        "L/kg",
        "EU real-life home washing at 3.4 kg loads on 7 kg machines, by programme. Cotton programmes use about "
        "13.7 L/kg.",
        JRC_2017, JRC_2017_URL, "385", 2017,
        "The B_HOME baseline (20 L/kg) is at the top of this range.",
        [DATA_TRANSPARENCY, TEAM_ASSUMPTION_RATIONALE],
        derived=True,
    ),
    public_figure(
        "home_washing_energy_per_kg",
        "Home washing energy per kg, washing only",
        {"low": 0.19, "high": 0.30},
        "kWh/kg",
        "EU real-life home washing at 3.4 kg loads, cotton programmes at 40 and 60 °C. Washing only, no drying.",
        JRC_2017, JRC_2017_URL, "385", 2017,
        "The B_HOME baseline's 1.18 kWh/kg only fits if tumble drying is included.",
        [DATA_TRANSPARENCY, TEAM_ASSUMPTION_RATIONALE],
    ),
    # Scope 1+2 range of large operators
    public_figure(
        "large_operator_emissions_per_kg_scope_1_2",
        "Large operator emissions per kg, Scope 1+2",
        {"low": 0.19, "high": 0.30},
        "kgCO2e/kg",
        "Lindström 0.19 (2025) and Johnson Service Group 0.303 (2024), Scope 1+2 per kg processed. "
        "Lindström's own figure was 0.30 in 2021.",
        f"{LINDSTROM_REPORT_2025} p. 44. {JSG_REPORT_2024} p. 39.", LINDSTROM_REPORT_2025_URL, None, 2025,
        "It is the rationale for the TEAM_ASSUMPTION low case of 0.30 kgCO2e/kg for the B_LOCAL process factor, "
        "which is the top of this range. The B_LOCAL process factor of 0.62 is 2 to 3 times this range.",
        [TEAM_ASSUMPTION_RATIONALE],
        derived=True,
    ),
    # Lindström UK garment life
    public_figure(
        "lindstrom_garment_washes_per_life",
        "Lindström garment washes per life",
        50,
        "washes",
        "A Lindström work garment, which lasts 3 years on average.",
        LINDSTROM_UK_2022, LINDSTROM_UK_2022_URL, None, 2022,
        "About one wash every 3 weeks per garment, which fits a pool of several sets per wearer.",
        [TEAM_ASSUMPTION_RATIONALE],
    ),
    public_figure(
        "lindstrom_garment_repairs_per_life",
        "Lindström garment repairs per life",
        6,
        "repairs",
        "A Lindström work garment over its life of about 50 washes.",
        LINDSTROM_UK_2022, LINDSTROM_UK_2022_URL, None, 2022,
        "About 6 repairs per garment life, so 1 replacement postponed per repair (A002) is generous.",
        [TEAM_ASSUMPTION_RATIONALE],
    ),
)

# Topics with no primary public source. The app shows them as data gaps.
PUBLIC_REFERENCE_GAPS: tuple[Record, ...] = (
    {
        "id": "on_time_service_cycle_target",
        "topic": "On-time service cycle target",
        "finding": "No public source gives a target share of on-time service cycles in workwear or textile "
        "rental. Operator reports, ETSA papers and the UK Crown Commercial Service framework RM6154 were checked.",
        "treatment": "On-time thresholds are TEAM_ASSUMPTION values. A contract target would be KAM-entered, "
        "which ADR 0004 leaves out of scope.",
    },
    {
        "id": "garment_sets_per_wearer",
        "topic": "Garment sets per wearer",
        "finding": "No primary source gives a 3-set or 5-set rule. The only published count is 11 sets per "
        "wearer for a 5-day week in US public uniform rental contracts (Colleton County RFP, 2015).",
        "treatment": "Shown as a data gap. A set count, if one is used, is a TEAM_ASSUMPTION value.",
    },
    {
        "id": "etsa_and_bref_laundry_figures",
        "topic": "ETSA and BREF laundry figures",
        "finding": "ETSA publishes no water, energy or CO2 figure per kg. The EU Textiles BREF (JRC, 2023) covers "
        "textile pre-treatment and dyeing, not laundries.",
        "treatment": "Laundry factors are compared with operator reports, the NSW Government ranges, "
        "JRC 2017 and trade press instead.",
    },
)

GROUP_EMISSIONS_INTENSITY_LINE: Record = {
    "text": "Lindström Group 0.28 kg CO2e per euro of turnover, 13% below the average of Elis, Cintas, "
    "Salesianer and Johnson Service Group.",
    "evidence_area": "Sustainability Value",
    "view": "Both",
    "data_status": "PUBLIC_REFERENCE",
    "figure_ids": ["lindstrom_emissions_per_euro_of_turnover", "lindstrom_emissions_per_euro_gap_to_peer_average"],
    "kam_notes": [
        {
            "text": "The 13% holds only when Lindström is left out of the average. It is 10.8% when Lindström "
            "is included.",
            "figure_ids": ["lindstrom_emissions_per_euro_gap_to_average_with_lindstrom"],
        },
        {
            "text": "The Johnson Service Group figure of 0.38 does not match JSG's 2024 report, which gives "
            "about 0.31 per GBP.",
            "figure_ids": ["jsg_emissions_per_gbp_of_revenue"],
        },
    ],
    "caveats": ["The intensity is never multiplied into a Customer figure. No Customer spend exists."],
}


def build_public_reference(wb: Workbook) -> Record:
    """The public reference figures. Reads nothing from the workbook."""
    return {
        "catalogue": [],
        "data": {
            "context_lines": {"group_emissions_intensity": copy.deepcopy(GROUP_EMISSIONS_INTENSITY_LINE)},
            "figures": copy.deepcopy(list(PUBLIC_FIGURES)),
            "gaps": copy.deepcopy(list(PUBLIC_REFERENCE_GAPS)),
        },
    }


# Account health (ADR 0009): a worst-of green/amber/red rating from 3 inputs
# with fixed TEAM_ASSUMPTION thresholds and minimum volumes, KAM view only.

RATING_ORDER = ("green", "amber", "red")
THRESHOLD_RATIONALE = (
    "No public benchmark exists. Set at about 2 times the 2025 synthetic spread. "
    "Replace with the contract SLA in production."
)


def percent_text(value: float) -> str:
    return f"{100 * value:.1f}%"


def requests_text(value: float) -> str:
    return f"{value:.2f} per 100 wearers per month"


# Each input: its catalogue text, the default thresholds and guard, the scopes it rates, and how
# it reads in the reason text. Thresholds compare with the unrounded value; "higher" means
# green >= green_threshold, amber >= amber_threshold; "lower" means green <= ..., amber <= ...
ACCOUNT_HEALTH_INPUTS: tuple[Record, ...] = (
    {
        "name": "Account health on-time service cycle share",
        "area": PERFORMANCE,
        "definition": (
            "On-time service cycle share over the period, from the Customer's or Site's own cycles. "
            "Green at 97% or more, amber from 95% to under 97%, red under 95%. "
            "Not rated under 100 sampled cycles."
        ),
        "source_fields": CYCLE_FIELDS,
        "grain": "Customer, Site, period",
        "scopes": ("customer", "site"),
        "thresholds": {"better": "higher", "green_threshold": 0.97, "amber_threshold": 0.95, "minimum_volume": 100},
        "volume_text": "sampled cycles",
        "label": "on-time service cycles",
        "format": percent_text,
        "caveats": [
            "Amber means about twice the 2025 late share of 1.7%.",
            SAMPLE_CAVEAT,
        ],
    },
    {
        "name": "Account health service requests per 100 wearers per month",
        "area": PERFORMANCE,
        "definition": (
            "Service requests divided by wearer-months, times 100. Wearer-months are the monthly average "
            "active wearers times the number of months. Green at 1.0 or less, amber over 1.0 to 2.0, red over 2.0. "
            "Not rated under 1,000 wearer-months. Customer only."
        ),
        "source_fields": ["Service_Activity.service_requests", "Service_Activity.active_wearers"],
        "grain": "Customer, period",
        "scopes": ("customer",),
        "thresholds": {"better": "lower", "green_threshold": 1.0, "amber_threshold": 2.0, "minimum_volume": 1000},
        "volume_text": "wearer-months",
        "label": "service requests",
        "format": requests_text,
        "caveats": [
            "Amber means about twice the top of the 2025 Customer range.",
            "Not used for Sites: every Site raises 14 to 38 service requests a year whatever its size, "
            "so the rate at Site grain mostly measures Site size.",
        ],
    },
    {
        "name": "Account health scan coverage",
        "area": ADOPTION,
        "definition": (
            "Active assets scanned divided by allocated pieces over the period. "
            "Green at 80% or more, amber from 70% to under 80%, red under 70%. "
            "Not rated under 500 allocated pieces, monthly average."
        ),
        "source_fields": ["Service_Activity.active_assets_scanned", "Service_Activity.allocated_pieces"],
        "grain": "Customer, Site, period",
        "scopes": ("customer", "site"),
        "thresholds": {"better": "higher", "green_threshold": 0.8, "amber_threshold": 0.7, "minimum_volume": 500},
        "volume_text": "allocated pieces, monthly average",
        "label": "scan coverage",
        "format": percent_text,
        "caveats": [
            "Set just below the lowest Site-year, and low on purpose: no scan activity does not prove that "
            "a garment is not needed (customer brief note 2).",
        ],
    },
)

for _spec in ACCOUNT_HEALTH_INPUTS:
    _spec["id"] = catalogue_id(_spec["name"])

CUSTOMER_EXPERIENCE_GAP = {
    "view": "KAM",
    "text": (
        "Customer Experience (CSAT, NPS) is a data gap: the workbook holds no survey results. "
        "It is shown beside the rating and is never an input."
    ),
}


def band_rating(value: float, thresholds: Record) -> str:
    """green, amber or red for a value against an input's thresholds."""
    if thresholds["better"] == "higher":
        if value >= thresholds["green_threshold"]:
            return "green"
        return "amber" if value >= thresholds["amber_threshold"] else "red"
    if value <= thresholds["green_threshold"]:
        return "green"
    return "amber" if value <= thresholds["amber_threshold"] else "red"


def rate_input(spec: Record, value: float | None, volume: float) -> Record:
    """One input's value, rating, thresholds used, volume and any not-rated reason."""
    thresholds = spec["thresholds"]
    minimum = thresholds["minimum_volume"]
    if value is None or volume < minimum:
        rating = "not_rated"
        reason = f"{volume:,} {spec['volume_text']}, under the minimum of {minimum:,}."
    else:
        rating, reason = band_rating(value, thresholds), None
    return {
        "input_id": spec["id"],
        "value": None if value is None else round(value, FLOAT_DIGITS),
        "rating": rating,
        "thresholds_used": dict(thresholds),
        "volume": volume,
        "not_rated_reason": reason,
    }


def worst_of(specs: list[Record], inputs: list[Record]) -> Record:
    """The overall rating, its reason text and "based on n of m inputs"."""
    rated = [(spec, i) for spec, i in zip(specs, inputs) if i["rating"] != "not_rated"]
    if not rated:
        rating, reason = "not_rated", "Not rated: no input has enough volume."
    else:
        rating = max((i["rating"] for _, i in rated), key=RATING_ORDER.index)
        if rating == "green":
            reason = "Green: every rated input is green."
        else:
            parts = []
            for level in ("red", "amber"):
                named = [f"{s['label']} {s['format'](i['value'])}" for s, i in rated if i["rating"] == level]
                if named:
                    parts.append(f"{level.capitalize()}: {', '.join(named)}.")
            reason = " ".join(parts)
    return {
        "rating": rating,
        "reason": reason,
        "rated_inputs": len(rated),
        "total_inputs": len(inputs),
        "based_on": f"Based on {len(rated)} of {len(inputs)} inputs",
    }


def health_input_values(site_months: list[Record], cycles: list[Record], wearer_months: int, months: list[str]) -> dict:
    """(value, volume) per input id for one Customer or Site over the given months."""
    sampled = len(cycles)
    late = sum(c["late_cycles"] for c in cycles)
    allocated = sum(r["allocated_pieces"] for r in site_months)
    requests = sum(r["service_requests"] for r in site_months)
    return {
        "account_health_on_time_service_cycle_share": ((sampled - late) / sampled if sampled else None, sampled),
        "account_health_service_requests_per_100_wearers_per_month": (
            100 * requests / wearer_months if wearer_months else None,
            wearer_months,
        ),
        "account_health_scan_coverage": (
            ratio_of_totals(site_months, "active_assets_scanned", "allocated_pieces"),
            round(allocated / len(months)),
        ),
    }


def health_ratings(service_activity: list[Record], cycles: list[Record], months: list[str]) -> list[Record]:
    """A rating for each Customer and Site, for the data year and for each data month."""
    site_months = site_month_facts(service_activity)
    customer_wearers = customer_active_wearers(service_activity)
    periods = [(data_year(months), months)] + [(m, [m]) for m in months]
    entities = sorted({(r["customer_id"], r["site_id"]) for r in site_months})
    scopes = [("customer", customer_id, customer_id) for customer_id in sorted({c for c, _ in entities})]
    scopes += [("site", site_id, customer_id) for customer_id, site_id in entities]

    ratings = []
    for scope, scope_id, customer_id in scopes:
        field = f"{scope}_id"
        for period, period_months in periods:
            rows = [r for r in site_months if r[field] == scope_id and r["month"] in period_months]
            sampled = [c for c in cycles if c[field] == scope_id and c["month"] in period_months]
            wearer_months = sum(customer_wearers.get((scope_id, m), 0) for m in period_months)
            values = health_input_values(rows, sampled, wearer_months, period_months)
            specs = [s for s in ACCOUNT_HEALTH_INPUTS if scope in s["scopes"]]
            inputs = [rate_input(s, *values[s["id"]]) for s in specs]
            ratings.append({
                "scope": scope,
                "scope_id": scope_id,
                "customer_id": customer_id,
                "period": period,
                **worst_of(specs, inputs),
                "inputs": inputs,
            })
    return ratings


def account_health_catalogue() -> list[Record]:
    """The account health rule, then its 3 inputs. All KAM view only."""
    common = {
        "core_or_industry": "Core KPI",
        "view": "KAM",
        "review_part": "Look back",
        "data_status": "SYNTHETIC",
        "threshold_data_status": "TEAM_ASSUMPTION",
        "rationale": THRESHOLD_RATIONALE,
        "assumptions": [],
    }
    rule = {
        **common,
        "id": "account_health",
        "name": "Account health",
        "evidence_area": PERFORMANCE[0],
        "customer_question": PERFORMANCE[1],
        "definition": (
            "Worst-of rating from the inputs: the worst input rating, naming every input that is amber or red. "
            "An input under its minimum volume is not rated and drops out. With no rated input, account health "
            "is not rated, never green. A Customer is rated from its own aggregate values, never from its Site "
            "ratings. A Site is rated on on-time service cycle share and scan coverage only."
        ),
        "source_fields": sorted({f for s in ACCOUNT_HEALTH_INPUTS for f in s["source_fields"]}),
        "grain": "Customer, Site, period",
        "caveats": [
            "Shown in the KAM view only, never in the Customer view or the exported review.",
            "Customer priorities and industry have no effect: every Customer gets the same inputs and thresholds.",
        ],
    }
    inputs = [
        {
            **common,
            "id": spec["id"],
            "name": spec["name"],
            "evidence_area": spec["area"][0],
            "customer_question": spec["area"][1],
            "definition": spec["definition"],
            "source_fields": list(spec["source_fields"]),
            "grain": spec["grain"],
            "thresholds": dict(spec["thresholds"]),
            "caveats": list(spec["caveats"]),
        }
        for spec in ACCOUNT_HEALTH_INPUTS
    ]
    return [rule, *inputs]


def build_account_health(wb: Workbook) -> Record:
    months = data_months(wb)
    cycles = [c for c in cycle_rows(wb.records("Service_Cycles")) if c["month"] in months]
    return {
        "catalogue": account_health_catalogue(),
        "data": {
            "defaults": {spec["id"]: dict(spec["thresholds"]) for spec in ACCOUNT_HEALTH_INPUTS},
            "ratings": health_ratings(wb.records("Service_Activity"), cycles, months),
            "customer_experience_gap": dict(CUSTOMER_EXPERIENCE_GAP),
        },
    }


# Footprint and handprint KPIs

FOOTPRINT_KEYS = ["customer_id", "site_id", "product_id", "laundry_id"]
FOOTPRINT_FIELDS = [
    "customer_washed_kg",
    "allocated_water_l",
    "allocated_energy_kwh",
    "allocated_process_kgco2e",
    "allocated_delivery_kgco2e",
]
# The workbook's own B_LOCAL handprint, kept so the computed one can be tied out against it.
TIE_OUT_FIELDS = ["water_saving_vs_local_l", "energy_saving_vs_local_kwh", "emissions_saving_vs_local_kgco2e"]
BASELINE_FACTORS = ["water_l_per_kg", "energy_kwh_per_kg", "process_kgco2e_per_kg", "delivery_kgco2e_per_kg"]

FOOTPRINT_GRAIN = "Customer, Site, product, month"
HANDPRINT_GRAIN = "Customer, Site, product, month, baseline"
ALLOCATED_FOOTPRINT_CAVEAT = "It is the Customer's share of laundry totals by washed kg, not a figure measured at the Site."
ILLUSTRATIVE_BASELINE_CAVEAT = "Baseline factors are illustrative. Savings may be overstated."
BASELINE_NAMED_CAVEAT = "Every value names its baseline, for example \"vs outsourced local laundry\"."
EMISSIONS_FIELDS = ["Customer_Impacts.allocated_process_kgco2e", "Customer_Impacts.allocated_delivery_kgco2e"]

FOOTPRINT_HANDPRINT_CATALOGUE: tuple[Record, ...] = (
    kpi(
        "washed_kg",
        "Washed kg",
        SUSTAINABILITY_VALUE,
        "Sum of customer_washed_kg over the period. Unit is a parameter: total (default) or per active wearer.",
        ["Customer_Impacts.customer_washed_kg"],
        FOOTPRINT_GRAIN,
        "SYNTHETIC",
        [],
        ["Every allocated footprint figure is a laundry total shared out by washed kg."],
    ),
    kpi(
        "water_use_allocated",
        "Water use (allocated)",
        SUSTAINABILITY_VALUE,
        "Sum of allocated_water_l over the period, in litres. Unit is a parameter: total (default) or per "
        "active wearer.",
        ["Customer_Impacts.allocated_water_l"],
        FOOTPRINT_GRAIN,
        "ALLOCATED_ESTIMATE_SYNTHETIC",
        [],
        [ALLOCATED_FOOTPRINT_CAVEAT],
    ),
    kpi(
        "energy_use_allocated",
        "Energy use (allocated)",
        SUSTAINABILITY_VALUE,
        "Sum of allocated_energy_kwh over the period, in kWh. Unit is a parameter: total (default) or per "
        "active wearer.",
        ["Customer_Impacts.allocated_energy_kwh"],
        FOOTPRINT_GRAIN,
        "ALLOCATED_ESTIMATE_SYNTHETIC",
        [],
        [ALLOCATED_FOOTPRINT_CAVEAT],
    ),
    kpi(
        "emissions_allocated",
        "Emissions (allocated)",
        SUSTAINABILITY_VALUE,
        "Sum of allocated_process_kgco2e and allocated_delivery_kgco2e over the period, in kg CO2e. Emission "
        "source (process, delivery) is a breakdown parameter. Unit is a parameter: total (default) or per "
        "active wearer.",
        EMISSIONS_FIELDS,
        f"{FOOTPRINT_GRAIN}, emission source",
        "ALLOCATED_ESTIMATE_SYNTHETIC",
        [],
        [
            ALLOCATED_FOOTPRINT_CAVEAT,
            "The laundry's grid sets most of it, and the Customer cannot influence that.",
        ],
    ),
    kpi(
        "water_saved",
        "Water saved",
        SUSTAINABILITY_VALUE,
        "Baseline water_l_per_kg times washed kg, minus water use. Shown in litres and as a share of the "
        "baseline water. Baseline is a parameter, B_LOCAL by default.",
        ["Customer_Impacts.customer_washed_kg", "Customer_Impacts.allocated_water_l", "Baselines.water_l_per_kg"],
        HANDPRINT_GRAIN,
        "ALLOCATED_ESTIMATE_SYNTHETIC",
        ["A001"],
        [BASELINE_NAMED_CAVEAT, "It ties back to the workbook's water_saving_vs_local_l for B_LOCAL."],
    ),
    kpi(
        "energy_saved",
        "Energy saved",
        SUSTAINABILITY_VALUE,
        "Baseline energy_kwh_per_kg times washed kg, minus energy use. Shown in kWh and as a share of the "
        "baseline energy. Baseline is a parameter, B_LOCAL by default.",
        ["Customer_Impacts.customer_washed_kg", "Customer_Impacts.allocated_energy_kwh", "Baselines.energy_kwh_per_kg"],
        HANDPRINT_GRAIN,
        "ALLOCATED_ESTIMATE_SYNTHETIC",
        ["A001"],
        [
            ILLUSTRATIVE_BASELINE_CAVEAT,
            BASELINE_NAMED_CAVEAT,
            "Dataset laundry energy (0.70 kWh/kg) is about 30% below Lindström's published 0.99 kWh/kg, so "
            "Energy saved may be overstated.",
            "It ties back to the workbook's energy_saving_vs_local_kwh for B_LOCAL.",
        ],
    ),
    kpi(
        "emissions_saved",
        "Emissions saved",
        SUSTAINABILITY_VALUE,
        "Baseline process_kgco2e_per_kg plus delivery_kgco2e_per_kg, times washed kg, minus emissions. Shown in "
        "kg CO2e and as a share of the baseline emissions. Baseline is a parameter, B_LOCAL by default.",
        [
            "Customer_Impacts.customer_washed_kg",
            *EMISSIONS_FIELDS,
            "Baselines.process_kgco2e_per_kg",
            "Baselines.delivery_kgco2e_per_kg",
        ],
        HANDPRINT_GRAIN,
        "ALLOCATED_ESTIMATE_SYNTHETIC",
        ["A001"],
        [
            ILLUSTRATIVE_BASELINE_CAVEAT,
            BASELINE_NAMED_CAVEAT,
            "The B_LOCAL process factor is near Scope 1+2+3 levels, while the actuals are near Scope 1+2. "
            "Emissions saved may be overstated.",
            "A TEAM_ASSUMPTION low case of 0.30 kgCO2e/kg for the B_LOCAL process factor gives a lower figure.",
            "Shown next to Avoided product CO2e (estimated) and never added to it (ADR 0007).",
            "It ties back to the workbook's emissions_saving_vs_local_kgco2e for B_LOCAL.",
        ],
    ),
)
FOOTPRINT_KPI_IDS = ["washed_kg", "water_use_allocated", "energy_use_allocated", "emissions_allocated"]
HANDPRINT_KPI_IDS = ["water_saved", "energy_saved", "emissions_saved"]


def footprint_handprint_parameters(baseline_ids: list[str], default_baseline_id: str) -> list[Record]:
    """The parameters the footprint and handprint KPIs take, with their defaults."""
    return [
        {
            "id": "unit",
            "values": ["total", "per_active_wearer"],
            "default": "total",
            "kpi_ids": list(FOOTPRINT_KPI_IDS),
            "note": "Per active wearer divides the period total by per_wearer_denominators. "
            "Per washed kg is not offered (ADR 0012).",
        },
        {
            "id": "emission_source",
            "values": ["process", "delivery"],
            "default": None,
            "kpi_ids": ["emissions_allocated"],
            "note": "A breakdown. With no value, the KPI is process plus delivery.",
        },
        {
            "id": "baseline",
            "values": list(baseline_ids),
            "default": default_baseline_id,
            "kpi_ids": list(HANDPRINT_KPI_IDS),
            "note": "Every factor in baselines.factors is an override parameter with the workbook value as its "
            "default. The handprint rows precompute each baseline with the same formula.",
        },
    ]

# TEAM_ASSUMPTION low case for the B_LOCAL process factor: the top of the Scope 1+2 range of large operators.
BASELINE_LOW_CASES: tuple[Record, ...] = (
    {
        "id": "b_local_process_low_case",
        "baseline_id": "B_LOCAL",
        "factor": "process_kgco2e_per_kg",
        "value": 0.30,
        "data_status": "TEAM_ASSUMPTION",
        "rationale": "The top of the Scope 1+2 range of large operators (0.19 to 0.30 kgCO2e/kg). The workbook "
        "factor of 0.62 is near Scope 1+2+3 levels, while the dataset's laundry actuals are near Scope 1+2.",
        "figure_ids": ["large_operator_emissions_per_kg_scope_1_2"],
    },
)


def baseline_factors(baselines: list[Record]) -> Record:
    """The baselines' factors as override defaults, the default baseline and the low cases."""
    ids = {b["baseline_id"] for b in baselines}
    for low_case in BASELINE_LOW_CASES:
        if low_case["baseline_id"] not in ids or low_case["factor"] not in BASELINE_FACTORS:
            raise ValueError(f"low case {low_case['id']} names an unknown baseline or factor")
    factors = [
        {
            "baseline_id": b["baseline_id"],
            "baseline_name": b["baseline_name"],
            "label": f"vs {b['baseline_name'].lower()}",
            "selection_status": b["selection_status"],
            "assumption_note": b["assumption_note"],
            **{f: b[f] for f in BASELINE_FACTORS},
        }
        for b in baselines
    ]
    return {"default_baseline_id": default_baseline_id(baselines), "factors": factors, "low_cases": copy.deepcopy(list(BASELINE_LOW_CASES))}


def scope_periods(months: list[str]) -> list[tuple[str, list[str]]]:
    """Each data month on its own, then the data year: (period, months) pairs."""
    return [(m, [m]) for m in months] + [(data_year(months), list(months))]


def per_wearer_denominators(service_activity: list[Record], months: list[str]) -> list[Record]:
    """Monthly average active wearers for each Customer and Site, in each data month and over the data year.

    Counts follow the wearer counting rule (ADR 0003).
    """
    site_customer = {row["site_id"]: row["customer_id"] for row in service_activity}
    series = (
        ("customer", customer_active_wearers(service_activity), {c: c for c in site_customer.values()}),
        ("site", site_active_wearers(service_activity), site_customer),
    )
    rows = []
    for scope, monthly, customer_of in series:
        for scope_id in sorted(customer_of):
            for period, period_months in scope_periods(months):
                rows.append({
                    "scope": scope,
                    "scope_id": scope_id,
                    "customer_id": customer_of[scope_id],
                    "period": period,
                    "active_wearers": round(period_average(monthly, scope_id, period_months), FLOAT_DIGITS),
                })
    return rows


def handprint_values(footprint: Record, factors: Record) -> Record:
    """The one handprint formula for every baseline: baseline factor times washed kg, minus the allocated
    footprint. Each saving is also a share of that baseline footprint, from the same totals."""
    kg = footprint["customer_washed_kg"]
    measures = (
        ("water", "l", factors["water_l_per_kg"], footprint["allocated_water_l"]),
        ("energy", "kwh", factors["energy_kwh_per_kg"], footprint["allocated_energy_kwh"]),
        (
            "emissions",
            "kgco2e",
            factors["process_kgco2e_per_kg"] + factors["delivery_kgco2e_per_kg"],
            footprint["allocated_process_kgco2e"] + footprint["allocated_delivery_kgco2e"],
        ),
    )
    values: Record = {"customer_washed_kg": round(kg, FLOAT_DIGITS)}
    for name, unit, factor, actual in measures:
        baseline = factor * kg
        saved = baseline - actual
        values[f"baseline_{name}_{unit}"] = round(baseline, FLOAT_DIGITS)
        values[f"{name}_saved_{unit}"] = round(saved, FLOAT_DIGITS)
        values[f"{name}_saved_share"] = round(saved / baseline, FLOAT_DIGITS) if baseline else None
    return values


def factor_cases(baselines: Record) -> list[tuple[str, str, Record]]:
    """(baseline_id, factor_case, factors): each baseline's workbook factors, then each low case."""
    by_id = {b["baseline_id"]: b for b in baselines["factors"]}
    cases = [(b["baseline_id"], "default", b) for b in baselines["factors"]]
    for low_case in baselines["low_cases"]:
        factors = {**by_id[low_case["baseline_id"]], low_case["factor"]: low_case["value"]}
        cases.append((low_case["baseline_id"], "low_case", factors))
    return cases


def handprint_rows(footprint_rows: list[Record], baselines: Record, months: list[str]) -> list[Record]:
    """Handprint for each Customer and Site, in each data month and over the data year.

    Each scope and period has one row per baseline and factor case.
    """
    totals: dict[tuple[str, str, str, str], Record] = {}
    for row in footprint_rows:
        for scope, scope_id in (("customer", row["customer_id"]), ("site", row["site_id"])):
            for period, period_months in scope_periods(months):
                if row["month"] not in period_months:
                    continue
                sums = totals.setdefault((scope, scope_id, row["customer_id"], period), dict.fromkeys(FOOTPRINT_FIELDS, 0))
                for f in FOOTPRINT_FIELDS:
                    sums[f] += row[f]
    rows = []
    for (scope, scope_id, customer_id, period), footprint in sorted(totals.items()):
        for baseline_id, factor_case, factors in factor_cases(baselines):
            rows.append({
                "scope": scope,
                "scope_id": scope_id,
                "customer_id": customer_id,
                "period": period,
                "baseline_id": baseline_id,
                "factor_case": factor_case,
                **handprint_values(footprint, factors),
            })
    return rows


LAUNDRY_RESOURCE_FIELDS = [
    "washed_kg",
    "fresh_water_l",
    "process_energy_kwh",
    "process_emissions_kgco2e",
    "fresh_water_l_per_kg",
    "energy_kwh_per_kg",
]
PROCESS_CO2E_DIGITS = 3

# Public figures that the KAM view sets next to the baseline factors and the dataset's actuals.
TRANSPARENCY_PUBLIC_FIGURE_IDS = [
    "lindstrom_laundry_energy_per_washed_kg",
    "lindstrom_water_per_washed_kg_group",
    "lindstrom_water_per_washed_kg_workwear",
    "lindstrom_emissions_per_washed_kg_scope_1_2",
    "lindstrom_emissions_per_washed_kg_scope_1_2_3",
    "large_operator_emissions_per_kg_scope_1_2",
]


def laundry_month_factors(laundry_resources: list[Record]) -> list[Record]:
    """Each laundry's water and energy factors per month, copied from Laundry_Resources with their totals."""
    rows = [
        {"laundry_id": r["laundry_id"], "month": month_key(r["month"]), **{f: r[f] for f in LAUNDRY_RESOURCE_FIELDS}}
        for r in laundry_resources
    ]
    return sorted(rows, key=lambda r: (r["laundry_id"], r["month"]))


def laundry_process_co2e_per_kwh(laundry_resources: list[Record]) -> list[Record]:
    """Process kg CO2e per kWh for each laundry, from summed totals. For Data transparency only (ADR 0012).

    The country grid fixes the factor per laundry, so one row per laundry holds it. A factor that
    changes by month would need month rows, so the build stops instead.
    """
    by_laundry: dict[str, list[Record]] = {}
    for row in laundry_resources:
        by_laundry.setdefault(row["laundry_id"], []).append(row)
    rows = []
    for laundry_id, months in sorted(by_laundry.items()):
        factor = round(ratio_of_totals(months, "process_emissions_kgco2e", "process_energy_kwh"), PROCESS_CO2E_DIGITS)
        monthly = {round(m["process_emissions_kgco2e"] / m["process_energy_kwh"], PROCESS_CO2E_DIGITS) for m in months}
        if monthly != {factor}:
            raise ValueError(f"process CO2e per kWh of {laundry_id} changes by month: {sorted(monthly)}")
        rows.append({"laundry_id": laundry_id, "process_kgco2e_per_kwh": factor})
    return rows


def build_footprint_handprint_kpis(wb: Workbook) -> Record:
    months = data_months(wb)
    footprint_rows = month_facts(wb.records("Customer_Impacts"), FOOTPRINT_KEYS, FOOTPRINT_FIELDS + TIE_OUT_FIELDS)
    baselines = baseline_factors(wb.records("Baselines"))
    laundry_resources = wb.records("Laundry_Resources")
    baseline_ids = [b["baseline_id"] for b in baselines["factors"]]
    return {
        "catalogue": [dict(entry) for entry in FOOTPRINT_HANDPRINT_CATALOGUE],
        "data": {
            "baselines": baselines,
            "footprint": footprint_rows,
            "handprint": handprint_rows(footprint_rows, baselines, months),
            "parameters": footprint_handprint_parameters(baseline_ids, baselines["default_baseline_id"]),
            "per_wearer_denominators": per_wearer_denominators(wb.records("Service_Activity"), months),
            "transparency": {
                "view": "KAM",
                "laundry_month_factors": laundry_month_factors(laundry_resources),
                "laundry_process_co2e_per_kwh": laundry_process_co2e_per_kwh(laundry_resources),
                "public_figure_ids": list(TRANSPARENCY_PUBLIC_FIGURE_IDS),
            },
        },
    }


BUILDERS: dict[str, Callable[[Workbook], Record]] = {
    "master-data": build_master_data,
    "operational-circularity-kpis": build_operational_circularity_kpis,
    "service-kpis": build_service_kpis,
    "public-reference": build_public_reference,
    "account-health": build_account_health,
    "footprint-handprint-kpis": build_footprint_handprint_kpis,
}


# CLI


def run(xlsx: Path, out: Path) -> list[Path]:
    wb = Workbook(xlsx)
    out.mkdir(parents=True, exist_ok=True)
    written = []
    for name, build in BUILDERS.items():
        built = build(wb)
        payload = {
            "meta": {
                "name": name,
                "source_file": xlsx.name,
                "source_sha256": wb.sha256,
            },
            "catalogue": built["catalogue"],
            "data": built["data"],
        }
        path = out / f"{name}.json"
        write_json(path, payload)
        written.append(path)
    return written


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--xlsx", type=Path, default=DEFAULT_XLSX, help="source workbook")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT, help="output directory")
    args = parser.parse_args(argv)
    for path in run(args.xlsx, args.out):
        print(f"wrote {path}")


if __name__ == "__main__":
    main()
