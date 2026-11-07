"""Opportunity signals: 6 fixed rules that flag a Site against the Customer's other Sites (#8)."""

from __future__ import annotations

from typing import Callable

from .catalogue import (
    ADOPTION,
    CYCLE_FIELDS,
    OPERATIONAL_VALUE,
    PERFORMANCE,
    SAMPLE_CAVEAT,
    catalogue_id,
    customer_default_orders,
)
from .facts import (
    CYCLE_STAGES,
    FLOAT_DIGITS,
    cycle_rows,
    month_facts,
    percentile,
    round_or_none,
    site_month_facts,
    turnaround_stats,
)
from .workbook import Record, Workbook, data_months, data_year


# ADR 0008: a Site is compared with the median of the same Customer's other Sites,
# for the same product where the signal is by product. Rules are one-sided.


def compare_with_peers(units: list[Record], threshold: float, minimum_peers: int) -> list[Record]:
    """Peer median, relative gap and fired flag for each unit (a Site, or a Site and product).

    A unit is {customer_id, site_id, product_id, value, guard_reason}. Peers are the other Sites of the
    same Customer with the same product_id that have a value, whether or not they pass the guard.
    A unit with a guard_reason, too few peers or a peer median of 0 is not evaluated.
    """
    results = []
    for unit in units:
        peers = [
            other["value"]
            for other in units
            if other["customer_id"] == unit["customer_id"]
            and other["product_id"] == unit["product_id"]
            and other["site_id"] != unit["site_id"]
            and other["value"] is not None
        ]
        median = percentile(peers, 0.5) if peers else None
        gap = None
        if unit["guard_reason"]:
            reason = unit["guard_reason"]
        elif unit["value"] is None:
            reason = "No data in the period."
        elif len(peers) < minimum_peers:
            reason = f"{len(peers)} peer Sites, under the minimum of {minimum_peers}."
        elif median == 0:
            reason = "The peer median is 0, so no relative gap exists."
        else:
            reason = None
        if reason is None:
            gap = (unit["value"] - median) / median
        results.append({
            **unit,
            "peer_median": median,
            "peer_count": len(peers),
            "gap": gap,
            "fired": reason is None and gap >= threshold,
            "not_evaluated_reason": reason,
        })
    return results


def rank_fired(fired: list[Record], signal_priorities: dict[str, list[str]], orders: dict[str, list[str]]) -> list[Record]:
    """Per Customer, fired results ordered by the position of their highest matching priority, then by gap.

    A result whose signal matches none of the Customer's priorities comes last. Results that fire on the
    same Site stay separate.
    """
    ranking = []
    for customer_id in sorted(orders):
        order = orders[customer_id]

        def matched(result: Record) -> str | None:
            positions = [order.index(p) for p in signal_priorities[result["signal_id"]] if p in order]
            return order[min(positions)] if positions else None

        rows = [r for r in fired if r["customer_id"] == customer_id]
        keyed = sorted(
            rows,
            key=lambda r: (
                order.index(matched(r)) if matched(r) else len(order),
                -r["gap"],
                r["signal_id"],
                r["site_id"],
                r["product_id"] or "",
            ),
        )
        ranking.append({
            "customer_id": customer_id,
            "priority_order": list(order),
            "results": [
                {
                    "rank": i,
                    "signal_id": r["signal_id"],
                    "site_id": r["site_id"],
                    "product_id": r["product_id"],
                    "gap": r["gap"],
                    "matched_priority_id": matched(r),
                }
                for i, r in enumerate(keyed, start=1)
            ],
        })
    return ranking


# The 6 signals. Thresholds and guards are TEAM_ASSUMPTION override parameters.

SIGNAL_RATIONALE = "Roughly the top 10 to 20% of the 2025 synthetic spread. No public benchmark exists."
MINIMUM_PEERS = 3
SITE = "site"
SITE_PRODUCT = "site_product"
ALLOCATED_ESTIMATE = "ALLOCATED_ESTIMATE_SYNTHETIC"
KAM_ONLY_RESULTS_CAVEAT = "Unfired and not evaluated results are shown in the KAM view only."


