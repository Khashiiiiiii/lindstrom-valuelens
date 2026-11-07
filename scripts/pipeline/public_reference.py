"""Public reference figures (#6)."""

from __future__ import annotations

import copy

from .workbook import Record, Workbook


# Public reference figures. The workbook holds none of them, so they are constants.
# Findings and sources: the public reference ranges research of 2026-11-07.

LINDSTROM_REPORT_2025 = (
    "Lindström Sustainability Report 2025, Lindström Oy, published March 2026. "
    "EY limited assurance (ISAE 3000) over E1 climate, E3 water and E5 circular economy."
)
LINDSTROM_REPORT_2025_URL = (
    "https://d2ris6qfzcz0wn.cloudfront.net/wp-content/uploads/2026/03/Lindstrom-Sustainability-Report-2025.pdf"
)
CUSTOMER_BRIEF_NOTE_6 = (
    "Customer brief note 6, peer table in kg CO2e per euro of turnover: "
    "Elis 0.40, Cintas 0.20, Salesianer 0.31, Johnson Service Group 0.38, Lindström 0.28. "
    "The brief names no sources or years."
)
JSG_REPORT_2024 = (
    "Johnson Service Group Sustainability Report 2024. Moderate assurance (AA1000AS v3) by Jacobs."
)
JSG_REPORT_2024_URL = "https://jsg.com/media/2249780/2025-0290-sustainability-report-2024.pdf"
NSW_LAUNDRIES = (
    "NSW Government, Commercial laundries water saving tips. "
    "The page has no date, so the year is the year it was read (2026)."
)
NSW_LAUNDRIES_URL = (
    "https://www.water.dcceew.nsw.gov.au/our-work/projects-and-programs/water-efficiency-program/"
    "water-saving-tips/commerical-laundries"
)
JRC_2017 = (
    "Boyano A. et al. (2017). Ecodesign and Energy Label for Household Washing machines and washer dryers, "
    "preparatory study, final report. JRC108604, EUR 28809 EN, Publications Office of the EU. Table 5.4."
)
JRC_2017_URL = (
    "https://www.energimyndigheten.se/4ae46a/globalassets/energieffektivisering_/jag-ar-saljare-eller-tillverkare/"
    "dokument/produkter-med-krav/tvattmaskiner-hushall/forstudie-revision-tvatt_20171117_jrc108604.pdf"
)
LINDSTROM_UK_2022 = "Lindström UK, The benefits of renting workwear rather than buying, 29.11.2022."
LINDSTROM_UK_2022_URL = "https://lindstromgroup.com/uk/article/the-benefits-of-renting-workwear-rather-than-buying/"

# Where a figure is used. Every figure names at least one.
CONTEXT_LINE = "context_line"
DATA_TRANSPARENCY = "data_transparency"
TEAM_ASSUMPTION_RATIONALE = "team_assumption_rationale"


def public_figure(
    id: str,
    name: str,
    value: float | dict[str, float],
    unit: str,
    scope: str,
    source: str,
    url: str | None,
    page: str | None,
    year: int,
    applicability: str,
    used_in: list[str],
    derived: bool = False,
) -> Record:
    """One citable public figure. value is a number, or {"low": ..., "high": ...} for a range.

    derived is True when the figure is arithmetic on published numbers, not a published number itself.
    """
    return {
        "id": id,
        "name": name,
        "value": value,
        "unit": unit,
        "scope": scope,
        "source": source,
        "url": url,
        "page": page,
        "year": year,
        "applicability": applicability,
        "used_in": used_in,
        "derived": derived,
        "data_status": "PUBLIC_REFERENCE",
    }


