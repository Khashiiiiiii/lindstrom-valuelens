# Industry only sets default Customer priorities

The brief suggests Industry KPIs, but every Core KPI can be computed for every Customer, and KPIs filtered to an industry's garments come out close to the Customer total (NorthStar on-time share 98.1% for the Food Industry Coat against 98.3% for all products). We decided that no KPI is an Industry KPI. Industry never hides a KPI and never changes the evidence area order. It only sets the default Customer priorities, which pick the first-screen priority blocks and rank the opportunity signals.

The default order comes from the Customer's own `priority_topics`, in sheet order. The Industry_Priorities ranking applies only to a Customer with no `priority_topics`. We put the Customer's topics first because the two sources disagree: NorthStar's industry ranks "Hygiene and compliance" first, while NorthStar's own topics start with "Water efficiency".

## Consequences

- Every source term maps to one of 7 fixed Customer priorities, each with a KPI set. Hygiene, Safety and Compliance have no data and map to none, so they drop out of the defaults and show as data gaps.
- Industry reaches the data only as product presets (for example "Food industry garments" for P1004), which are parameter values, not KPIs.
- Industry has no effect on account health.
- The `core_or_industry` field reads "Core KPI" on every entry until the term "Industry KPI" is kept or retired.

Source: [Customer priorities JSON](https://github.com/Khashiiiiiii/lindstrom-valuelens/issues/7).