def signal(
    name: str,
    area: tuple[str, str],
    kpi_ids: list[str],
    grain: str,
    definition: str,
    source_fields: list[str],
    thresholds: Record,
    guard_texts: dict[str, str],
    lever: str,
    lever_owner: str,
    customer_priority_ids: list[str],
    size: str | None,
    caveats: list[str],
    view: str = "Both",
) -> Record:
    """One signal spec, with its id in place. guard_texts says what each minimum_* threshold counts."""
    return {
        "id": catalogue_id(name),
        "name": name,
        "area": area,
        "kpi_ids": kpi_ids,
        "grain": grain,
        "definition": definition,
        "source_fields": source_fields,
        "thresholds": thresholds,
        "guard_texts": guard_texts,
        "lever": lever,
        "lever_owner": lever_owner,
        "customer_priority_ids": customer_priority_ids,
        "size": size,
        "caveats": caveats,
        "view": view,
    }


SIGNALS: tuple[Record, ...] = (
    signal(
        "Garment allocation above peers",
        ADOPTION,
        ["garments_per_wearer", "active_wearers"],
        SITE_PRODUCT,
        "Garments per wearer on the Site's product row, allocated pieces over active wearers, 30% or more above "
        "the median of the Customer's other Sites with the same product.",
        ["Service_Activity.allocated_pieces", "Service_Activity.active_wearers"],
        {"threshold": 0.3, "minimum_active_wearers": 100},
        {"minimum_active_wearers": "active wearers on the product row, monthly average"},
        "Check wearer counts and spares, then right-size the allocation.",
        "Joint",
        ["garment_utilisation"],
        "Garments above the peer level: monthly average active wearers times the gap in garments per wearer.",
        ["Uses the wearer counting rule: at product grain, active wearers are the row value."],
    ),
    signal(
        "Allocated garments with no scan activity above peers",
        ADOPTION,
        ["allocated_garments_with_no_scan_activity", "scan_coverage"],
        SITE,
        "No-scan share, 1 minus scan coverage, 10% or more above the median of the Customer's other Sites "
        "(about 1.6 points).",
        ["Service_Activity.active_assets_scanned", "Service_Activity.allocated_pieces"],
        {"threshold": 0.1, "minimum_allocated_pieces": 500},
        {"minimum_allocated_pieces": "allocated pieces, monthly average"},
        "Check whether the garments are spares, not needed or missing scans.",
        "Joint",
        ["garment_utilisation", "traceability"],
        "Allocated garments with no scan activity, monthly average.",
        ["A reason to investigate, not proof the garments are not needed (customer brief note 2)."],
    ),
    signal(
        "Washes per garment above peers",
        ADOPTION,
        ["washes_per_garment", "water_use_allocated", "emissions_allocated"],
        SITE_PRODUCT,
        "Washes per garment on the Site's product row, washed pieces over allocated pieces per month, 10% or more "
        "above the median of the Customer's other Sites with the same product.",
        ["Service_Activity.washed_pieces", "Service_Activity.allocated_pieces"],
        {"threshold": 0.1, "minimum_allocated_pieces": 100},
        {"minimum_allocated_pieces": "allocated pieces on the product row, monthly average"},
        "Review the Site's garment change routine.",
        "Customer",
        ["water", "emissions"],
        "Allocated water and emissions over the period above what the product row would use if its washes per "
        "garment matched the peer median.",
        [
            "Hygiene rules may require this washing frequency.",
            "The size figures are allocated estimates (ALLOCATED_ESTIMATE_SYNTHETIC).",
        ],
    ),
    signal(
        "Service request rate above peers",
        PERFORMANCE,
        ["service_requests_per_100_wearers", "service_requests"],
        SITE,
        "Service requests per 100 wearers per month, 50% or more above the median of the Customer's other Sites.",
        ["Service_Activity.service_requests", "Service_Activity.active_wearers"],
        {"threshold": 0.5, "minimum_wearer_months": 1000, "minimum_service_requests": 20},
        {"minimum_wearer_months": "wearer-months", "minimum_service_requests": "service requests"},
        "Review the Site's service requests with the Customer.",
        "Joint",
        ["service_reliability"],
        None,
        [
            "In this data, request counts do not grow with Site size, so the rate mostly flags small Sites.",
            "The workbook records no request type.",
        ],
        view="KAM",
    ),
    signal(
        "Late service cycles above peers",
        PERFORMANCE,
        ["late_service_cycles", "on_time_service_cycle_share", "turnaround_by_stage"],
        SITE,
        "Late service cycle share, late over sampled cycles, 50% or more above the median of the Customer's other "
        "Sites. The Site's turnaround by stage is attached.",
        CYCLE_FIELDS,
        {"threshold": 0.5, "minimum_sampled_cycles": 100, "minimum_late_cycles": 10},
        {"minimum_sampled_cycles": "sampled cycles", "minimum_late_cycles": "late cycles"},
        "Investigate the late cycles by stage.",
        "Lindström",
        ["service_reliability"],
        None,
        [SAMPLE_CAVEAT],
    ),
    signal(
        "Repair rate above peers",
        OPERATIONAL_VALUE,
        ["repair_rate"],
        SITE_PRODUCT,
        "Repairs per 1,000 packed pieces on the Site's product row, 15% or more above the median of the "
        "Customer's other Sites with the same product.",
        ["Repairs.repair_count", "Service_Activity.packed_pieces"],
        {"threshold": 0.15, "minimum_packed_pieces": 1000, "minimum_repairs": 20},
        {"minimum_packed_pieces": "packed pieces", "minimum_repairs": "repairs"},
        "Check fit, working conditions and handling for that garment.",
        "Joint",
        ["circularity"],
        None,
        ["A higher repair rate also means more garments kept in use."],
    ),
)

