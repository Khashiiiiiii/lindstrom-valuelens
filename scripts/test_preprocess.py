"""Acceptance checks for scripts/preprocess.py, run against the real 2025 workbook.

Run: python -m pytest scripts
"""

import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).resolve().parent
REPO = SCRIPTS.parent
WORKBOOK = REPO / "data" / "raw" / "Lindstrom_SinceAI_Customer_Value_Synthetic_Data_Pack.xlsx"


def run_preprocess(out_dir: Path) -> None:
    subprocess.run(
        [sys.executable, str(SCRIPTS / "preprocess.py"), "--xlsx", str(WORKBOOK), "--out", str(out_dir)],
        check=True,
    )


@pytest.fixture(scope="module")
def out_dir(tmp_path_factory) -> Path:
    out = tmp_path_factory.mktemp("processed")
    run_preprocess(out)
    return out


@pytest.fixture(scope="module")
def master(out_dir) -> dict:
    return json.loads((out_dir / "master-data.json").read_text(encoding="utf-8"))


def test_master_data_has_meta_catalogue_and_data(master):
    assert set(master) == {"meta", "catalogue", "data"}
    assert master["meta"]["source_sha256"] == hashlib.sha256(WORKBOOK.read_bytes()).hexdigest()


def test_master_data_holds_three_customers(master):
    ids = [c["customer_id"] for c in master["data"]["customers"]]
    assert ids == ["CUST001", "CUST002", "CUST003"]


def test_customer_priority_topics_are_an_ordered_array(master):
    northstar = master["data"]["customers"][0]
    assert northstar["priority_topics"] == ["Water efficiency", "Hygiene", "Service continuity", "Scope 3 evidence"]
    assert northstar["data_status"] == "SYNTHETIC"


def test_sites_per_customer(master):
    sites = master["data"]["sites"]
    assert len(sites) == 34
    per_customer = {}
    for site in sites:
        per_customer[site["customer_id"]] = per_customer.get(site["customer_id"], 0) + 1
    assert per_customer == {"CUST001": 24, "CUST002": 6, "CUST003": 4}
    s002 = next(s for s in sites if s["site_id"] == "S002")
    assert (s002["site_type"], s002["primary_laundry_id"], s002["data_status"]) == ("Production Plant", "L001", "SYNTHETIC")


def test_products_laundries_baselines_and_assumptions(master):
    data = master["data"]
    assert [p["product_id"] for p in data["products"]] == ["P1001", "P1002", "P1003", "P1004", "P1005", "P1006"]
    assert [l["laundry_id"] for l in data["laundries"]] == ["L001", "L002", "L003", "L004"]
    assert [b["baseline_id"] for b in data["baselines"]] == ["B_LOCAL", "B_HOME", "B_INHOUSE"]
    assert data["default_baseline_id"] == "B_LOCAL"
    assert [a["assumption_id"] for a in data["assumptions"]] == [f"A00{i}" for i in range(1, 9)]


def test_industry_priorities_and_data_quality(master):
    data = master["data"]
    assert len(data["industry_priorities"]) == 9
    food = [p["priority_theme"] for p in data["industry_priorities"] if p["industry"] == "Food & Beverage"]
    assert food == ["Hygiene and compliance", "Water efficiency", "Service reliability"]
    assert [d["dataset"] for d in data["data_quality"]][:2] == ["Customers", "Service_Activity"]
    assert len(data["data_quality"]) == 7


def test_months_are_the_twelve_months_of_2025(master):
    assert master["data"]["months"] == [f"2025-{m:02d}" for m in range(1, 13)]


def test_product_presets(master):
    presets = {p["preset_id"]: p["product_ids"] for p in master["data"]["product_presets"]}
    assert presets == {
        "food_industry_garments": ["P1004"],
        "healthcare_garments": ["P1005"],
        "safety_garments": ["P1003", "P1006"],
    }


def test_site_type_groups_count_sites_per_customer_and_site_type(master):
    northstar = {
        g["site_type"]: g["site_count"]
        for g in master["data"]["site_type_groups"]
        if g["customer_id"] == "CUST001"
    }
    assert northstar == {"Production Plant": 7, "Distribution Center": 6, "Office & Operations": 11}
    production = next(
        g for g in master["data"]["site_type_groups"]
        if (g["customer_id"], g["site_type"]) == ("CUST001", "Production Plant")
    )
    assert production["site_ids"] == ["S002", "S006", "S007", "S009", "S011", "S016", "S018"]


def test_running_twice_gives_byte_identical_output(out_dir, tmp_path):
    run_preprocess(tmp_path)
    first = {p.name: p.read_bytes() for p in sorted(out_dir.glob("*.json"))}
    second = {p.name: p.read_bytes() for p in sorted(tmp_path.glob("*.json"))}
    assert first and first == second


# Shared helpers that later builders use.

sys.path.insert(0, str(SCRIPTS))
import pipeline.account_health  # noqa: E402
import pipeline.catalogue  # noqa: E402
import pipeline.customer_priorities  # noqa: E402
import pipeline.facts  # noqa: E402
import pipeline.footprint_handprint_kpis  # noqa: E402
import pipeline.period_comparisons  # noqa: E402
import pipeline.service_kpis  # noqa: E402
import pipeline.workbook  # noqa: E402


@pytest.fixture(scope="module")
def workbook():
    return pipeline.workbook.Workbook(WORKBOOK)


def test_customer_active_wearers_take_the_largest_product_row_per_site(workbook):
    # ADR 0003: NorthStar in December reads 9,607, not the 28,367 that summing product rows gives.
    by_customer = pipeline.facts.customer_active_wearers(workbook.records("Service_Activity"))
    assert by_customer[("CUST001", "2025-12")] == 9607


def test_active_wearers_over_a_period_are_the_monthly_average():
    rows = [
        {"customer_id": "C", "site_id": "S1", "month": "2025-01", "active_wearers": 100},
        {"customer_id": "C", "site_id": "S1", "month": "2025-01", "active_wearers": 90},
        {"customer_id": "C", "site_id": "S2", "month": "2025-01", "active_wearers": 50},
        {"customer_id": "C", "site_id": "S1", "month": "2025-02", "active_wearers": 120},
        {"customer_id": "C", "site_id": "S2", "month": "2025-02", "active_wearers": 70},
    ]
    monthly = pipeline.facts.customer_active_wearers(rows)
    assert monthly == {("C", "2025-01"): 150, ("C", "2025-02"): 190}
    assert pipeline.facts.period_average(monthly, "C", ["2025-01", "2025-02"]) == 170


def test_month_facts_sum_additive_fields_by_key_and_month():
    rows = [
        {"site_id": "S1", "month": "2025-01", "on_time": 9, "cycles": 10},
        {"site_id": "S1", "month": "2025-01", "on_time": 1, "cycles": 10},
        {"site_id": "S1", "month": "2025-02", "on_time": 90, "cycles": 100},
    ]
    facts = pipeline.facts.month_facts(rows, ["site_id"], ["on_time", "cycles"])
    assert facts == [
        {"site_id": "S1", "month": "2025-01", "on_time": 10, "cycles": 20},
        {"site_id": "S1", "month": "2025-02", "on_time": 90, "cycles": 100},
    ]


def test_ratio_is_rebuilt_from_summed_totals_not_averaged():
    # Row ratios 0.5 and 0.9 average to 0.7; the totals give 100 / 120.
    facts = [{"on_time": 10, "cycles": 20}, {"on_time": 90, "cycles": 100}]
    assert pipeline.facts.ratio_of_totals(facts, "on_time", "cycles") == pytest.approx(100 / 120)
    assert pipeline.facts.ratio_of_totals([], "on_time", "cycles") is None


# operational-circularity-kpis.json


@pytest.fixture(scope="module")
def circularity(out_dir) -> dict:
    return json.loads((out_dir / "operational-circularity-kpis.json").read_text(encoding="utf-8"))


def northstar(rows: list[dict]) -> list[dict]:
    return [r for r in rows if r["customer_id"] == "CUST001"]


def test_repairs_hold_one_row_per_month_site_product_and_repair_type(circularity):
    repairs = circularity["data"]["repairs"]
    assert len(repairs) == 3635
    assert len({(r["month"], r["site_id"], r["product_id"], r["repair_type"]) for r in repairs}) == 3635
    assert sum(r["repair_count"] for r in northstar(repairs)) == 15233


