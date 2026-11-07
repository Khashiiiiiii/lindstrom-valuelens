"""Operational and circularity KPIs (#4)."""

from __future__ import annotations

from .catalogue import OPERATIONAL_VALUE, SUSTAINABILITY_VALUE, kpi
from .facts import FLOAT_DIGITS, month_facts
from .workbook import Record, Workbook, month_key


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


REPAIR_GRAIN = "Customer, Site, product, month, repair type"
WASTE_GRAIN = "Customer, Site, product, month"
ALLOCATED_WASTE_CAVEAT = "The Customer's share of laundry waste by washed kg, not waste measured at the Site."
WASTE_ROUTE_FIELDS = [
    "Customer_Impacts.share_of_laundry_washed_kg",
    *(f"Waste_Circularity.{route}_kg" for route in TREATMENT_ROUTES),
]


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