PUBLIC_FIGURES: tuple[Record, ...] = (
    # Lindström 2025 report
    public_figure(
        "lindstrom_water_per_washed_kg_group",
        "Lindström water per washed kg, group",
        6.82,
        "L/kg",
        "All Lindström laundries and all 7 service lines, 2025. It was 7.08 L/kg in 2024.",
        LINDSTROM_REPORT_2025, LINDSTROM_REPORT_2025_URL, "47, 53", 2025,
        "Close to the dataset's laundry water of 6.74 L/kg (washed-kg weighted). The dataset's laundries are "
        "workwear laundries, so the workwear figure may fit them better.",
        [DATA_TRANSPARENCY],
    ),
    public_figure(
        "lindstrom_water_per_washed_kg_workwear",
        "Lindström water per washed kg, workwear",
        12.5,
        "L/kg",
        "Lindström workwear laundries only, 2025. It was 13.0 L/kg in 2024.",
        LINDSTROM_REPORT_2025, LINDSTROM_REPORT_2025_URL, "53", 2025,
        "Above the B_LOCAL baseline of 9.5 L/kg and close to the B_INHOUSE baseline of 12.5 L/kg.",
        [DATA_TRANSPARENCY],
    ),
    public_figure(
        "lindstrom_laundry_energy_per_washed_kg",
        "Lindström laundry energy per washed kg",
        0.99,
        "kWh/kg",
        "Energy used in Lindström laundries only, 2025. Excludes Lindström's own vehicles. It was 1.01 in 2024.",
        LINDSTROM_REPORT_2025, LINDSTROM_REPORT_2025_URL, "44", 2025,
        "The dataset's laundry energy (0.70 kWh/kg, washed-kg weighted) is about 30% below it. "
        "The B_LOCAL baseline (1.05 kWh/kg) is close to it.",
        [DATA_TRANSPARENCY],
    ),
    public_figure(
        "lindstrom_emissions_per_washed_kg_scope_1_2",
        "Lindström emissions per washed kg, Scope 1+2",
        0.19,
        "kgCO2e/kg",
        "Lindström group, Scope 1+2, 2025. It was 0.23 in 2024 and 0.30 in 2021.",
        LINDSTROM_REPORT_2025, LINDSTROM_REPORT_2025_URL, "44", 2025,
        "The dataset's laundry process CO2e (0.106 kgCO2e/kg, washed-kg weighted) is below it. "
        "It is the low end of the Scope 1+2 range of large operators.",
        [DATA_TRANSPARENCY, TEAM_ASSUMPTION_RATIONALE],
    ),
    public_figure(
        "lindstrom_emissions_per_washed_kg_scope_1_2_3",
        "Lindström emissions per washed kg, Scope 1+2+3",
        0.71,
        "kgCO2e/kg",
        "Lindström group, Scope 1+2+3, 2025. It was 0.79 in 2024 and 0.90 in 2021.",
        LINDSTROM_REPORT_2025, LINDSTROM_REPORT_2025_URL, "44", 2025,
        "The B_LOCAL process factor (0.62 kgCO2e/kg) is close to this full-scope figure, while the dataset's "
        "laundry actuals are near Scope 1+2 levels. Emissions saved against B_LOCAL may be overstated.",
        [DATA_TRANSPARENCY],
    ),
    public_figure(
        "lindstrom_textile_waste_recycled_share",
        "Lindström textile waste recycled",
        66,
        "%",
        "Lindström group, 2025. It was 69.9% in 2024. The target of 100% by 2025 was missed after stoppages "
        "at recycling partners.",
        LINDSTROM_REPORT_2025, LINDSTROM_REPORT_2025_URL, "54, 61", 2025,
        "A group figure. It never stands in for a Customer's recycled or reused share.",
        [DATA_TRANSPARENCY],
    ),
    public_figure(
        "lindstrom_textiles_repaired",
        "Lindström textiles repaired",
        2_900_000,
        "pieces",
        "Lindström group, 2025. The report says this is not comparable with 2024 data.",
        LINDSTROM_REPORT_2025, LINDSTROM_REPORT_2025_URL, "54", 2025,
        "A group count. It never stands in for a Customer's repairs.",
        [DATA_TRANSPARENCY],
    ),
    public_figure(
        "lindstrom_emissions_per_euro_of_turnover",
        "Lindström emissions per euro of turnover",
        0.281,
        "kgCO2e/EUR",
        "Lindström group, Scope 1+2+3, market-based, net revenue EUR 541.9 million, 2025. Location-based it is "
        "0.296. The customer brief and the context line round it to 0.28.",
        LINDSTROM_REPORT_2025, LINDSTROM_REPORT_2025_URL, "44", 2025,
        "A group intensity. It is never multiplied into a Customer figure, because the data holds no "
        "Customer spend (ADR 0005).",
        [CONTEXT_LINE],
    ),
    # Peer context
    public_figure(
        "lindstrom_emissions_per_euro_gap_to_peer_average",
        "Lindström emissions per euro, gap to the peer average",
        13,
        "% below",
        "0.28 against 0.3225 kg CO2e/EUR, the average of the 4 peers in the customer brief: Elis, Cintas, "
        "Salesianer and Johnson Service Group. Lindström is left out of the average. The brief gives no years "
        "for the peer values, so the year is that of the Lindström value.",
        f"{CUSTOMER_BRIEF_NOTE_6} Lindström figure from the {LINDSTROM_REPORT_2025}", LINDSTROM_REPORT_2025_URL,
        "44", 2025,
        "Only the Lindström value is verified. The Elis, Cintas and Salesianer per-euro values are unverified, "
        "and Scope 3 boundaries differ between operators, so the gap is rough.",
        [CONTEXT_LINE],
        derived=True,
    ),
    public_figure(
        "lindstrom_emissions_per_euro_gap_to_average_with_lindstrom",
        "Lindström emissions per euro, gap to the average with Lindström included",
        10.8,
        "% below",
        "0.28 against the average of the 4 peers and Lindström in the customer brief. The brief gives no years "
        "for the peer values, so the year is that of the Lindström value.",
        f"{CUSTOMER_BRIEF_NOTE_6} Lindström figure from the {LINDSTROM_REPORT_2025}", LINDSTROM_REPORT_2025_URL,
        "44", 2025,
        "A KAM note under the context line uses it, next to the 13% of the line itself.",
        [CONTEXT_LINE],
        derived=True,
    ),
    public_figure(
        "jsg_emissions_per_gbp_of_revenue",
        "Johnson Service Group emissions per pound of revenue",
        0.31,
        "kgCO2e/GBP",
        "Johnson Service Group, 159,948 tCO2e (Scope 1+2+3) over GBP 513.4 million revenue, 2024.",
        JSG_REPORT_2024, JSG_REPORT_2024_URL, "39", 2024,
        "It does not match the customer brief's 0.38 per euro. A pound is worth more than a euro, so JSG's figure "
        "per euro is lower still. The brief may use another year or boundary.",
        [CONTEXT_LINE],
        derived=True,
    ),
    # Industrial laundry water and energy
    public_figure(
        "industrial_laundry_water_per_kg_by_machine_type",
        "Industrial laundry water per kg, by machine type",
        {"low": 4.5, "high": 22},
        "L/kg",
        "Machine level, Australia. Tunnel washers use 4.5 to 5 L/kg with water recycling and 7.5 to 12 without. "
        "Washer-extractors use 12 to 15 L/kg after water saving and 17 to 22 before.",
        NSW_LAUNDRIES, NSW_LAUNDRIES_URL, None, 2026,
        "The B_LOCAL (9.5 L/kg) and B_INHOUSE (12.5 L/kg) water factors fall inside this range.",
        [DATA_TRANSPARENCY, TEAM_ASSUMPTION_RATIONALE],
    ),
    public_figure(
        "jsg_water_per_kg",
        "Johnson Service Group water per kg",
        6.7,
        "L/kg",
        "Johnson Service Group, 6.698 m3 per tonne processed, 2024. UK healthcare linen, hospitality and workwear.",
        JSG_REPORT_2024, JSG_REPORT_2024_URL, "39", 2024,
        "A peer laundry figure, close to the dataset's laundry water of 6.74 L/kg.",
        [DATA_TRANSPARENCY, TEAM_ASSUMPTION_RATIONALE],
    ),
    public_figure(
        "salesianer_water_per_kg",
        "Salesianer water per kg",
        8.87,
        "L/kg",
        "Salesianer Miettex group, financial year 2025/2026. The 2030 target is 7.20 L/kg.",
        "Salesianer Miettex, sustainability report summary 2025/26.",
        "https://www.salesianer.com/files/Inhalte/Folder/SALESIANER-Nachhaltigkeitsbericht-Zusammenfassung-2025_26-EN-DIGITAL.pdf",
        None, 2025,
        "A peer laundry figure, a little below the B_LOCAL water factor of 9.5 L/kg.",
        [DATA_TRANSPARENCY, TEAM_ASSUMPTION_RATIONALE],
    ),
    public_figure(
        "whole_plant_laundry_energy_per_kg",
        "Whole-plant laundry energy per kg",
        {"low": 1.6, "high": 1.7},
        "kWh/kg",
        "Typical UK and European laundries, whole plant, per kg of dry textiles.",
        "Robarts S., Laundry and Cleaning News, 21.02.2024, quoting Richard Neale of LTC Worldwide. "
        "Trade press, with no cited dataset.",
        "https://laundryandcleaningnews.com/?p=18081", None, 2024,
        "It is the only whole-plant energy range found. It gives an upper end for the B_LOCAL energy factor "
        "(1.05 kWh/kg).",
        [DATA_TRANSPARENCY, TEAM_ASSUMPTION_RATIONALE],
    ),
    # Home washing
    public_figure(
        "home_washing_water_per_kg",
        "Home washing water per kg",
        {"low": 13, "high": 20},
        "L/kg",
        "EU real-life home washing at 3.4 kg loads on 7 kg machines, by programme. Cotton programmes use about "
        "13.7 L/kg.",
        JRC_2017, JRC_2017_URL, "385", 2017,
        "The B_HOME baseline (20 L/kg) is at the top of this range.",
        [DATA_TRANSPARENCY, TEAM_ASSUMPTION_RATIONALE],
        derived=True,
    ),
    public_figure(
        "home_washing_energy_per_kg",
        "Home washing energy per kg, washing only",
        {"low": 0.19, "high": 0.30},
        "kWh/kg",
        "EU real-life home washing at 3.4 kg loads, cotton programmes at 40 and 60 °C. Washing only, no drying.",
        JRC_2017, JRC_2017_URL, "385", 2017,
        "The B_HOME baseline's 1.18 kWh/kg only fits if tumble drying is included.",
        [DATA_TRANSPARENCY, TEAM_ASSUMPTION_RATIONALE],
    ),
    # Scope 1+2 range of large operators
    public_figure(
        "large_operator_emissions_per_kg_scope_1_2",
        "Large operator emissions per kg, Scope 1+2",
        {"low": 0.19, "high": 0.30},
        "kgCO2e/kg",
        "Lindström 0.19 (2025) and Johnson Service Group 0.303 (2024), Scope 1+2 per kg processed. "
        "Lindström's own figure was 0.30 in 2021.",
        f"{LINDSTROM_REPORT_2025} p. 44. {JSG_REPORT_2024} p. 39.", LINDSTROM_REPORT_2025_URL, None, 2025,
        "It is the rationale for the TEAM_ASSUMPTION low case of 0.30 kgCO2e/kg for the B_LOCAL process factor, "
        "which is the top of this range. The B_LOCAL process factor of 0.62 is 2 to 3 times this range.",
        [TEAM_ASSUMPTION_RATIONALE],
        derived=True,
    ),
    # Lindström UK garment life
    public_figure(
        "lindstrom_garment_washes_per_life",
        "Lindström garment washes per life",
        50,
        "washes",
        "A Lindström work garment, which lasts 3 years on average.",
        LINDSTROM_UK_2022, LINDSTROM_UK_2022_URL, None, 2022,
        "About one wash every 3 weeks per garment, which fits a pool of several sets per wearer.",
        [TEAM_ASSUMPTION_RATIONALE],
    ),
    public_figure(
        "lindstrom_garment_repairs_per_life",
        "Lindström garment repairs per life",
        6,
        "repairs",
        "A Lindström work garment over its life of about 50 washes.",
        LINDSTROM_UK_2022, LINDSTROM_UK_2022_URL, None, 2022,
        "About 6 repairs per garment life, so 1 replacement postponed per repair (A002) is generous.",
        [TEAM_ASSUMPTION_RATIONALE],
    ),
)