def test_avoided_product_co2e_applies_the_default_postponement_ratio(circularity):
    # A002. The JSON stores raw repair counts, and the KPI layer applies the ratio.
    ratio = circularity["data"]["defaults"]["postponement_ratio"]
    assert ratio == 1
    repairs = northstar(circularity["data"]["repairs"])
    avoided = sum(r["repair_count"] * ratio * r["product_footprint_kgco2e"] for r in repairs)
    assert round(avoided) == 224252
    half = sum(r["repair_count"] * 0.5 * r["product_footprint_kgco2e"] for r in repairs)
    assert round(half / 1000) == 112


def repairs_per_1000(repairs: list[dict], packed: list[dict]) -> float:
    return sum(r["repair_count"] for r in repairs) / sum(p["packed_pieces"] for p in packed) * 1000


def test_repair_rate_per_1000_packed_pieces(circularity):
    repairs, packed = circularity["data"]["repairs"], circularity["data"]["packed_pieces"]
    assert len(packed) == 1248
    assert round(repairs_per_1000(northstar(repairs), northstar(packed)), 1) == 20.8
    # Product totals across all Customers. Only Apex has P1003, and only Mediora has P1005.
    for product_id, rate in [("P1003", 34.3), ("P1005", 11.4)]:
        rows = [r for r in repairs if r["product_id"] == product_id]
        pieces = [p for p in packed if p["product_id"] == product_id]
        assert round(repairs_per_1000(rows, pieces), 1) == rate


def test_repair_quotient_pct_ties_back_on_every_workbook_row(circularity, workbook):
    packed = {(p["month"], p["site_id"], p["product_id"]): p["packed_pieces"] for p in circularity["data"]["packed_pieces"]}
    rows = workbook.records("Repairs")
    assert len(rows) == 3635
    for row in rows:
        pieces = packed[(row["month"], row["site_id"], row["product_id"])]
        assert round(row["repair_count"] / pieces * 100, 2) == row["repair_quotient_pct"]


ROUTES = ["allocated_recycling_kg", "allocated_reuse_kg", "allocated_energy_recovery_kg", "allocated_incineration_kg"]


def test_textile_waste_is_allocated_per_site_product_and_laundry(circularity):
    waste = circularity["data"]["waste"]
    assert len(waste) == 1248
    # The Turku laundry serves no Customer.
    assert {w["laundry_id"] for w in waste} == {"L001", "L003", "L004"}
    rows = northstar(waste)
    assert round(sum(w["allocated_textile_waste_kg"] for w in rows)) == 16797
    assert [round(sum(w[route] for w in rows)) for route in ROUTES] == [12278, 819, 3243, 455]


def test_recycled_or_reused_share_and_waste_diverted_from_mixed_waste(circularity):
    rows = northstar(circularity["data"]["waste"])
    recycled_or_reused = sum(w["allocated_recycling_kg"] + w["allocated_reuse_kg"] for w in rows)
    total = sum(w["allocated_textile_waste_kg"] for w in rows)
    assert round(recycled_or_reused / total * 100, 1) == 78.0
    assert round(recycled_or_reused) == 13097


def test_laundry_waste_factors_are_grams_per_washed_kg(circularity):
    factors = {f["laundry_id"]: round(f["waste_g_per_washed_kg"], 1) for f in circularity["data"]["laundry_waste_factors"]}
    # Helsinki, Turku, Malmö, Warsaw. Each is the same in all 12 months.
    assert factors == {"L001": 26.3, "L002": 42.4, "L003": 42.2, "L004": 41.0}


CATALOGUE_FIELDS = {
    "id", "name", "evidence_area", "core_or_industry", "customer_question", "definition", "source_fields",
    "grain", "view", "review_part", "data_status", "assumptions", "caveats",
}


def test_catalogue_lists_the_eight_kpis_with_status_and_assumptions(circularity):
    catalogue = circularity["catalogue"]
    assert [(e["id"], e["evidence_area"], e["data_status"], e["assumptions"]) for e in catalogue] == [
        ("repairs", "Operational Value", "SYNTHETIC", []),
        ("repair_rate", "Operational Value", "SYNTHETIC", []),
        ("replacements_postponed_estimated", "Operational Value", "SYNTHETIC_ESTIMATE", ["A002"]),
        ("avoided_product_co2e_estimated", "Sustainability Value", "SYNTHETIC_ESTIMATE", ["A002", "A005"]),
        ("textile_waste_allocated", "Sustainability Value", "ALLOCATED_ESTIMATE_SYNTHETIC", ["A003"]),
        ("textile_waste_by_treatment_route", "Sustainability Value", "ALLOCATED_ESTIMATE_SYNTHETIC", ["A003"]),
        ("recycled_or_reused_share", "Sustainability Value", "ALLOCATED_ESTIMATE_SYNTHETIC", ["A003"]),
        (
            "textile_waste_diverted_from_mixed_waste_estimated",
            "Sustainability Value",
            "ALLOCATED_ESTIMATE_SYNTHETIC",
            ["A003", "A004"],
        ),
    ]
    for entry in catalogue:
        assert set(entry) == CATALOGUE_FIELDS
        assert (entry["core_or_industry"], entry["view"], entry["review_part"]) == ("Core KPI", "Both", "Show value")
        assert entry["caveats"]


def test_catalogue_source_fields_name_workbook_columns(circularity, workbook):
    for entry in circularity["catalogue"]:
        for field in entry["source_fields"]:
            sheet, column = field.split(".")
            assert column in workbook.records(sheet)[0], field


def test_catalogue_labels_use_glossary_terms(circularity):
    # Avoid terms of Repair, Replacement postponed, Textile waste and Treatment route.
    avoid = ["mend", "fix", "alteration", "avoided purchase", "saved garment", "scrap", "garment waste",
             "disposal method", "waste stream", "complaint"]
    for entry in circularity["catalogue"]:
        text = " ".join([entry["name"], entry["definition"], entry["customer_question"], entry["grain"], *entry["caveats"]])
        assert "—" not in text, entry["id"]
        for term in avoid:
            assert not re.search(rf"\b{term}\b", text, re.IGNORECASE), (entry["id"], term)


# service-kpis.json


@pytest.fixture(scope="module")
def service(out_dir) -> dict:
    return json.loads((out_dir / "service-kpis.json").read_text(encoding="utf-8"))


def _cycle_totals(facts, **match):
    rows = [f for f in facts if all(f[k] == v for k, v in match.items())]
    return sum(f["cycles"] for f in rows), sum(f["late_cycles"] for f in rows)


def test_cycles_count_all_sampled_cycles_and_late_ones(service):
    assert _cycle_totals(service["data"]["cycles"]) == (16415, 275)


def test_on_time_share_2025_per_customer(service):
    facts = [f for f in service["data"]["cycles"] if f["month"].startswith("2025-")]
    shares = {}
    for customer_id in ("CUST001", "CUST002", "CUST003"):
        cycles, late = _cycle_totals(facts, customer_id=customer_id)
        shares[customer_id] = round(100 * (cycles - late) / cycles, 1)
    assert shares == {"CUST001": 98.3, "CUST002": 98.3, "CUST003": 98.4}


def test_northstar_food_industry_garments_on_time_share(service):
    facts = service["data"]["cycles"]
    # 3,694 cycles across all buckets; 5 of them were delivered in January 2026.
    assert _cycle_totals(facts, customer_id="CUST001", product_id="P1004") == (3694, 71)
    in_2025 = [f for f in facts if f["month"].startswith("2025-")]
    cycles, late = _cycle_totals(in_2025, customer_id="CUST001", product_id="P1004")
    assert (cycles, late) == (3689, 71)
    assert round(100 * (cycles - late) / cycles, 1) == 98.1


def test_cycles_delivered_in_january_2026_keep_their_own_bucket_and_a_note(service):
    assert _cycle_totals(service["data"]["cycles"], month="2026-01") == (23, 0)
    notes = service["data"]["data_transparency_notes"]
    assert [n["id"] for n in notes] == ["cycles_delivered_in_2026_01"]
    assert "23" in notes[0]["text"] and "2025" in notes[0]["text"]


def test_activity_holds_one_row_per_month_site_and_product(service):
    activity = service["data"]["activity"]
    assert len(activity) == 1248
    first = next(r for r in activity if (r["site_id"], r["product_id"], r["month"]) == ("S001", "P1002", "2025-01"))
    assert first == {
        "customer_id": "CUST001", "site_id": "S001", "product_id": "P1002", "month": "2025-01",
        "active_wearers": 654, "allocated_pieces": 723, "active_assets_scanned": 629,
        "washed_pieces": 1863, "packed_pieces": 1851, "service_requests": 1,
    }


