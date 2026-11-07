"""Improvement period comparisons (#10)."""

from __future__ import annotations

import math

from .catalogue import CYCLE_FIELDS, SAMPLE_CAVEAT, catalogue_id
from .facts import FLOAT_DIGITS, cycle_rows, cycles_outside_data_months_notes, ratio_of_totals, site_month_facts
from .workbook import Record, Workbook, data_months, data_year


# Improvement period comparisons (ADR 0010): the same 3 KPIs as account health,
# compared between a period and its comparison period. Count tests judge the
# 2 count KPIs; a points threshold judges scan coverage.

# Two outcomes whose probabilities differ by less than 1 in 10**7 count as equally extreme.
EXTREME_TOLERANCE_PARTS = 10**7


def _two_sided_p(weights: dict[int, int], observed: int) -> float:
    """Sum of the outcome probabilities no larger than the observed one's. weights are exact integers."""
    limit = weights[observed] * (EXTREME_TOLERANCE_PARTS + 1)
    extreme = sum(w for w in weights.values() if w * EXTREME_TOLERANCE_PARTS <= limit)
    return min(1.0, extreme / sum(weights.values()))


def fisher_exact_two_sided(events_1: int, trials_1: int, events_2: int, trials_2: int) -> float:
    """Two-sided Fisher exact test of events against trials in 2 groups, for example late against sampled cycles."""
    events = events_1 + events_2
    low, high = max(0, events - trials_2), min(events, trials_1)
    weights = {x: math.comb(trials_1, x) * math.comb(trials_2, events - x) for x in range(low, high + 1)}
    return _two_sided_p(weights, events_1)


def conditional_binomial_two_sided(events_1: int, exposure_1: int, events_2: int, exposure_2: int) -> float:
    """Two-sided exact conditional binomial test of 2 event rates, for example service requests against wearer-months.

    Given the total events, the first group's count is binomial with p = exposure_1 / (exposure_1 + exposure_2).
    Exposures are whole numbers, so every probability is an exact integer ratio.
    """
    events = events_1 + events_2
    weights = {k: math.comb(events, k) * exposure_1**k * exposure_2 ** (events - k) for k in range(events + 1)}
    return _two_sided_p(weights, events_1)


IMPROVEMENT = ("Improvement", "Are the issues we raise being solved?")
COMPARISON_LABELS = ("worse", "better", "no_clear_change", "not_evaluated")
SITE_CHANCE_CAVEAT = "About 1 in 20 Sites shows a clear change by chance alone."
COMPARISON_RATIONALE = (
    "No public benchmark exists. Set so that 2025 noise between half-years is not reported as change."
)
NOT_AVAILABLE = "not available: the data holds 2025 only"

# Override parameters of the Improvement tool, all TEAM_ASSUMPTION.
IMPROVEMENT_DEFAULTS: Record = {
    "test_level": 0.95,
    "scan_coverage_threshold_points": 5,
    "minimum_sampled_cycles": 100,
    "minimum_wearer_months": 600,
    "minimum_allocated_pieces_monthly_average": 500,
}

# Each comparison: its catalogue text, the KPI compared, how it is judged, its guard and its volume.
_COMPARISON_SPECS: tuple[Record, ...] = (
    {
        "name": "Improvement on-time service cycles",
        "kpi_id": "on_time_service_cycle_share",
        "better_when": "higher",
        "judged_by": "count_test",
        "judged_by_text": "Two-sided Fisher exact test on late cycles against sampled cycles, at the test level (95%).",
        "minimum_volume_parameter": "minimum_sampled_cycles",
        "volume_text": "sampled cycles",
        "source_fields": CYCLE_FIELDS,
        "caveats": [SITE_CHANCE_CAVEAT, SAMPLE_CAVEAT],
    },
    {
        "name": "Improvement service requests",
        "kpi_id": "service_requests_per_100_wearers",
        "better_when": "lower",
        "judged_by": "count_test",
        "judged_by_text": (
            "Two-sided exact conditional binomial test on service requests against wearer-months, "
            "at the test level (95%)."
        ),
        "minimum_volume_parameter": "minimum_wearer_months",
        "volume_text": "wearer-months",
        "source_fields": ["Service_Activity.service_requests", "Service_Activity.active_wearers"],
        "caveats": [SITE_CHANCE_CAVEAT],
    },
    {
        "name": "Improvement scan coverage",
        "kpi_id": "scan_coverage",
        "better_when": "higher",
        "judged_by": "points_threshold",
        "judged_by_text": (
            "A change of 5 points or more. Scan coverage counts the same garments every month, "
            "so a count test does not fit."
        ),
        "minimum_volume_parameter": "minimum_allocated_pieces_monthly_average",
        "volume_text": "allocated pieces, monthly average",
        "source_fields": ["Service_Activity.active_assets_scanned", "Service_Activity.allocated_pieces"],
        "caveats": [SITE_CHANCE_CAVEAT],
    },
)
PERIOD_COMPARISONS: tuple[Record, ...] = tuple(
    {**spec, "id": catalogue_id(spec["name"])} for spec in _COMPARISON_SPECS
)


