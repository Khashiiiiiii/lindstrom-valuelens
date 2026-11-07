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


BUILDERS: dict[str, Callable[[Workbook], Record]] = {
    "master-data": build_master_data,
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