def test_service_requests_total_and_for_northstar(service):
    activity = service["data"]["activity"]
    assert sum(r["service_requests"] for r in activity) == 750
    assert sum(r["service_requests"] for r in activity if r["customer_id"] == "CUST001") == 515
    assert sum(r["service_requests"] for r in service["data"]["site_month"]) == 750


def test_site_month_counts_active_wearers_by_the_largest_product_row(service):
    site_month = service["data"]["site_month"]
    assert len(site_month) == 408
    december = [r for r in site_month if r["customer_id"] == "CUST001" and r["month"] == "2025-12"]
    assert sum(r["active_wearers"] for r in december) == 9607


def test_helsinki_january_garments_per_wearer(service):
    helsinki = next(r for r in service["data"]["site_month"] if (r["site_id"], r["month"]) == ("S001", "2025-01"))
    assert (helsinki["allocated_pieces"], helsinki["active_wearers"]) == (2132, 654)
    assert round(helsinki["allocated_pieces"] / helsinki["active_wearers"], 1) == 3.3


def test_turnaround_over_all_sampled_cycles(workbook):
    stats = pipeline.service_kpis.turnaround_stats(pipeline.facts.cycle_rows(workbook.records("Service_Cycles")))
    assert stats == {
        "cycles": 16415,
        "median_cycle_hours": 82.0,
        "p90_cycle_hours": 107.0,
        "median_pickup_to_in_laundry_hours": 22.0,
        "median_in_laundry_to_out_laundry_hours": 36.0,
        "median_out_laundry_to_delivered_hours": 24.0,
    }


def _turnaround(service, **match):
    rows = [r for r in service["data"]["turnaround"] if all(r[k] == v for k, v in match.items())]
    assert len(rows) == 1, match
    return rows[0]


def test_turnaround_covers_customer_and_site_scopes_products_presets_and_periods(service):
    rows = service["data"]["turnaround"]
    assert {r["scope"] for r in rows} == {"customer", "site"}
    assert {r["product_scope"] for r in rows} == {"all", "product", "preset"}
    assert {r["period"] for r in rows} == {"2025"} | {f"2025-{m:02d}" for m in range(1, 13)}
    northstar = _turnaround(service, scope="customer", scope_id="CUST001", product_scope="all", period="2025")
    assert northstar["cycles"] == 11353
    assert northstar["customer_id"] == "CUST001"


def test_turnaround_for_a_preset_uses_its_products(service):
    preset = _turnaround(service, scope="customer", scope_id="CUST001", product_scope="preset",
                         product_scope_id="food_industry_garments", period="2025")
    product = _turnaround(service, scope="customer", scope_id="CUST001", product_scope="product",
                          product_scope_id="P1004", period="2025")
    assert preset["cycles"] == product["cycles"] == 3689
    assert {k: v for k, v in preset.items() if k not in ("product_scope", "product_scope_id")} == \
        {k: v for k, v in product.items() if k not in ("product_scope", "product_scope_id")}


def test_turnaround_for_a_site_month(service):
    row = _turnaround(service, scope="site", scope_id="S001", product_scope="all", period="2025-01")
    assert row["customer_id"] == "CUST001"
    assert row["cycles"] > 0
    assert row["median_cycle_hours"] <= row["p90_cycle_hours"]


SERVICE_PERFORMANCE_IDS = [
    "on_time_service_cycle_share",
    "late_service_cycles",
    "turnaround_hours_median",
    "turnaround_hours_90th_percentile",
    "turnaround_by_stage",
    "service_requests",
    "service_requests_per_100_wearers",
    "service_request_free_site_months",
]
SERVICE_ADOPTION_IDS = [
    "active_wearers",
    "garments_per_wearer",
    "scan_coverage",
    "allocated_garments_with_no_scan_activity",
    "washes_per_garment",
    "garments_in_circulation",
]


def test_service_catalogue_holds_the_fourteen_kpis(service):
    catalogue = service["catalogue"]
    assert [e["id"] for e in catalogue] == SERVICE_PERFORMANCE_IDS + SERVICE_ADOPTION_IDS
    areas = {e["id"]: (e["evidence_area"], e["customer_question"]) for e in catalogue}
    assert areas["late_service_cycles"] == ("Service Performance", "Is the service reliable?")
    assert areas["scan_coverage"] == ("Service Adoption", "Are we using the service effectively?")
    for entry in catalogue:
        assert set(entry) == {
            "id", "name", "evidence_area", "core_or_industry", "customer_question", "definition", "source_fields",
            "grain", "view", "review_part", "data_status", "assumptions", "caveats",
        }
        assert entry["core_or_industry"] == "Core KPI"
        assert entry["data_status"] == "SYNTHETIC"
        assert entry["review_part"] == "Look back"
        assert entry["grain"] == "Customer, Site, product, month"
        assert entry["caveats"]


def test_turnaround_by_stage_is_kam_only_and_the_rest_are_both(service):
    views = {e["id"]: e["view"] for e in service["catalogue"]}
    assert views.pop("turnaround_by_stage") == "KAM"
    assert set(views.values()) == {"Both"}


def test_garments_in_circulation(service):
    entry = next(e for e in service["catalogue"] if e["id"] == "garments_in_circulation")
    assert entry["name"] == "Garments in circulation"
    assert entry["source_fields"] == ["Service_Activity.allocated_pieces"]
    assert entry["caveats"] == ["Garments assigned to the Customer, not garments in use."]


def test_service_kpis_avoid_glossary_terms_and_em_dashes(out_dir):
    text = (out_dir / "service-kpis.json").read_text(encoding="utf-8").lower()
    assert "—" not in text
    # Avoid terms from GLOSSARY.md for the Service terms. "Garments in use" stays in the caveat the decision
    # wrote for Garments in circulation, where it says what the KPI is not.
    for term in ("idle", "complaint", "ticket", "unused garments", "fleet", "garment stock", "loop", "rotation"):
        assert term not in text, term


# public-reference.json


@pytest.fixture(scope="module")
def public_reference(out_dir) -> dict:
    return json.loads((out_dir / "public-reference.json").read_text(encoding="utf-8"))


def test_every_public_figure_has_a_source_and_year(public_reference):
    assert public_reference["meta"]["name"] == "public-reference"
    assert public_reference["catalogue"] == []
    figures = public_reference["data"]["figures"]
    assert figures
    for figure in figures:
        assert figure["data_status"] == "PUBLIC_REFERENCE", figure["id"]
        assert figure["source"].strip(), figure["id"]
        assert isinstance(figure["year"], int) and 2010 <= figure["year"] <= 2026, figure["id"]
        for field in ("unit", "scope", "applicability"):
            assert figure[field].strip(), (figure["id"], field)
    assert len({f["id"] for f in figures}) == len(figures)


def test_public_figures_hold_the_values_the_ticket_lists(public_reference):
    values = {f["id"]: (f["value"], f["unit"], f["year"]) for f in public_reference["data"]["figures"]}
    assert values == {
        # Lindström 2025 report
        "lindstrom_water_per_washed_kg_group": (6.82, "L/kg", 2025),
        "lindstrom_water_per_washed_kg_workwear": (12.5, "L/kg", 2025),
        "lindstrom_laundry_energy_per_washed_kg": (0.99, "kWh/kg", 2025),
        "lindstrom_emissions_per_washed_kg_scope_1_2": (0.19, "kgCO2e/kg", 2025),
        "lindstrom_emissions_per_washed_kg_scope_1_2_3": (0.71, "kgCO2e/kg", 2025),
        "lindstrom_textile_waste_recycled_share": (66, "%", 2025),
        "lindstrom_textiles_repaired": (2_900_000, "pieces", 2025),
        "lindstrom_emissions_per_euro_of_turnover": (0.281, "kgCO2e/EUR", 2025),
        # Peer context
        "lindstrom_emissions_per_euro_gap_to_peer_average": (13, "% below", 2025),
        "lindstrom_emissions_per_euro_gap_to_average_with_lindstrom": (10.8, "% below", 2025),
        "jsg_emissions_per_gbp_of_revenue": (0.31, "kgCO2e/GBP", 2024),
        # Industrial laundries
        "industrial_laundry_water_per_kg_by_machine_type": ({"low": 4.5, "high": 22}, "L/kg", 2026),
        "jsg_water_per_kg": (6.7, "L/kg", 2024),
        "salesianer_water_per_kg": (8.87, "L/kg", 2025),
        "whole_plant_laundry_energy_per_kg": ({"low": 1.6, "high": 1.7}, "kWh/kg", 2024),
        # Home washing, JRC 2017
        "home_washing_water_per_kg": ({"low": 13, "high": 20}, "L/kg", 2017),
        "home_washing_energy_per_kg": ({"low": 0.19, "high": 0.30}, "kWh/kg", 2017),
        # Rationale for the B_LOCAL low case
        "large_operator_emissions_per_kg_scope_1_2": ({"low": 0.19, "high": 0.30}, "kgCO2e/kg", 2025),
        # Lindström UK, 2022
        "lindstrom_garment_washes_per_life": (50, "washes", 2022),
        "lindstrom_garment_repairs_per_life": (6, "repairs", 2022),
    }


