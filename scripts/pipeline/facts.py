"""Shared helpers: the period rule, the wearer counting rule, product presets and the default baseline (#2)."""

from __future__ import annotations

from .workbook import Record, data_year, month_key


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


def default_baseline_id(baselines: list[Record]) -> str:
    """The one baseline whose selection_status is DEFAULT."""
    defaults = [b["baseline_id"] for b in baselines if b["selection_status"] == "DEFAULT"]
    if len(defaults) != 1:
        raise ValueError(f"expected exactly one DEFAULT baseline, found {defaults}")
    return defaults[0]


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
