# Account health is a worst-of rating shown to the KAM only

Account health rates a Customer green, amber or red from 3 inputs: on-time service cycle share, service requests per 100 wearers per month, and scan coverage. The rating is the worst input rating and names every amber or red input, because averaging would let one weak area hide behind two good ones. The thresholds are `TEAM_ASSUMPTION` values set at about 2 times the 2025 synthetic spread, since no public benchmark exists. Because the thresholds are invented, the rating is shown in the KAM view only, never in the Customer view or the exported review.

## Consequences

- A Customer is rated from its own aggregate KPIs, never by rolling up Site ratings.
- Service requests per 100 wearers is a Customer-only input. Every Site raises 14 to 38 requests a year whatever its size, so at Site grain the rate mostly measures Site size. A Site is rated on on-time share and scan coverage only.
- An input under its minimum volume is "not rated" and drops out, and the rating shows "based on n of m inputs". With no rated input the rating is "not rated", never green.
- Footprint, handprint, repair rate and circularity KPIs are not inputs, because the laundry grid, the chosen baseline or the product mix sets them.
- Customer priorities and industry have no effect on the rating.

Source: [Account health JSON](https://github.com/Khashiiiiiii/lindstrom-valuelens/issues/9).