def test_the_peer_gaps_follow_from_the_brief_table():
    # Brief: Elis 0.40, Cintas 0.20, Salesianer 0.31, JSG 0.38, Lindström 0.28.
    peers = [0.40, 0.20, 0.31, 0.38]
    assert round((1 - 0.28 / (sum(peers) / 4)) * 100) == 13
    assert round((1 - 0.28 / ((sum(peers) + 0.28) / 5)) * 100, 1) == 10.8


def test_public_reference_gaps(public_reference):
    gaps = public_reference["data"]["gaps"]
    assert [g["id"] for g in gaps] == [
        "on_time_service_cycle_target", "garment_sets_per_wearer", "etsa_and_bref_laundry_figures",
    ]
    for gap in gaps:
        assert gap["finding"].strip() and gap["treatment"].strip()


def test_group_emissions_intensity_context_line(public_reference):
    line = public_reference["data"]["context_lines"]["group_emissions_intensity"]
    assert line["text"] == (
        "Lindström Group 0.28 kg CO2e per euro of turnover, 13% below the average of Elis, Cintas, "
        "Salesianer and Johnson Service Group."
    )
    assert (line["evidence_area"], line["view"], line["data_status"]) == (
        "Sustainability Value", "Both", "PUBLIC_REFERENCE",
    )
    notes = [n["text"] for n in line["kam_notes"]]
    assert len(notes) == 2
    assert "10.8%" in notes[0] and "left out of the average" in notes[0]
    assert "0.38" in notes[1] and "0.31 per GBP" in notes[1]
    figure_ids = {f["id"] for f in public_reference["data"]["figures"]}
    for ids in [line["figure_ids"], *(n["figure_ids"] for n in line["kam_notes"])]:
        assert ids and set(ids) <= figure_ids


def walk(value, path=""):
    """Every (path, string) in a JSON value."""
    if isinstance(value, dict):
        for key, item in value.items():
            yield from walk(item, f"{path}.{key}")
    elif isinstance(value, list):
        for i, item in enumerate(value):
            yield from walk(item, f"{path}[{i}]")
    elif isinstance(value, str):
        yield path, value


def test_no_public_figure_is_turned_into_a_customer_figure(public_reference):
    # ADR 0005: no Customer spend exists, so the per-euro intensity is never multiplied into a Customer figure.
    for path, text in walk(public_reference["data"]):
        assert not re.search(r"\bCUST\d+|\bS\d{3}\b|customer_id|site_id", text), (path, text)
    keys = set(re.findall(r"\.(\w+)", " ".join(path for path, _ in walk(public_reference["data"]))))
    assert keys and not any("customer" in k.lower() or "spend" in k.lower() for k in keys), keys
    units = {f["unit"] for f in public_reference["data"]["figures"]}
    assert {u for u in units if "EUR" in u or "GBP" in u} == {"kgCO2e/EUR", "kgCO2e/GBP"}


def test_public_reference_labels_use_glossary_terms(public_reference):
    # Avoid terms of Public reference, Baseline, Handprint, Footprint, Customer and Service cycle.
    avoid = ["benchmark", "industry average", "reference scenario", "savings", "positive impact", "impact",
             "consumption", "account", "client", "company", "delivery", "rotation", "loop", "complaint"]
    for path, text in walk(public_reference["data"]):
        if path.endswith(("url", "source")):
            continue
        assert "—" not in text, path
        for term in avoid:
            assert not re.search(rf"\b{term}\b", text, re.IGNORECASE), (path, term)


def test_baseline_factors_quoted_in_public_figures_match_the_workbook(public_reference, master):
    # The builder does not read the workbook, so the factors its text quotes could go stale.
    baselines = {b["baseline_id"]: b for b in master["data"]["baselines"]}
    assert (baselines["B_LOCAL"]["water_l_per_kg"], baselines["B_INHOUSE"]["water_l_per_kg"]) == (9.5, 12.5)
    assert (baselines["B_LOCAL"]["energy_kwh_per_kg"], baselines["B_HOME"]["energy_kwh_per_kg"]) == (1.05, 1.18)
    assert (baselines["B_LOCAL"]["process_kgco2e_per_kg"], baselines["B_HOME"]["water_l_per_kg"]) == (0.62, 20)
    text = " ".join(f["applicability"] for f in public_reference["data"]["figures"])
    for quoted in ["B_LOCAL baseline of 9.5 L/kg", "B_LOCAL baseline (1.05 kWh/kg)", "B_HOME baseline (20 L/kg)",
                   "1.18 kWh/kg", "B_LOCAL process factor (0.62 kgCO2e/kg)"]:
        assert quoted in text, quoted


# account-health.json


@pytest.fixture(scope="module")
def health(out_dir) -> dict:
    return json.loads((out_dir / "account-health.json").read_text(encoding="utf-8"))


def _rating(health, scope, scope_id, period):
    rows = [r for r in health["data"]["ratings"] if (r["scope"], r["scope_id"], r["period"]) == (scope, scope_id, period)]
    assert len(rows) == 1, (scope, scope_id, period)
    return rows[0]


def _input(rating, input_id):
    return next(i for i in rating["inputs"] if i["input_id"] == input_id)


def test_every_customer_is_green_for_2025_on_all_three_inputs(health):
    for customer_id in ("CUST001", "CUST002", "CUST003"):
        rating = _rating(health, "customer", customer_id, "2025")
        assert rating["rating"] == "green"
        assert (rating["rated_inputs"], rating["total_inputs"]) == (3, 3)
        assert rating["based_on"] == "Based on 3 of 3 inputs"
    apex = _rating(health, "customer", "CUST002", "2025")
    requests = _input(apex, "account_health_service_requests_per_100_wearers_per_month")
    assert round(requests["value"], 2) == 0.54
    assert requests["volume"] == 32178
    assert requests["rating"] == "green"
    assert requests["thresholds_used"] == {"better": "lower", "green_threshold": 1.0, "amber_threshold": 2.0,
                                           "minimum_volume": 1000}


def test_apex_november_and_mediora_july_are_amber_on_on_time_share(health):
    apex = _rating(health, "customer", "CUST002", "2025-11")
    assert apex["rating"] == "amber"
    assert apex["reason"] == "Amber: on-time service cycles 96.9%."
    assert _input(apex, "account_health_on_time_service_cycle_share")["volume"] == 128
    mediora = _rating(health, "customer", "CUST003", "2025-07")
    assert mediora["reason"] == "Amber: on-time service cycles 96.7%."
    assert _input(mediora, "account_health_on_time_service_cycle_share")["volume"] == 123
    amber = sorted((r["scope_id"], r["period"]) for r in health["data"]["ratings"]
                   if r["scope"] == "customer" and r["rating"] == "amber")
    assert amber == [("CUST002", "2025-11"), ("CUST003", "2025-07")]


def test_mediora_august_on_time_share_is_not_rated_under_100_cycles(health):
    august = _rating(health, "customer", "CUST003", "2025-08")
    on_time = _input(august, "account_health_on_time_service_cycle_share")
    assert on_time["rating"] == "not_rated"
    assert on_time["volume"] == 61
    assert round(100 * on_time["value"], 1) == 95.1
    assert on_time["not_rated_reason"] == "61 sampled cycles, under the minimum of 100."
    assert august["based_on"] == "Based on 2 of 3 inputs"