def improvement_catalogue() -> list[Record]:
    """The 3 period comparisons of the Improvement evidence area."""
    return [
        {
            "id": spec["id"],
            "name": spec["name"],
            "evidence_area": IMPROVEMENT[0],
            "core_or_industry": "Core KPI",
            "customer_question": IMPROVEMENT[1],
            "definition": (
                f"The KPI's value in the selected period set against its value in the comparison period. "
                f"{spec['judged_by_text']} Not evaluated under {IMPROVEMENT_DEFAULTS[spec['minimum_volume_parameter']]:,} "
                f"{spec['volume_text']} in either period."
            ),
            "source_fields": list(spec["source_fields"]),
            "grain": "Customer, Site",
            "view": "Both",
            "site_view": "KAM",
            "review_part": "Look forward",
            "data_status": "SYNTHETIC",
            "threshold_data_status": "TEAM_ASSUMPTION",
            "rationale": COMPARISON_RATIONALE,
            "kpi_id": spec["kpi_id"],
            "better_when": spec["better_when"],
            "judged_by": spec["judged_by"],
            "minimum_volume_parameter": spec["minimum_volume_parameter"],
            "minimum_volume": IMPROVEMENT_DEFAULTS[spec["minimum_volume_parameter"]],
            "assumptions": [],
            "caveats": [
                *spec["caveats"],
                "Site results are shown in the KAM view only.",
                "Not an opportunity signal: results are never ranked with signals.",
            ],
        }
        for spec in PERIOD_COMPARISONS
    ]


def compare_to_convention(months: list[str]) -> Record:
    """The compare_to values, the default rule and the answers for comparisons the data cannot give."""
    year = data_year(months)
    return {
        "values": [
            {
                "value": "previous_period",
                "definition": "The same number of whole months just before the selected period, only when all "
                "of those months are in the data.",
            },
            {"value": "h2_vs_h1", "definition": f"H2 {year} against H1 {year}."},
            {"value": "none", "definition": "No comparison."},
        ],
        "default_rule": [
            {
                "selected_period": f"All of {year}",
                "compare_to": "h2_vs_h1",
                "label": f"within {year}",
                "text": f"All of {year} has no previous period in the data, so H2 is compared with H1.",
            },
            {
                "selected_period": "A shorter period",
                "compare_to": "previous_period",
                "label": None,
                "text": "The previous period, when all its months are in the data. For example, Q3 is compared "
                "with Q2.",
            },
        ],
        "not_available": [
            {"request": "Year on year", "answer": NOT_AVAILABLE},
            {"request": "Previous period of a period that starts in January", "answer": NOT_AVAILABLE},
        ],
        "h1_months": months[:6],
        "h2_months": months[6:],
        "change_figures_ruled_out": [
            "Month over month and rolling windows are not change figures. Monthly values stay available as a "
            "series at the month grain.",
        ],
    }


def comparison_side(spec: Record, site_months: list[Record], cycles: list[Record], months: list[str]) -> Record:
    """One Customer's or Site's value, volume and counts for one comparison over some months."""
    if spec["kpi_id"] == "on_time_service_cycle_share":
        sampled = len(cycles)
        late = sum(c["late_cycles"] for c in cycles)
        value = (sampled - late) / sampled if sampled else None
        return {"value": value, "volume": sampled, "counts": {"late_cycles": late, "sampled_cycles": sampled}}
    if spec["kpi_id"] == "service_requests_per_100_wearers":
        requests = sum(r["service_requests"] for r in site_months)
        wearer_months = sum(r["active_wearers"] for r in site_months)
        value = 100 * requests / wearer_months if wearer_months else None
        return {
            "value": value,
            "volume": wearer_months,
            "counts": {"service_requests": requests, "wearer_months": wearer_months},
        }
    scanned = sum(r["active_assets_scanned"] for r in site_months)
    allocated = sum(r["allocated_pieces"] for r in site_months)
    return {
        "value": ratio_of_totals(site_months, "active_assets_scanned", "allocated_pieces"),
        "volume": round(allocated / len(months)),
        "counts": {"active_assets_scanned": scanned, "allocated_pieces": allocated},
    }


def judge_comparison(spec: Record, period: Record, comparison: Record, params: Record) -> tuple[str, float | None]:
    """The label and test p-value for 2 sides that both pass the guard."""
    change = period["value"] - comparison["value"]
    if spec["judged_by"] == "points_threshold":
        clear, p_value = round(abs(100 * change), FLOAT_DIGITS) >= params["scan_coverage_threshold_points"], None
    else:
        a, b = comparison["counts"], period["counts"]
        if spec["kpi_id"] == "on_time_service_cycle_share":
            p_value = fisher_exact_two_sided(a["late_cycles"], a["sampled_cycles"], b["late_cycles"], b["sampled_cycles"])
        else:
            p_value = conditional_binomial_two_sided(
                a["service_requests"], a["wearer_months"], b["service_requests"], b["wearer_months"]
            )
        clear = p_value < 1 - params["test_level"]
    if not clear or change == 0:
        return "no_clear_change", p_value
    went_up = change > 0
    return ("better" if went_up == (spec["better_when"] == "higher") else "worse"), p_value


