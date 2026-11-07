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
import preprocess  # noqa: E402


@pytest.fixture(scope="module")
def workbook():
    return preprocess.Workbook(WORKBOOK)


def test_customer_active_wearers_take_the_largest_product_row_per_site(workbook):
    # ADR 0003: NorthStar in December reads 9,607, not the 28,367 that summing product rows gives.
    by_customer = preprocess.customer_active_wearers(workbook.records("Service_Activity"))
    assert by_customer[("CUST001", "2025-12")] == 9607


def test_active_wearers_over_a_period_are_the_monthly_average():
    rows = [
        {"customer_id": "C", "site_id": "S1", "month": "2025-01", "active_wearers": 100},
        {"customer_id": "C", "site_id": "S1", "month": "2025-01", "active_wearers": 90},
        {"customer_id": "C", "site_id": "S2", "month": "2025-01", "active_wearers": 50},
        {"customer_id": "C", "site_id": "S1", "month": "2025-02", "active_wearers": 120},
        {"customer_id": "C", "site_id": "S2", "month": "2025-02", "active_wearers": 70},
    ]
    monthly = preprocess.customer_active_wearers(rows)
    assert monthly == {("C", "2025-01"): 150, ("C", "2025-02"): 190}
    assert preprocess.period_average(monthly, "C", ["2025-01", "2025-02"]) == 170


def test_month_facts_sum_additive_fields_by_key_and_month():
    rows = [
        {"site_id": "S1", "month": "2025-01", "on_time": 9, "cycles": 10},
        {"site_id": "S1", "month": "2025-01", "on_time": 1, "cycles": 10},
        {"site_id": "S1", "month": "2025-02", "on_time": 90, "cycles": 100},
    ]
    facts = preprocess.month_facts(rows, ["site_id"], ["on_time", "cycles"])
    assert facts == [
        {"site_id": "S1", "month": "2025-01", "on_time": 10, "cycles": 20},
        {"site_id": "S1", "month": "2025-02", "on_time": 90, "cycles": 100},
    ]


def test_ratio_is_rebuilt_from_summed_totals_not_averaged():
    # Row ratios 0.5 and 0.9 average to 0.7; the totals give 100 / 120.
    facts = [{"on_time": 10, "cycles": 20}, {"on_time": 90, "cycles": 100}]
    assert preprocess.ratio_of_totals(facts, "on_time", "cycles") == pytest.approx(100 / 120)
    assert preprocess.ratio_of_totals([], "on_time", "cycles") is None


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
    stats = preprocess.turnaround_stats(preprocess.cycle_rows(workbook.records("Service_Cycles")))
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