def test_every_site_year_is_green_and_rated_on_two_inputs_at_most(health):
    years = [r for r in health["data"]["ratings"] if r["scope"] == "site" and r["period"] == "2025"]
    assert len(years) == 34
    assert {r["rating"] for r in years} == {"green"}
    assert {r["total_inputs"] for r in years} == {2}
    assert {i["input_id"] for r in years for i in r["inputs"]} == {
        "account_health_on_time_service_cycle_share", "account_health_scan_coverage",
    }


def test_site_months_on_scan_coverage(health):
    months = [r for r in health["data"]["ratings"] if r["scope"] == "site" and r["period"] != "2025"]
    assert len(months) == 408
    scan = [_input(r, "account_health_scan_coverage") for r in months]
    # 59 Site-months have scan coverage in the amber band. 3 of them hold under 500 allocated
    # pieces, so the volume guard leaves them not rated and 56 are rated amber.
    in_amber_band = [i for i in scan if 0.7 <= i["value"] < 0.8]
    assert len(in_amber_band) == 59
    assert sum(i["rating"] == "amber" for i in scan) == 56
    assert sum(i["rating"] == "not_rated" for i in in_amber_band) == 3
    assert not any(i["rating"] == "red" for i in scan)


def test_a_rating_with_no_rated_input_reads_not_rated_never_green():
    specs = [s for s in pipeline.account_health.ACCOUNT_HEALTH_INPUTS if "site" in s["scopes"]]
    inputs = [pipeline.account_health.rate_input(s, 0.99, 10) for s in specs]
    overall = pipeline.account_health.worst_of(specs, inputs)
    assert overall["rating"] == "not_rated"
    assert overall["based_on"] == "Based on 0 of 2 inputs"


def test_worst_of_names_every_amber_and_red_input():
    specs = [s for s in pipeline.account_health.ACCOUNT_HEALTH_INPUTS if "site" in s["scopes"]]
    inputs = [
        pipeline.account_health.rate_input(specs[0], 0.96, 200),
        pipeline.account_health.rate_input(specs[1], 0.65, 900),
    ]
    overall = pipeline.account_health.worst_of(specs, inputs)
    assert overall["rating"] == "red"
    assert overall["reason"] == "Red: scan coverage 65.0%. Amber: on-time service cycles 96.0%."


def test_account_health_catalogue_is_the_rule_and_its_three_kam_only_inputs(health):
    catalogue = health["catalogue"]
    assert [e["id"] for e in catalogue] == [
        "account_health",
        "account_health_on_time_service_cycle_share",
        "account_health_service_requests_per_100_wearers_per_month",
        "account_health_scan_coverage",
    ]
    for entry in catalogue:
        assert entry["view"] == "KAM"
        assert entry["data_status"] == "SYNTHETIC"
        assert entry["threshold_data_status"] == "TEAM_ASSUMPTION"
        assert entry["rationale"].startswith("No public benchmark exists.")
        assert entry["id"] == pipeline.catalogue.catalogue_id(entry["name"])
    scan = catalogue[3]
    assert scan["thresholds"] == {"better": "higher", "green_threshold": 0.8, "amber_threshold": 0.7,
                                  "minimum_volume": 500}
    assert health["data"]["defaults"]["account_health_scan_coverage"] == scan["thresholds"]


def test_customer_experience_is_a_data_gap_beside_the_rating(health):
    gap = health["data"]["customer_experience_gap"]
    assert gap["view"] == "KAM"
    assert "CSAT" in gap["text"] and "never an input" in gap["text"]


def test_account_health_avoids_glossary_terms_and_em_dashes(out_dir):
    text = (out_dir / "account-health.json").read_text(encoding="utf-8").lower()
    assert "—" not in text
    for term in ("rag_status", "rag status", "customer score", "customer satisfaction", "complaint", "idle",
                 "unused", "baseline"):
        assert term not in text, term


def test_small_sites_are_not_rated_on_scan_coverage_even_for_the_year(health):
    # S003 and S022 average under 500 allocated pieces a month, so the guard drops scan coverage in every period.
    for site_id in ("S003", "S022"):
        year = _rating(health, "site", site_id, "2025")
        assert _input(year, "account_health_scan_coverage")["rating"] == "not_rated"
        assert year["based_on"] == "Based on 1 of 2 inputs"


# footprint-handprint-kpis.json


@pytest.fixture(scope="module")
def footprint_handprint(out_dir) -> dict:
    return json.loads((out_dir / "footprint-handprint-kpis.json").read_text(encoding="utf-8"))


def test_footprint_holds_one_row_per_month_site_product_and_laundry(footprint_handprint):
    rows = footprint_handprint["data"]["footprint"]
    assert len(rows) == 1248
    assert len({(r["month"], r["site_id"], r["product_id"], r["laundry_id"]) for r in rows}) == 1248


def test_northstar_footprint_totals_for_2025(footprint_handprint):
    rows = northstar(footprint_handprint["data"]["footprint"])
    totals = {f: round(sum(r[f] for r in rows)) for f in [
        "customer_washed_kg", "allocated_water_l", "allocated_energy_kwh",
        "allocated_process_kgco2e", "allocated_delivery_kgco2e",
    ]}
    assert totals == {
        "customer_washed_kg": 502075,
        "allocated_water_l": 3363227,
        "allocated_energy_kwh": 355534,
        "allocated_process_kgco2e": 50000,
        "allocated_delivery_kgco2e": 23785,
    }
    emissions = sum(r["allocated_process_kgco2e"] + r["allocated_delivery_kgco2e"] for r in rows)
    assert round(emissions) == 73785


def test_baseline_factors_are_the_workbook_defaults(footprint_handprint):
    baselines = footprint_handprint["data"]["baselines"]
    assert baselines["default_baseline_id"] == "B_LOCAL"
    factors = {
        b["baseline_id"]: (b["water_l_per_kg"], b["energy_kwh_per_kg"], b["process_kgco2e_per_kg"], b["delivery_kgco2e_per_kg"])
        for b in baselines["factors"]
    }
    assert factors == {
        "B_LOCAL": (9.5, 1.05, 0.62, 0.035),
        "B_HOME": (20, 1.18, 0.78, 0),
        "B_INHOUSE": (12.5, 1.12, 0.68, 0.015),
    }
    labels = {b["baseline_id"]: b["label"] for b in baselines["factors"]}
    assert labels["B_LOCAL"] == "vs outsourced local laundry"


def test_b_local_process_low_case_is_a_team_assumption(footprint_handprint):
    (low_case,) = footprint_handprint["data"]["baselines"]["low_cases"]
    assert (low_case["baseline_id"], low_case["factor"], low_case["value"], low_case["data_status"]) == (
        "B_LOCAL", "process_kgco2e_per_kg", 0.30, "TEAM_ASSUMPTION",
    )
    assert low_case["figure_ids"] == ["large_operator_emissions_per_kg_scope_1_2"]


# The workbook computes its tie-out fields before it rounds the inputs to 0.1. A row rebuilt from the rounded
# inputs can drift by up to 0.05 for each of 3 inputs.
TIE_OUT_TOLERANCE = 0.15


def test_computed_b_local_handprint_ties_out_on_every_row(footprint_handprint):
    local = next(b for b in footprint_handprint["data"]["baselines"]["factors"] if b["baseline_id"] == "B_LOCAL")
    rows = footprint_handprint["data"]["footprint"]
    assert len(rows) == 1248
    for row in rows:
        computed = pipeline.footprint_handprint_kpis.handprint_values(row, local)
        assert computed["water_saved_l"] == pytest.approx(row["water_saving_vs_local_l"], abs=TIE_OUT_TOLERANCE)
        assert computed["energy_saved_kwh"] == pytest.approx(row["energy_saving_vs_local_kwh"], abs=TIE_OUT_TOLERANCE)
        assert computed["emissions_saved_kgco2e"] == pytest.approx(
            row["emissions_saving_vs_local_kgco2e"], abs=TIE_OUT_TOLERANCE
        )


def _denominator(footprint_handprint, **match):
    rows = [r for r in footprint_handprint["data"]["per_wearer_denominators"] if all(r[k] == v for k, v in match.items())]
    assert len(rows) == 1, match
    return rows[0]["active_wearers"]


def test_northstar_footprint_per_active_wearer(footprint_handprint):
    wearers = _denominator(footprint_handprint, scope="customer", scope_id="CUST001", period="2025")
    rows = northstar(footprint_handprint["data"]["footprint"])
    per_wearer = lambda *fields: sum(r[f] for r in rows for f in fields) / wearers
    assert round(per_wearer("customer_washed_kg"), 1) == 52.0
    assert round(per_wearer("allocated_water_l")) == 349
    assert round(per_wearer("allocated_energy_kwh"), 1) == 36.9
    assert round(per_wearer("allocated_process_kgco2e", "allocated_delivery_kgco2e"), 2) == 7.65