GRAIN_TEXT = {SITE: "Site", SITE_PRODUCT: "Site, product"}
COMPARISON_TEXT = {
    SITE: "The median of the Customer's other Sites, at least 3 peers.",
    SITE_PRODUCT: "The median of the Customer's other Sites with the same product, at least 3 peers.",
}


def signals_catalogue() -> list[Record]:
    return [
        {
            "id": s["id"],
            "name": s["name"],
            "evidence_area": s["area"][0],
            "core_or_industry": "Core KPI",
            "customer_question": s["area"][1],
            "definition": s["definition"],
            "source_fields": list(s["source_fields"]),
            "grain": GRAIN_TEXT[s["grain"]],
            "view": s["view"],
            "review_part": "Look forward",
            "data_status": "SYNTHETIC",
            "threshold_data_status": "TEAM_ASSUMPTION",
            "rationale": SIGNAL_RATIONALE,
            "assumptions": [],
            "caveats": [*s["caveats"], KAM_ONLY_RESULTS_CAVEAT],
            "kpi_ids": list(s["kpi_ids"]),
            "comparison": COMPARISON_TEXT[s["grain"]],
            "rule": (
                "Fires when the gap to the peer median, (Site value minus peer median) divided by peer median, "
                f"is {round(100 * s['thresholds']['threshold'])}% or more."
            ),
            "thresholds": dict(s["thresholds"]),
            "minimum_volume": [
                {"parameter": name, "value": s["thresholds"][name], "counts": text}
                for name, text in s["guard_texts"].items()
            ],
            "lever": s["lever"],
            "lever_owner": s["lever_owner"],
            "customer_priority_ids": list(s["customer_priority_ids"]),
            "size": s["size"],
        }
        for s in SIGNALS
    ]


# Inputs: additive month components per Site and per Site and product, so a later
# analytics layer can re-evaluate the signals with overrides or for another period.

SITE_PRODUCT_KEYS = ["customer_id", "site_id", "product_id"]
SITE_KEYS = ["customer_id", "site_id"]


def site_product_month_inputs(activity: list[Record], repairs: list[Record], impacts: list[Record]) -> list[Record]:
    rows = {
        (f["customer_id"], f["site_id"], f["product_id"], f["month"]): {**f, "repairs": 0}
        for f in month_facts(
            activity, SITE_PRODUCT_KEYS, ["active_wearers", "allocated_pieces", "washed_pieces", "packed_pieces"]
        )
    }
    for f in month_facts(repairs, SITE_PRODUCT_KEYS, ["repair_count"]):
        rows[(f["customer_id"], f["site_id"], f["product_id"], f["month"])]["repairs"] = f["repair_count"]
    emissions = [
        {**r, "allocated_emissions_kgco2e": r["allocated_process_kgco2e"] + r["allocated_delivery_kgco2e"]}
        for r in impacts
    ]
    for f in month_facts(emissions, SITE_PRODUCT_KEYS, ["allocated_water_l", "allocated_emissions_kgco2e"]):
        row = rows[(f["customer_id"], f["site_id"], f["product_id"], f["month"])]
        row["allocated_water_l"] = f["allocated_water_l"]
        row["allocated_emissions_kgco2e"] = f["allocated_emissions_kgco2e"]
    return [rows[k] for k in sorted(rows)]


