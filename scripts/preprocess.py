"""Turn the source workbook into the JSON files in data/processed/.

Run: python scripts/preprocess.py [--xlsx <path>] [--out data/processed]

Each output file has the shape {"meta": {...}, "catalogue": [...], "data": {...}}
and is written by one build_<name>() function listed in BUILDERS. The same
workbook always gives byte-identical files: keys are sorted and no timestamp is
written. meta.source_sha256 names the workbook.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Callable

from pipeline.account_health import build_account_health
from pipeline.footprint_handprint_kpis import build_footprint_handprint_kpis
from pipeline.period_comparisons import build_period_comparisons
from pipeline.master_data import build_master_data
from pipeline.operational_circularity_kpis import build_operational_circularity_kpis
from pipeline.public_reference import build_public_reference
from pipeline.service_kpis import build_service_kpis
from pipeline.workbook import Record, Workbook


REPO = Path(__file__).resolve().parent.parent
DEFAULT_XLSX = REPO / "data" / "raw" / "Lindstrom_SinceAI_Customer_Value_Synthetic_Data_Pack.xlsx"
DEFAULT_OUT = REPO / "data" / "processed"


# Deterministic JSON writer


def write_json(path: Path, payload: Any) -> None:
    """Write sorted-key, 2-space-indented UTF-8 JSON with a trailing newline."""
    text = json.dumps(payload, sort_keys=True, indent=2, ensure_ascii=False, allow_nan=False)
    path.write_text(text + "\n", encoding="utf-8", newline="\n")


# Builders: one per output file. Each returns {"catalogue": [...], "data": {...}}.

BUILDERS: dict[str, Callable[[Workbook], Record]] = {
    "master-data": build_master_data,
    "operational-circularity-kpis": build_operational_circularity_kpis,
    "service-kpis": build_service_kpis,
    "public-reference": build_public_reference,
    "account-health": build_account_health,
    "footprint-handprint-kpis": build_footprint_handprint_kpis,
    "period-comparisons": build_period_comparisons,
}


# CLI


def run(xlsx: Path, out: Path) -> list[Path]:
    wb = Workbook(xlsx)
    out.mkdir(parents=True, exist_ok=True)
    written = []
    for name, build in BUILDERS.items():
        built = build(wb)
        payload = {
            "meta": {
                "name": name,
                "source_file": xlsx.name,
                "source_sha256": wb.sha256,
            },
            "catalogue": built["catalogue"],
            "data": built["data"],
        }
        path = out / f"{name}.json"
        write_json(path, payload)
        written.append(path)
    return written


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--xlsx", type=Path, default=DEFAULT_XLSX, help="source workbook")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT, help="output directory")
    args = parser.parse_args(argv)
    for path in run(args.xlsx, args.out):
        print(f"wrote {path}")


if __name__ == "__main__":
    main()