def test_per_wearer_denominators_follow_the_wearer_counting_rule(footprint_handprint, service):
    # Identical to service-kpis.json: a Site-month is its largest product row, a Customer sums its Sites.
    assert _denominator(footprint_handprint, scope="customer", scope_id="CUST001", period="2025-12") == 9607
    for row in service["data"]["site_month"]:
        assert _denominator(footprint_handprint, scope="site", scope_id=row["site_id"], period=row["month"]) == row["active_wearers"]
    periods = {r["period"] for r in footprint_handprint["data"]["per_wearer_denominators"]}
    assert periods == {"2025"} | {f"2025-{m:02d}" for m in range(1, 13)}


def _handprint(footprint_handprint, factor_case="default", **match):
    match["factor_case"] = factor_case
    rows = [r for r in footprint_handprint["data"]["handprint"] if all(r[k] == v for k, v in match.items())]
    assert len(rows) == 1, match
    return rows[0]


def test_northstar_handprint_for_each_baseline(footprint_handprint):
    # Amount, then share of that baseline's footprint, from the decision notes.
    expected = {
        "B_LOCAL": ((1406483, 29), (171645, 33), (255074, 78)),
        "B_HOME": ((6678267, 67), (236914, 40), (317833, 81)),
        "B_INHOUSE": ((2912707, 46), (206790, 37), (275157, 79)),
    }
    for baseline_id, values in expected.items():
        row = _handprint(footprint_handprint, scope="customer", scope_id="CUST001", period="2025", baseline_id=baseline_id)
        actual = tuple(
            (round(row[f"{name}_saved_{unit}"]), round(row[f"{name}_saved_share"] * 100))
            for name, unit in [("water", "l"), ("energy", "kwh"), ("emissions", "kgco2e")]
        )
        assert actual == values, baseline_id


def test_northstar_emissions_saved_at_the_b_local_low_case(footprint_handprint):
    low = _handprint(footprint_handprint, "low_case", scope="customer", scope_id="CUST001", period="2025", baseline_id="B_LOCAL")
    assert round(low["emissions_saved_kgco2e"]) == 94410
    assert round(low["water_saved_l"]) == 1406483
    cases = {(r["baseline_id"], r["factor_case"]) for r in footprint_handprint["data"]["handprint"]}
    assert cases == {("B_LOCAL", "default"), ("B_HOME", "default"), ("B_INHOUSE", "default"), ("B_LOCAL", "low_case")}


def test_handprint_site_months_add_up_to_the_customer_year(footprint_handprint):
    rows = [r for r in footprint_handprint["data"]["handprint"] if (r["baseline_id"], r["factor_case"]) == ("B_HOME", "default")]
    site_months = [r for r in rows if r["scope"] == "site" and r["customer_id"] == "CUST001" and r["period"] != "2025"]
    assert len(site_months) == 24 * 12
    year = _handprint(footprint_handprint, scope="customer", scope_id="CUST001", period="2025", baseline_id="B_HOME")
    for field in ("baseline_water_l", "water_saved_l", "baseline_emissions_kgco2e", "emissions_saved_kgco2e"):
        assert sum(r[field] for r in site_months) == pytest.approx(year[field])
    assert year["baseline_water_l"] == pytest.approx(20 * year["customer_washed_kg"])


def test_transparency_holds_laundry_factors_by_laundry_and_month(footprint_handprint):
    transparency = footprint_handprint["data"]["transparency"]
    assert transparency["view"] == "KAM"
    factors = transparency["laundry_month_factors"]
    assert len(factors) == 4 * 12
    helsinki = next(f for f in factors if (f["laundry_id"], f["month"]) == ("L001", "2025-01"))
    assert (helsinki["fresh_water_l_per_kg"], helsinki["energy_kwh_per_kg"], helsinki["washed_kg"]) == (4.95, 0.74, 120569)
    assert (helsinki["fresh_water_l"], helsinki["process_energy_kwh"], helsinki["process_emissions_kgco2e"]) == (
        596277.9, 89233.8, 8031,
    )


def test_transparency_holds_process_co2e_per_kwh_by_laundry(footprint_handprint):
    rows = footprint_handprint["data"]["transparency"]["laundry_process_co2e_per_kwh"]
    # Helsinki, Turku, Malmö, Warsaw. The country grid sets the spread from 0.05 to 0.42.
    assert {r["laundry_id"]: r["process_kgco2e_per_kwh"] for r in rows} == {
        "L001": 0.09, "L002": 0.09, "L003": 0.05, "L004": 0.42,
    }


def test_transparency_names_public_figures_that_exist(footprint_handprint, public_reference):
    ids = footprint_handprint["data"]["transparency"]["public_figure_ids"]
    assert "lindstrom_laundry_energy_per_washed_kg" in ids
    assert "lindstrom_emissions_per_washed_kg_scope_1_2_3" in ids
    assert set(ids) <= {f["id"] for f in public_reference["data"]["figures"]}


FOOTPRINT_IDS = ["washed_kg", "water_use_allocated", "energy_use_allocated", "emissions_allocated"]
HANDPRINT_IDS = ["water_saved", "energy_saved", "emissions_saved"]
ILLUSTRATIVE_CAVEAT = "Baseline factors are illustrative. Savings may be overstated."


def test_footprint_handprint_catalogue_holds_the_seven_kpis(footprint_handprint):
    catalogue = footprint_handprint["catalogue"]
    assert [(e["id"], e["data_status"], e["assumptions"]) for e in catalogue] == [
        ("washed_kg", "SYNTHETIC", []),
        ("water_use_allocated", "ALLOCATED_ESTIMATE_SYNTHETIC", []),
        ("energy_use_allocated", "ALLOCATED_ESTIMATE_SYNTHETIC", []),
        ("emissions_allocated", "ALLOCATED_ESTIMATE_SYNTHETIC", []),
        ("water_saved", "ALLOCATED_ESTIMATE_SYNTHETIC", ["A001"]),
        ("energy_saved", "ALLOCATED_ESTIMATE_SYNTHETIC", ["A001"]),
        ("emissions_saved", "ALLOCATED_ESTIMATE_SYNTHETIC", ["A001"]),
    ]
    for entry in catalogue:
        assert set(entry) == CATALOGUE_FIELDS
        assert (entry["evidence_area"], entry["core_or_industry"], entry["view"]) == (
            "Sustainability Value", "Core KPI", "Both",
        )
        assert entry["caveats"]
    illustrative = [e["id"] for e in catalogue if ILLUSTRATIVE_CAVEAT in e["caveats"]]
    assert illustrative == ["energy_saved", "emissions_saved"]


def test_footprint_handprint_source_fields_name_workbook_columns(footprint_handprint, workbook):
    for entry in footprint_handprint["catalogue"]:
        for field in entry["source_fields"]:
            sheet, column = field.split(".")
            assert column in workbook.records(sheet)[0], field


def test_footprint_kpis_take_a_unit_and_handprint_kpis_take_a_baseline(footprint_handprint):
    parameters = {p["id"]: p for p in footprint_handprint["data"]["parameters"]}
    assert set(parameters) == {"unit", "emission_source", "baseline"}
    unit = parameters["unit"]
    assert (unit["values"], unit["default"], unit["kpi_ids"]) == (["total", "per_active_wearer"], "total", FOOTPRINT_IDS)
    baseline = parameters["baseline"]
    assert (baseline["values"], baseline["default"], baseline["kpi_ids"]) == (
        ["B_LOCAL", "B_HOME", "B_INHOUSE"], "B_LOCAL", HANDPRINT_IDS,
    )
    source = parameters["emission_source"]
    assert (source["values"], source["kpi_ids"]) == (["process", "delivery"], ["emissions_allocated"])


def test_no_combined_co2e_handprint_exists(out_dir):
    # ADR 0007: Avoided product CO2e lives only in operational-circularity-kpis.json and is never added in.
    text = (out_dir / "footprint-handprint-kpis.json").read_text(encoding="utf-8")
    keys = set(re.findall(r'"(\w+)":', text))
    for word in ("avoided", "product_footprint", "combined", "total_co2e", "repair"):
        assert not any(word in k for k in keys), word