def site_month_inputs(activity: list[Record], cycles: list[Record]) -> list[Record]:
    """Per Site and month. Active wearers follow the wearer counting rule."""
    fields = ["active_wearers", "allocated_pieces", "active_assets_scanned", "service_requests"]
    rows = {
        (f["customer_id"], f["site_id"], f["month"]): {
            **{k: f[k] for k in [*SITE_KEYS, "month", *fields]},
            "sampled_cycles": 0,
            "late_cycles": 0,
        }
        for f in site_month_facts(activity)
    }
    for f in month_facts(cycles, SITE_KEYS, ["cycles", "late_cycles"]):
        row = rows[(f["customer_id"], f["site_id"], f["month"])]
        row["sampled_cycles"], row["late_cycles"] = f["cycles"], f["late_cycles"]
    return [rows[k] for k in sorted(rows)]


def period_totals(rows: list[Record], keys: list[str], months: list[str]) -> dict[tuple, Record]:
    """Sum every numeric field per key over the given months."""
    totals: dict[tuple, Record] = {}
    for row in rows:
        if row["month"] not in months:
            continue
        key = tuple(row[k] for k in keys)
        total = totals.setdefault(key, {k: row[k] for k in keys})
        for field, value in row.items():
            if field not in keys and field != "month":
                total[field] = total.get(field, 0) + value
    return totals


def _ratio(numerator: float, denominator: float, scale: float = 1) -> float | None:
    return scale * numerator / denominator if denominator else None


# Per signal: (value, volume, events, guard counts) from one unit's period totals and the number of months.
MEASURES: dict[str, Callable[[Record, int], tuple]] = {
    "garment_allocation_above_peers": lambda t, n: (
        _ratio(t["allocated_pieces"], t["active_wearers"]),
        t["active_wearers"] / n,
        None,
        {"minimum_active_wearers": t["active_wearers"] / n},
    ),
    "allocated_garments_with_no_scan_activity_above_peers": lambda t, n: (
        None if not t["allocated_pieces"] else 1 - t["active_assets_scanned"] / t["allocated_pieces"],
        t["allocated_pieces"] / n,
        None,
        {"minimum_allocated_pieces": t["allocated_pieces"] / n},
    ),
    "washes_per_garment_above_peers": lambda t, n: (
        _ratio(t["washed_pieces"], t["allocated_pieces"]),
        t["allocated_pieces"] / n,
        None,
        {"minimum_allocated_pieces": t["allocated_pieces"] / n},
    ),
    "service_request_rate_above_peers": lambda t, n: (
        _ratio(t["service_requests"], t["active_wearers"], 100),
        t["active_wearers"],
        t["service_requests"],
        {"minimum_wearer_months": t["active_wearers"], "minimum_service_requests": t["service_requests"]},
    ),
    "late_service_cycles_above_peers": lambda t, n: (
        _ratio(t["late_cycles"], t["sampled_cycles"]),
        t["sampled_cycles"],
        t["late_cycles"],
        {"minimum_sampled_cycles": t["sampled_cycles"], "minimum_late_cycles": t["late_cycles"]},
    ),
    "repair_rate_above_peers": lambda t, n: (
        _ratio(t["repairs"], t["packed_pieces"], 1000),
        t["packed_pieces"],
        t["repairs"],
        {"minimum_packed_pieces": t["packed_pieces"], "minimum_repairs": t["repairs"]},
    ),
}


def _count_text(value: float) -> str:
    return f"{value:,}" if float(value).is_integer() else f"{value:,.1f}"


def guard_reason(spec: Record, counts: Record, thresholds: Record) -> str | None:
    """Why a unit is under its guards, naming every guard it misses, or None."""
    short = [
        f"{_count_text(counts[name])} {text}, under the minimum of {thresholds[name]:,}."
        for name, text in spec["guard_texts"].items()
        if counts[name] < thresholds[name]
    ]
    return " ".join(short) or None


def size_figure(spec: Record, result: Record, total: Record, months: int) -> Record | None:
    """The size figure of signals 1 to 3, None for the others.

    Signal 2 gives its no-scan count for every unit. Signals 1 and 3 give the amount above the peer
    level, which is null unless the unit is evaluated and above its peers.
    """
    sid = spec["id"]
    if sid == "allocated_garments_with_no_scan_activity_above_peers":
        no_scan = (total["allocated_pieces"] - total["active_assets_scanned"]) / months
        return {"allocated_garments_with_no_scan_activity": round(no_scan, FLOAT_DIGITS)}
    above = result["gap"] is not None and result["gap"] > 0
    if sid == "garment_allocation_above_peers":
        garments = (total["active_wearers"] / months) * (result["value"] - result["peer_median"]) if above else None
        return {"garments_above_peer_level": round_or_none(garments)}
    if sid == "washes_per_garment_above_peers":
        share = 1 - result["peer_median"] / result["value"] if above else None
        return {
            "data_status": ALLOCATED_ESTIMATE,
            "water_l_above_peer_level": round_or_none(share and total["allocated_water_l"] * share),
            "emissions_kgco2e_above_peer_level": round_or_none(share and total["allocated_emissions_kgco2e"] * share),
        }
    return None