# Topics with no primary public source. The app shows them as data gaps.
PUBLIC_REFERENCE_GAPS: tuple[Record, ...] = (
    {
        "id": "on_time_service_cycle_target",
        "topic": "On-time service cycle target",
        "finding": "No public source gives a target share of on-time service cycles in workwear or textile "
        "rental. Operator reports, ETSA papers and the UK Crown Commercial Service framework RM6154 were checked.",
        "treatment": "On-time thresholds are TEAM_ASSUMPTION values. A contract target would be KAM-entered, "
        "which ADR 0004 leaves out of scope.",
    },
    {
        "id": "garment_sets_per_wearer",
        "topic": "Garment sets per wearer",
        "finding": "No primary source gives a 3-set or 5-set rule. The only published count is 11 sets per "
        "wearer for a 5-day week in US public uniform rental contracts (Colleton County RFP, 2015).",
        "treatment": "Shown as a data gap. A set count, if one is used, is a TEAM_ASSUMPTION value.",
    },
    {
        "id": "etsa_and_bref_laundry_figures",
        "topic": "ETSA and BREF laundry figures",
        "finding": "ETSA publishes no water, energy or CO2 figure per kg. The EU Textiles BREF (JRC, 2023) covers "
        "textile pre-treatment and dyeing, not laundries.",
        "treatment": "Laundry factors are compared with operator reports, the NSW Government ranges, "
        "JRC 2017 and trade press instead.",
    },
)

