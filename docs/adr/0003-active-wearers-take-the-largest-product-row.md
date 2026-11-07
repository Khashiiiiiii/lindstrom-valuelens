# Active wearers take the largest product row per Site, not the sum

Service_Activity has one `active_wearers` value per Site, product and month. Summing the rows counts a wearer once for each garment type they have: NorthStar in December reads 28,367 by summing and 9,607 by taking the largest row per Site. Within one Site and month the rows differ by at most 7%. We count active wearers as the largest row per Site and month, sum Sites to get a Customer, and take the monthly average over a period. At product grain the row value is used as it is.

## Consequences

- Every per-wearer figure (garments per wearer, service requests per 100 wearers, footprint per active wearer, signal 1 and the wearer-month guards) uses this rule. Changing it shifts all of them.
- The rule assumes every wearer has the most-issued garment type. This caveat goes on active wearers and garments per wearer.

Source: [Service performance and adoption KPIs JSON](https://github.com/Khashiiiiiii/lindstrom-valuelens/issues/3).
