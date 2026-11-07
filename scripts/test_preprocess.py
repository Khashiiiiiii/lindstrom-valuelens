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
