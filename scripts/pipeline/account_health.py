"""Account health (#9)."""

from __future__ import annotations

from .catalogue import ADOPTION, CYCLE_FIELDS, PERFORMANCE, SAMPLE_CAVEAT, catalogue_id
from .facts import FLOAT_DIGITS, customer_active_wearers, cycle_rows, ratio_of_totals, site_month_facts
from .workbook import Record, Workbook, data_months, data_year


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
_INPUT_SPECS: tuple[Record, ...] = (
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

ACCOUNT_HEALTH_INPUTS: tuple[Record, ...] = tuple(
    {**spec, "id": catalogue_id(spec["name"])} for spec in _INPUT_SPECS
)

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