def test_footprint_handprint_labels_use_glossary_terms(footprint_handprint):
    # Avoid terms of Footprint, Baseline and Handprint. GLOSSARY.md allows "Savings" in the illustrative caveat only.
    avoid = ["impact", "consumption", "benchmark", "reference scenario", "savings", "positive impact",
             "account", "client", "company", "comparison period"]
    texts = [(e["id"], t) for e in footprint_handprint["catalogue"] for t in
             [e["name"], e["definition"], e["customer_question"], e["grain"], *e["caveats"]] if t != ILLUSTRATIVE_CAVEAT]
    texts += [(p["id"], p["note"]) for p in footprint_handprint["data"]["parameters"]]
    texts += [(b["baseline_id"], b["label"]) for b in footprint_handprint["data"]["baselines"]["factors"]]
    texts += [(c["id"], c["rationale"]) for c in footprint_handprint["data"]["baselines"]["low_cases"]]
    for where, text in texts:
        assert "—" not in text, where
        for term in avoid:
            assert not re.search(rf"\b{term}\b", text, re.IGNORECASE), (where, term)


# period-comparisons.json


def test_fisher_exact_two_sided_matches_the_tea_tasting_example():
    # Fisher's lady tasting tea: 3 of 4 right in each cup group, two-sided p = 34/70.
    assert pipeline.period_comparisons.fisher_exact_two_sided(3, 4, 1, 4) == pytest.approx(34 / 70)


def test_fisher_exact_two_sided_for_northstar_turku():
    # 0 late of 296 sampled cycles, then 4 of 126. Only the observed table is as extreme as itself.
    assert pipeline.period_comparisons.fisher_exact_two_sided(0, 296, 4, 126) == pytest.approx(0.0076833, rel=1e-4)
    assert pipeline.period_comparisons.fisher_exact_two_sided(5, 300, 5, 300) == pytest.approx(1.0)


def test_conditional_binomial_two_sided_with_equal_exposure_is_a_fair_coin():
    # 3 events against 7 on equal exposure: binomial(10, 0.5), P(X <= 3 or X >= 7) = 352/1024.
    assert pipeline.period_comparisons.conditional_binomial_two_sided(3, 1000, 7, 1000) == pytest.approx(352 / 1024)


def test_conditional_binomial_two_sided_handles_large_counts():
    p = pipeline.period_comparisons.conditional_binomial_two_sided(252, 57897, 263, 57871)
    assert 0.6 < p < 0.65
    assert pipeline.period_comparisons.conditional_binomial_two_sided(0, 600, 0, 600) == 1.0


@pytest.fixture(scope="module")
def improvement(out_dir) -> dict:
    return json.loads((out_dir / "period-comparisons.json").read_text(encoding="utf-8"))


ON_TIME, REQUESTS, SCAN = (
    "improvement_on_time_service_cycles", "improvement_service_requests", "improvement_scan_coverage",
)


def _site_names(master) -> dict:
    return {s["site_id"]: s["site_name"] for s in master["data"]["sites"]}


def _site_results(improvement, comparison_id):
    return [r for c in improvement["data"]["results"]["comparisons"] if c["comparison_id"] == comparison_id
            for r in c["site_results"]]


def _sites_labelled(improvement, master, comparison_id, label):
    names = _site_names(master)
    return sorted(names[r["scope_id"]] for r in _site_results(improvement, comparison_id) if r["label"] == label)


def test_default_comparison_is_h2_against_h1_within_2025(improvement):
    results = improvement["data"]["results"]
    assert (results["selected_period"], results["compare_to"], results["label"]) == ("2025", "h2_vs_h1", "within 2025")
    assert results["period"] == {"name": "H2 2025", "months": [f"2025-{m:02d}" for m in range(7, 13)]}
    assert results["comparison_period"]["months"] == [f"2025-{m:02d}" for m in range(1, 7)]
    assert len(results["comparisons"]) == 9
    assert sum(len(c["site_results"]) for c in results["comparisons"]) == 3 * 34


def test_every_customer_shows_no_clear_change_on_all_three_comparisons(improvement):
    customers = [c["customer_result"] for c in improvement["data"]["results"]["comparisons"]]
    assert {r["label"] for r in customers} == {"no_clear_change"}
    count_tests = [r["p_value"] for r in customers if r["comparison_id"] != SCAN]
    assert 0.22 < min(count_tests) and max(count_tests) < 0.88
    assert all(r["view"] == "Both" for r in customers)


def test_worse_sites_and_no_better_site(improvement, master):
    assert _sites_labelled(improvement, master, REQUESTS, "worse") == [
        "Apex Västerås", "Mediora Kraków", "NorthStar Stockholm",
    ]
    assert _sites_labelled(improvement, master, ON_TIME, "worse") == ["NorthStar Turku"]
    for comparison_id in (ON_TIME, REQUESTS, SCAN):
        assert _sites_labelled(improvement, master, comparison_id, "better") == []
    assert _sites_labelled(improvement, master, SCAN, "worse") == []


def test_northstar_turku_on_time_cycles(improvement):
    turku = next(r for r in _site_results(improvement, ON_TIME) if r["scope_id"] == "S002")
    assert turku["comparison_period"]["counts"] == {"late_cycles": 0, "sampled_cycles": 296}
    assert turku["period"]["counts"] == {"late_cycles": 4, "sampled_cycles": 126}
    assert turku["p_value"] < 0.05
    assert turku["caveats"] == [pipeline.period_comparisons.SITE_CHANCE_CAVEAT, pipeline.catalogue.SAMPLE_CAVEAT]
    assert turku["view"] == "KAM"


def test_sites_not_evaluated_under_the_guards(improvement, master):
    assert _sites_labelled(improvement, master, ON_TIME, "not_evaluated") == [
        "Mediora Kraków", "Mediora Poznań", "Mediora Warsaw", "NorthStar Vaasa",
    ]
    assert _sites_labelled(improvement, master, SCAN, "not_evaluated") == ["NorthStar Gdańsk", "NorthStar Tampere"]
    assert _sites_labelled(improvement, master, REQUESTS, "not_evaluated") == []
    vaasa = next(r for r in _site_results(improvement, ON_TIME) if r["scope_id"] == "S007")
    assert vaasa["not_evaluated_reason"] == "89 sampled cycles in H2 2025, under the minimum of 100."
    assert vaasa["p_value"] is None


def test_site_results_are_ordered_worse_better_no_clear_change_not_evaluated(improvement):
    order = ["worse", "better", "no_clear_change", "not_evaluated"]
    for comparison in improvement["data"]["results"]["comparisons"]:
        sites = comparison["site_results"]
        assert [order.index(r["label"]) for r in sites] == sorted(order.index(r["label"]) for r in sites)
        clear = [abs(r["relative_change"]) for r in sites if r["label"] == "no_clear_change"]
        assert clear == sorted(clear, reverse=True)
    mediora_requests = next(c for c in improvement["data"]["results"]["comparisons"]
                            if (c["comparison_id"], c["customer_id"]) == (REQUESTS, "CUST003"))
    assert mediora_requests["site_results"][0]["scope_id"] == "S032"


def test_improvement_catalogue_holds_the_three_comparisons(improvement):
    catalogue = improvement["catalogue"]
    assert [e["id"] for e in catalogue] == [ON_TIME, REQUESTS, SCAN]
    assert [e["kpi_id"] for e in catalogue] == [
        "on_time_service_cycle_share", "service_requests_per_100_wearers", "scan_coverage",
    ]
    assert [e["better_when"] for e in catalogue] == ["higher", "lower", "higher"]
    assert [e["minimum_volume"] for e in catalogue] == [100, 600, 500]
    for entry in catalogue:
        assert entry["id"] == pipeline.catalogue.catalogue_id(entry["name"])
        assert (entry["evidence_area"], entry["review_part"], entry["view"], entry["site_view"]) == (
            "Improvement", "Look forward", "Both", "KAM")
        assert entry["grain"] == "Customer, Site"
        assert (entry["data_status"], entry["threshold_data_status"]) == ("SYNTHETIC", "TEAM_ASSUMPTION")
        assert entry["rationale"] == ("No public benchmark exists. Set so that 2025 noise between half-years "
                                      "is not reported as change.")
        assert "About 1 in 20 Sites shows a clear change by chance alone." in entry["caveats"]
    assert "Based on a sample of tracked garments." in catalogue[0]["caveats"]


