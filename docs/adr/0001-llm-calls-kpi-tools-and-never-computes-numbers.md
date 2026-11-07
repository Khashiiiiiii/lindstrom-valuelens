# The LLM calls KPI tools and never computes a number

Every KPI, opportunity signal, period comparison and account health rating is a parameterised calculation over Customer, Site, product, period, baseline and `compare_to`. The app exposes each one as a tool the LLM calls. The LLM picks tools and words the answer, but every figure it shows comes from a tool result. We chose this over letting the LLM read the data and calculate, because a review figure the Customer decision-maker sees must be reproducible and must carry its data status, assumptions and caveats.

## Consequences

- When no tool covers a question, the LLM says the data does not hold it. For example, it answers a cost question with "the catalogue has no cost data" and never estimates a euro figure.
- Each catalogue entry records its view, so a tool result can be withheld in the Customer view (see ADR 0011).

Source: [Map: Excel to JSON data layer for ValueLens](https://github.com/Khashiiiiiii/lindstrom-valuelens/issues/1), Notes.