GROUP_EMISSIONS_INTENSITY_LINE: Record = {
    "text": "Lindström Group 0.28 kg CO2e per euro of turnover, 13% below the average of Elis, Cintas, "
    "Salesianer and Johnson Service Group.",
    "evidence_area": "Sustainability Value",
    "view": "Both",
    "data_status": "PUBLIC_REFERENCE",
    "figure_ids": ["lindstrom_emissions_per_euro_of_turnover", "lindstrom_emissions_per_euro_gap_to_peer_average"],
    "kam_notes": [
        {
            "text": "The 13% holds only when Lindström is left out of the average. It is 10.8% when Lindström "
            "is included.",
            "figure_ids": ["lindstrom_emissions_per_euro_gap_to_average_with_lindstrom"],
        },
        {
            "text": "The Johnson Service Group figure of 0.38 does not match JSG's 2024 report, which gives "
            "about 0.31 per GBP.",
            "figure_ids": ["jsg_emissions_per_gbp_of_revenue"],
        },
    ],
    "caveats": ["The intensity is never multiplied into a Customer figure. No Customer spend exists."],
}


def build_public_reference(wb: Workbook) -> Record:
    """The public reference figures. Reads nothing from the workbook."""
    return {
        "catalogue": [],
        "data": {
            "context_lines": {"group_emissions_intensity": copy.deepcopy(GROUP_EMISSIONS_INTENSITY_LINE)},
            "figures": copy.deepcopy(list(PUBLIC_FIGURES)),
            "gaps": copy.deepcopy(list(PUBLIC_REFERENCE_GAPS)),
        },
    }