def stage_medians(cycles: list[Record]) -> Record | None:
    """The median hours of each turnaround stage, or None with no cycles."""
    if not cycles:
        return None
    stats = turnaround_stats(cycles)
    return {key: stats[key] for key, _, _ in CYCLE_STAGES}


def result_order(result: Record) -> tuple:
    """Evaluated results by gap, largest first, then the not evaluated ones."""
    evaluated = result["not_evaluated_reason"] is None
    return (
        not evaluated,
        -result["gap"] if evaluated else 0,
        result["customer_id"],
        result["site_id"],
        result["product_id"] or "",
    )


def evaluate_signal(spec: Record, inputs: Record, cycles: list[Record], months: list[str], thresholds: Record) -> list[Record]:
    """Every Site, or Site and product, of every Customer for one signal over the given months."""
    by_product = spec["grain"] == SITE_PRODUCT
    keys = SITE_PRODUCT_KEYS if by_product else SITE_KEYS
    totals = period_totals(inputs["site_product_month" if by_product else "site_month"], keys, months)
    measures = {key: MEASURES[spec["id"]](total, len(months)) for key, total in totals.items()}
    units = [
        {
            "customer_id": total["customer_id"],
            "site_id": total["site_id"],
            "product_id": total.get("product_id"),
            "value": measures[key][0],
            "guard_reason": guard_reason(spec, measures[key][3], thresholds),
        }
        for key, total in sorted(totals.items())
    ]
    results = []
    for r in compare_with_peers(units, thresholds["threshold"], MINIMUM_PEERS):
        key = tuple(r[k] for k in keys)
        _, volume, events, _ = measures[key]
        result = {
            "signal_id": spec["id"],
            "customer_id": r["customer_id"],
            "site_id": r["site_id"],
            "product_id": r["product_id"],
            "value": round_or_none(r["value"]),
            "peer_median": round_or_none(r["peer_median"]),
            "peer_count": r["peer_count"],
            "gap": round_or_none(r["gap"]),
            "volume": round_or_none(volume),
            "events": events,
            "fired": r["fired"],
            "not_evaluated_reason": r["not_evaluated_reason"],
            "view": "Both" if r["fired"] and spec["view"] == "Both" else "KAM",
            "size": size_figure(spec, r, totals[key], len(months)),
        }
        if spec["id"] == "late_service_cycles_above_peers":
            result["turnaround_by_stage"] = stage_medians([c for c in cycles if c["site_id"] == r["site_id"]])
        results.append(result)
    return sorted(results, key=result_order)


def build_opportunity_signals(wb: Workbook) -> Record:
    months = data_months(wb)
    activity = wb.records("Service_Activity")
    cycles = [c for c in cycle_rows(wb.records("Service_Cycles")) if c["month"] in months]
    inputs = {
        "site_product_month": site_product_month_inputs(activity, wb.records("Repairs"), wb.records("Customer_Impacts")),
        "site_month": site_month_inputs(activity, cycles),
    }
    defaults = {s["id"]: dict(s["thresholds"]) for s in SIGNALS}
    evaluations = [
        {"signal_id": s["id"], "results": evaluate_signal(s, inputs, cycles, months, defaults[s["id"]])}
        for s in SIGNALS
    ]
    orders = customer_default_orders(wb.records("Customers"), wb.records("Industry_Priorities"))
    return {
        "catalogue": signals_catalogue(),
        "data": {
            "defaults": {"period": data_year(months), "minimum_peers": MINIMUM_PEERS, "signals": defaults},
            "evaluations": evaluations,
            "ranking": rank_fired(
                [r for e in evaluations for r in e["results"] if r["fired"]],
                {s["id"]: s["customer_priority_ids"] for s in SIGNALS},
                {customer_id: order["priority_ids"] for customer_id, order in orders.items()},
            ),
            "inputs": inputs,
        },
    }