def compare_entity(
    spec: Record,
    scope: str,
    scope_id: str,
    customer_id: str,
    period: tuple[str, list[str]],
    comparison_period: tuple[str, list[str]],
    site_months: list[Record],
    cycles: list[Record],
    params: Record,
) -> Record:
    """One Customer's or Site's result for one comparison."""
    field = f"{scope}_id"
    sides = {}
    for key, (_, months) in (("period", period), ("comparison_period", comparison_period)):
        rows = [r for r in site_months if r[field] == scope_id and r["month"] in months]
        sampled = [c for c in cycles if c[field] == scope_id and c["month"] in months]
        sides[key] = comparison_side(spec, rows, sampled, months)

    minimum = params[spec["minimum_volume_parameter"]]
    short = [
        f"{sides[key]['volume']:,} {spec['volume_text']} in {name}, under the minimum of {minimum:,}."
        for key, (name, _) in (("comparison_period", comparison_period), ("period", period))
        if sides[key]["value"] is None or sides[key]["volume"] < minimum
    ]
    if short:
        label, p_value, reason = "not_evaluated", None, " ".join(short)
    else:
        (label, p_value), reason = judge_comparison(spec, sides["period"], sides["comparison_period"], params), None

    now, before = sides["period"]["value"], sides["comparison_period"]["value"]
    change = None if now is None or before is None else now - before
    relative = None if change is None or not before else change / before

    def rounded(value):
        return None if value is None else round(value, FLOAT_DIGITS)

    return {
        "comparison_id": spec["id"],
        "scope": scope,
        "scope_id": scope_id,
        "customer_id": customer_id,
        "view": "KAM" if scope == "site" else "Both",
        "period": {"name": period[0], **sides["period"], "value": rounded(now)},
        "comparison_period": {"name": comparison_period[0], **sides["comparison_period"], "value": rounded(before)},
        "change": rounded(change),
        "relative_change": rounded(relative),
        "label": label,
        "not_evaluated_reason": reason,
        "p_value": rounded(p_value),
        "caveats": [c for c in spec["caveats"] if scope == "site" or c != SITE_CHANCE_CAVEAT],
    }


def site_result_order(result: Record) -> tuple:
    """Worse, better, no clear change, then not evaluated; within each, the largest relative change first."""
    relative = result["relative_change"]
    return (
        COMPARISON_LABELS.index(result["label"]),
        relative is None,
        -abs(relative or 0),
        result["scope_id"],
    )


def improvement_results(
    service_activity: list[Record], cycles: list[Record], months: list[str], params: Record
) -> Record:
    """The default comparison for the data year, H2 against H1: per comparison and Customer, the Customer and its Sites."""
    year = data_year(months)
    period = (f"H2 {year}", months[6:])
    comparison_period = (f"H1 {year}", months[:6])
    site_months = site_month_facts(service_activity)
    sites_of: dict[str, list[str]] = {}
    for row in site_months:
        sites_of.setdefault(row["customer_id"], [])
        if row["site_id"] not in sites_of[row["customer_id"]]:
            sites_of[row["customer_id"]].append(row["site_id"])

    comparisons = []
    for spec in PERIOD_COMPARISONS:
        for customer_id in sorted(sites_of):
            common = (period, comparison_period, site_months, cycles, params)
            sites = [compare_entity(spec, "site", s, customer_id, *common) for s in sorted(sites_of[customer_id])]
            comparisons.append({
                "comparison_id": spec["id"],
                "customer_id": customer_id,
                "customer_result": compare_entity(spec, "customer", customer_id, customer_id, *common),
                "site_results": sorted(sites, key=site_result_order),
            })
    return {
        "selected_period": year,
        "compare_to": "h2_vs_h1",
        "label": f"within {year}",
        "period": {"name": period[0], "months": period[1]},
        "comparison_period": {"name": comparison_period[0], "months": comparison_period[1]},
        "comparisons": comparisons,
    }


def build_period_comparisons(wb: Workbook) -> Record:
    months = data_months(wb)
    if len(months) != 12:
        raise ValueError(f"H2 against H1 needs 12 data months, found {len(months)}")
    all_cycles = cycle_rows(wb.records("Service_Cycles"))
    cycles = [c for c in all_cycles if c["month"] in months]
    return {
        "catalogue": improvement_catalogue(),
        "data": {
            "defaults": dict(IMPROVEMENT_DEFAULTS),
            "compare_to": compare_to_convention(months),
            "results": improvement_results(wb.records("Service_Activity"), cycles, months, IMPROVEMENT_DEFAULTS),
            "data_transparency_notes": cycles_outside_data_months_notes(all_cycles, months),
        },
    }
