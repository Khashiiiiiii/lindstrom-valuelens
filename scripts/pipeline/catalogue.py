"""KPI catalogue entry parts that more than one output file uses (#1)."""

from __future__ import annotations

from .workbook import Record


SUSTAINABILITY_VALUE = ("Sustainability Value", "What environmental value are we creating together?")
PERFORMANCE = ("Service Performance", "Is the service reliable?")
ADOPTION = ("Service Adoption", "Are we using the service effectively?")

SAMPLE_CAVEAT = "Based on a sample of tracked garments."
CYCLE_FIELDS = ["Service_Cycles.cycle_hours", "Service_Cycles.performance_flag", "Service_Cycles.delivered_timestamp"]


def kpi(
    id: str,
    name: str,
    area: tuple[str, str],
    definition: str,
    source_fields: list[str],
    grain: str,
    data_status: str,
    assumptions: list[str],
    caveats: list[str],
) -> Record:
    """A Core KPI catalogue entry shown in both views, in the Show value part of the review."""
    return {
        "id": id,
        "name": name,
        "evidence_area": area[0],
        "core_or_industry": "Core KPI",
        "customer_question": area[1],
        "definition": definition,
        "source_fields": source_fields,
        "grain": grain,
        "view": "Both",
        "review_part": "Show value",
        "data_status": data_status,
        "assumptions": assumptions,
        "caveats": caveats,
    }


def catalogue_id(name: str) -> str:
    """The snake_case id of a catalogue name, for example "Turnaround hours, median" -> "turnaround_hours_median"."""
    words = "".join(ch if ch.isalnum() else " " for ch in name.lower()).split()
    return "_".join(words)
