# Emissions saved and avoided product CO2e are never added together

Emissions saved compares the Customer's allocated laundry emissions with a baseline washing alternative (B_LOCAL by default). Avoided product CO2e (estimated) is repairs times a postponement ratio times the product footprint, and it does not depend on the baseline. For NorthStar in 2025 they are 255,074 kg and 224,252 kg. Adding them would nearly double the headline, while the second figure rests on 2 low-confidence assumptions (A002 at a generous 1:1 ratio, and A005). We show them side by side with separate labels and never offer a combined CO2e handprint.

## Consequences

- The two figures live in different JSON files (footprint and handprint, operational and circularity), so no reader can sum them by accident.
- Energy saved and Emissions saved carry "Baseline factors are illustrative. Savings may be overstated." The dataset's laundry energy is about 30% below Lindström's published 0.99 kWh/kg, and the B_LOCAL process factor is close to Scope 1+2+3 levels while the actuals are close to Scope 1+2.
- A `TEAM_ASSUMPTION` low case of 0.30 kgCO2e/kg for the B_LOCAL process factor gives 94,410 kg saved, for the KAM to judge the spread.

Source: [Footprint and handprint KPIs JSON](https://github.com/Khashiiiiiii/lindstrom-valuelens/issues/5).
