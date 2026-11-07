# Opportunity signals compare a Site only with the same Customer's other Sites

The 3 Customers have different product mixes (Mediora has only Work Trouser and Healthcare Tunic), so Sites of different Customers do not compare like-for-like, and no public benchmark exists. An opportunity signal therefore compares a Site, or one product at a Site, with the median of the same Customer's other Sites, for the same product where the signal is by product. A Site needs at least 3 peers, or it is "not evaluated". Rules are one-sided: a signal fires only when a Site is worse than its peers, measured as the relative gap from the peer median.

## Considered options

- Comparing against other Customers' Sites. Rejected because the product mix differs.
- Customer-level signals. Rejected because the Customer-level view against fixed thresholds is account health (ADR 0009).
- Best-practice signals that flag a Site doing better. Rejected to keep each signal tied to a lever.
- A "Site got worse over time" signal. Rejected: that is a period comparison and stays separate (ADR 0010).

## Consequences

- Each threshold and minimum volume is a `TEAM_ASSUMPTION` override parameter, set at roughly the top 10 to 20% of the 2025 synthetic spread.
- No signal may claim that a change extends garment life, since the data has no retirement records. No signal returns a euro amount.
- No signal reads a figure the Customer cannot change, such as recycled or reused share or emissions per washed kg.
- Fired signals rank by the position of their highest matching Customer priority, then by relative gap.

Source: [Opportunity signals JSON](https://github.com/Khashiiiiiii/lindstrom-valuelens/issues/8).
