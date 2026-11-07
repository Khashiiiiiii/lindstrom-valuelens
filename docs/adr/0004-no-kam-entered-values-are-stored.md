# The project stores no KAM-entered values

CSAT, NPS, contract SLA targets, issue logs and agreed actions have no source in the workbook. We chose not to let the KAM type them in for this effort. Every number the dashboard shows comes from a calculation over the workbook, and data with no source is shown as a data gap. This keeps the data layer read-only and avoids a store, an edit flow and a trust question about typed-in figures. KAM-entered KPIs are a candidate for a later effort, after a discussion with the challenge contact.

## Consequences

- Customer priorities default from the workbook. A user override in a prompt, selector or setting is a session input and is not saved.
- Account health and the Improvement area are built from calculated KPIs only. No contract target feeds them, and the 120-hour on-time limit comes from the synthetic data, not a contract.
- Proposed next steps come only from the levers of fired opportunity signals. Their owner is the signal's lever owner, and they have no date. The review marks them "proposed, to be agreed in the meeting".
- Customer Experience (CSAT, NPS) appears as a data gap beside account health and in Data transparency. Lindström's public group CSAT of 4.3 and NPS of 37.1 never stand in for a Customer's own values.

Source: [Map: Excel to JSON data layer for ValueLens](https://github.com/Khashiiiiiii/lindstrom-valuelens/issues/1), archived note 05.