def test_improvement_defaults_are_the_override_parameters(improvement):
    assert improvement["data"]["defaults"] == {
        "test_level": 0.95,
        "scan_coverage_threshold_points": 5,
        "minimum_sampled_cycles": 100,
        "minimum_wearer_months": 600,
        "minimum_allocated_pieces_monthly_average": 500,
    }


def test_compare_to_convention(improvement):
    convention = improvement["data"]["compare_to"]
    assert [v["value"] for v in convention["values"]] == ["previous_period", "h2_vs_h1", "none"]
    assert [(r["compare_to"], r["label"]) for r in convention["default_rule"]] == [
        ("h2_vs_h1", "within 2025"), ("previous_period", None),
    ]
    assert {a["answer"] for a in convention["not_available"]} == {"not available: the data holds 2025 only"}
    assert len(convention["not_available"]) == 2


def test_january_2026_cycles_fall_outside_every_2025_period(improvement, service):
    note = improvement["data"]["data_transparency_notes"]
    assert [n["id"] for n in note] == ["cycles_delivered_in_2026_01"]
    assert note[0]["text"].startswith("23 sampled service cycles")
    customers = [c["customer_result"] for c in improvement["data"]["results"]["comparisons"]
                 if c["comparison_id"] == ON_TIME]
    in_2025 = sum(f["cycles"] for f in service["data"]["cycles"] if f["month"].startswith("2025"))
    assert sum(r["period"]["volume"] + r["comparison_period"]["volume"] for r in customers) == in_2025


def test_improvement_avoids_glossary_terms_and_em_dashes(improvement):
    text = json.dumps({"catalogue": improvement["catalogue"], "data": improvement["data"]}, ensure_ascii=False).lower()
    assert "—" not in text
    for term in ("baseline", "trend", "delta", "prior period", "reference period", "complaint", "confidence",
                 "recommendation", "alert"):
        assert term not in text, term


# customer-priorities.json


def test_kpi_references_pass_when_every_id_is_in_some_catalogue():
    outputs = {
        "a": {"catalogue": [{"id": "water_saved"}], "data": {}},
        "b": {"catalogue": [{"id": "water", "kpi_ids": ["water_saved"]}], "data": {}},
    }
    pipeline.catalogue.check_kpi_references(outputs)


def test_kpi_references_fail_on_an_id_no_catalogue_holds():
    outputs = {"b": {"catalogue": [{"id": "water", "kpi_ids": ["water_saved", "water_wasted"]}], "data": {}}}
    with pytest.raises(ValueError, match="water_wasted"):
        pipeline.catalogue.check_kpi_references(outputs)


def test_default_order_follows_the_stated_topics_deduplicated_and_skipping_unmapped():
    order = pipeline.customer_priorities.default_order(
        ["Cost optimization", "Garment utilization", "Repair", "Safety"],
        ["Cost and allocation efficiency", "Repair and lifetime", "Safety and availability"],
    )
    assert order == {
        "source": "priority_topics",
        "priority_ids": ["garment_utilisation", "circularity"],
        "skipped_terms": ["Safety"],
    }


def test_default_order_falls_back_to_the_industry_ranking_only_without_stated_topics():
    order = pipeline.customer_priorities.default_order(
        [], ["Hygiene and traceability", "Service continuity", "Compliance-ready evidence"],
    )
    assert order == {
        "source": "Industry_Priorities",
        "priority_ids": ["traceability", "service_reliability"],
        "skipped_terms": ["Compliance-ready evidence"],
    }


def test_a_source_term_missing_from_the_term_map_stops_the_build():
    with pytest.raises(ValueError, match="Hygiene first"):
        pipeline.customer_priorities.default_order(["Hygiene first"], [])


@pytest.fixture(scope="module")
def priorities(out_dir) -> dict:
    return json.loads((out_dir / "customer-priorities.json").read_text(encoding="utf-8"))


def test_default_priority_order_per_customer(priorities):
    orders = {o["customer_id"]: o for o in priorities["data"]["default_order"]}
    assert orders["CUST001"]["priority_ids"] == ["water", "service_reliability", "emissions"]
    assert orders["CUST002"]["priority_ids"] == ["garment_utilisation", "circularity"]
    assert orders["CUST003"]["priority_ids"] == ["traceability", "service_reliability"]
    assert {o["source"] for o in orders.values()} == {"priority_topics"}
    assert orders["CUST001"]["skipped_terms"] == ["Hygiene"]
    assert orders["CUST003"]["skipped_terms"] == ["Hygiene", "Compliance"]


def test_the_seven_customer_priorities(priorities):
    catalogue = priorities["catalogue"]
    assert [e["name"] for e in catalogue] == [
        "Water", "Emissions", "Circularity", "Service reliability", "Garment utilisation", "Traceability", "Improvement",
    ]
    for entry in catalogue:
        assert entry["id"] == pipeline.catalogue.catalogue_id(entry["name"])
        assert entry["core_or_industry"] == "Core KPI"
        assert "never hides a KPI" in " ".join(entry["caveats"])
    improvement = catalogue[-1]
    assert improvement["kpi_ids"] == [
        "improvement_on_time_service_cycles", "improvement_service_requests", "improvement_scan_coverage",
    ]
    traceability = catalogue[5]
    assert traceability["kpi_ids"] == ["scan_coverage", "turnaround_by_stage", "on_time_service_cycle_share"]


def test_every_kpi_id_in_a_kpi_set_is_in_a_catalogue_file(out_dir, priorities):
    known = {e["id"] for f in out_dir.glob("*.json") for e in json.loads(f.read_text(encoding="utf-8"))["catalogue"]}
    used = {kpi_id for e in priorities["catalogue"] for kpi_id in e["kpi_ids"]}
    assert len(used) == 30
    assert used <= known


def test_term_map_covers_every_workbook_term_and_leaves_the_data_gaps_unmapped(priorities, master):
    terms = {t["term"]: t for t in priorities["data"]["term_map"]}
    workbook_terms = {p["priority_theme"] for p in master["data"]["industry_priorities"]}
    workbook_terms |= {t for c in master["data"]["customers"] for t in c["priority_topics"]}
    assert workbook_terms <= set(terms)
    unmapped = sorted(t for t, row in terms.items() if row["priority_id"] == "unmapped")
    assert unmapped == ["Compliance", "Compliance-ready evidence", "Hygiene", "Hygiene and compliance", "Safety",
                        "Safety and availability"]
    assert terms["Cost optimization"]["priority_id"] == "garment_utilisation"
    assert terms["Hygiene and traceability"]["priority_id"] == "traceability"
    assert terms["Service continuity"]["sources"] == ["Industry_Priorities", "priority_topics"]
    assert terms["cost"]["sources"] == ["brief"]


def test_dashboard_emphasis_is_kam_only_and_illustrative(priorities):
    emphasis = priorities["data"]["dashboard_emphasis"]
    assert [e["industry"] for e in emphasis] == ["Food & Beverage", "Healthcare", "Manufacturing"]
    assert {(e["view"], e["illustrative"]) for e in emphasis} == {("KAM", True)}
    assert [t["priority_rank"] for t in emphasis[0]["texts"]] == [1, 2, 3]
    assert emphasis[0]["texts"][1]["text"] == "Prioritize water use/savings and washed-kg efficiency."


def test_cost_note_defers_financial_value(priorities):
    note = priorities["data"]["cost_note"]
    assert note["priority_id"] == "garment_utilisation"
    assert "Financial Value is deferred" in note["text"] and "no euro figure" in note["text"]


def test_customer_priorities_avoid_glossary_terms_and_em_dashes(priorities):
    # The dashboard_emphasis texts are copied from the workbook as they are, so only they are left out.
    data = json.loads(json.dumps(priorities["data"]))
    for emphasis in data["dashboard_emphasis"]:
        for row in emphasis["texts"]:
            row.pop("text")
    text = json.dumps({"catalogue": priorities["catalogue"], "data": data}, ensure_ascii=False).lower()
    assert "—" not in text
    for term in ("focus area", "preference", "theme", "industry kpi", "baseline"):
        assert not re.search(rf"{term}", text), term


def test_kpi_references_do_not_count_ids_from_the_referencing_file_itself():
    outputs = {"b": {"catalogue": [{"id": "water"}, {"id": "emissions", "kpi_ids": ["water"]}], "data": {}}}
    with pytest.raises(ValueError, match="'water'"):
        pipeline.catalogue.check_kpi_references(outputs)
