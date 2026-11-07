# Period comparisons default to H2 against H1 and use count tests

The data covers only the 12 months of 2025, so no year-on-year comparison exists. Every KPI tool takes `compare_to` with the values "previous period", "H2 against H1" and "none". For all of 2025 the default is H2 against H1, labelled "within 2025". For a shorter period the default is the previous period of the same length, when all its months are in the data.

A change is judged by a two-sided count test at the 95% level for on-time cycles and service requests, and by a change of 5 points or more for scan coverage, which counts the same garments every month. We rejected a relative change threshold because it mostly reports noise: service requests per 100 wearers move 50% or more at 14 of 34 Sites between the halves, while a count test flags 3, about what chance gives across 68 tests.

## Considered options

- Month over month and rolling-window change figures. Rejected; monthly values stay available as a series.
- Reusing the opportunity signal event guards. Rejected; only 1 Site-half would pass the 20 service request guard. Guards count the denominator instead (100 sampled cycles, 600 wearer-months, 500 allocated pieces).

## Consequences

- The Improvement evidence area lists 3 period comparisons (on-time service cycles, service requests, scan coverage), the same 3 KPIs as account health.
- Every Site result carries "About 1 in 20 Sites shows a clear change by chance alone." Site-grain results are KAM view only.
- Account health and opportunity signals take no `compare_to`. Each judges one period, and a Site that got worse is never ranked with signals.
- The period compared against is the comparison period, never a baseline. In this project a baseline is a washing alternative.

Source: [Improvement period comparisons JSON](https://github.com/Khashiiiiiii/lindstrom-valuelens/issues/10).
