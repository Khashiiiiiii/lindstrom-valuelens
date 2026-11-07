"""Footprint and handprint KPIs (#5)."""

from __future__ import annotations

import copy

from .catalogue import SUSTAINABILITY_VALUE, kpi
from .facts import (
    FLOAT_DIGITS,
    customer_active_wearers,
    default_baseline_id,
    month_facts,
    period_average,
    ratio_of_totals,
    site_active_wearers,
)
from .workbook import Record, Workbook, data_months, data_year, month_key


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
