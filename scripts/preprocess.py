"""Turn the source workbook into the JSON files in data/processed/.

Run: python scripts/preprocess.py [--xlsx <path>] [--out data/processed]

Each output file has the shape {"meta": {...}, "catalogue": [...], "data": {...}}
and is written by one build_<name>() function listed in BUILDERS. The same
workbook always gives byte-identical files: keys are sorted and no timestamp is
written. meta.source_sha256 names the workbook.
"""

from __future__ import annotations

import argparse
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


def build_master_data(wb: Workbook) -> Record:
    customers = wb.records("Customers")
    for customer in customers:
        customer["priority_topics"] = split_topics(customer["priority_topics"])

    baselines = wb.records("Baselines")
    defaults = [b["baseline_id"] for b in baselines if b["selection_status"] == "DEFAULT"]
    if len(defaults) != 1:
        raise ValueError(f"expected exactly one DEFAULT baseline, found {defaults}")

    products = wb.records("Products")
    sites = wb.records("Sites")

    return {
        "catalogue": [],
        "data": {
            "assumptions": wb.records("Assumptions"),
            "baselines": baselines,
            "customers": customers,
            "data_quality": wb.records("Data_Quality"),
            "default_baseline_id": defaults[0],
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


BUILDERS: dict[str, Callable[[Workbook], Record]] = {
    "master-data": build_master_data,
    "operational-circularity-kpis": build_operational_circularity_kpis,
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
