"""Workbook loading and the months the data covers (#2)."""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any

import openpyxl


Record = dict[str, Any]


# Workbook loading


class Workbook:
    """The source workbook, read once, with each sheet as a list of records keyed by its header row."""

    def __init__(self, path: Path):
        self.path = path
        self.sha256 = hashlib.sha256(path.read_bytes()).hexdigest()
        book = openpyxl.load_workbook(path, read_only=True, data_only=True)
        try:
            self._sheets = {ws.title: _sheet_records(ws) for ws in book.worksheets}
        finally:
            book.close()

    def records(self, sheet: str) -> list[Record]:
        """The sheet's rows in sheet order. Callers get copies, so a builder cannot change another's input."""
        return [dict(row) for row in self._sheets[sheet]]


def _sheet_records(ws) -> list[Record]:
    rows = ws.iter_rows(values_only=True)
    header = next(rows, None) or ()
    keys = [str(h).strip() if h is not None else None for h in header]
    records = []
    for row in rows:
        if all(v is None for v in row):
            continue
        records.append({k: v for k, v in zip(keys, row) if k is not None})
    return records


# Months

MONTHLY_SHEETS = ("Service_Activity", "Repairs", "Laundry_Resources", "Waste_Circularity", "Customer_Impacts")


def month_key(value: Any) -> str:
    """A month cell as a "YYYY-MM" string. Accepts "2025-01" text or a date."""
    if hasattr(value, "strftime"):
        return value.strftime("%Y-%m")
    text = str(value).strip()
    if len(text) < 7 or text[4] != "-":
        raise ValueError(f"not a YYYY-MM month: {value!r}")
    return text[:7]


def data_months(wb: Workbook) -> list[str]:
    """Every month that the monthly fact sheets hold, in order."""
    return sorted({month_key(row["month"]) for sheet in MONTHLY_SHEETS for row in wb.records(sheet)})


def data_year(months: list[str]) -> str:
    """The one year the data months fall in."""
    years = {m[:4] for m in months}
    if len(years) != 1:
        raise ValueError(f"data months must fall in one year: {months}")
    return years.pop()


# Cells


def split_topics(value: str | None) -> list[str]:
    """Split a "|"-separated topic cell into its topics, in sheet order."""
    if not value:
        return []
    return [t.strip() for t in str(value).split("|") if t.strip()]
