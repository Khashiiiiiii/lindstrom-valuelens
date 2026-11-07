# The workbook is preprocessed into JSON files that store additive month-grain facts

The source is one Excel workbook. `scripts/preprocess.py` turns it into one JSON file per catalogue decision in `data/processed/`, and `lib/data.ts` holds one typed reader per file. The TS backend never opens the workbook. Fact rows store sums and counts at month grain, and every ratio is rebuilt from summed totals, never by averaging row ratios. Medians and percentiles cannot be summed, so they are precomputed for each grain they are needed at. This lets any later layer aggregate any period or apply `compare_to` without going back to the workbook.

## Consequences

- Every file has the shape `{ meta, catalogue, data }`. Every catalogue entry has the same fields, including `view`, `review_part` and `data_status`.
- Output is byte-identical for the same workbook: sorted keys, no timestamps, and `meta.source_sha256` names the workbook. A diff in `data/processed/` always means the workbook or the rules changed.
- A new statistic that does not add up, for example a new percentile, needs a builder change, not only a reader change.
- Acceptance checks quote 2025 workbook values and act as the test oracle.

Source: [Pipeline scaffold and master data JSON](https://github.com/Khashiiiiiii/lindstrom-valuelens/issues/2).
