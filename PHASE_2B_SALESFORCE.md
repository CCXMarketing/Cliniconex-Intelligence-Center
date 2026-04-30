# CIC Phase 2B: Salesforce Integration — Kickoff Brief

## Status: Blocked on field gap resolution

Salesforce integration is the next data-source phase after ActiveCampaign deepening (Phase 2A). The Worker `/salesforce/*` route stub exists and returns 501 Not Implemented. This document captures the field gaps that must be resolved before engineering work begins.

## Field gaps to resolve

These fields need to exist and be consistently populated in Salesforce before the corresponding CIC KPI cards can switch to live SF data.

### Opportunity object

| Field | Type | Values | Needed by KPI |
|---|---|---|---|
| Channel Type | Picklist | Reseller, Marketplace, ISV, SI, Direct | Non-Reseller Deals, Direct-Channel Pipeline % |
| Adjacent Vertical | Picklist | Cosmetics, Nutrition, Fitness, etc. | Adjacent Vertical Deals |
| Referral Source | Picklist | Customer, Partner, Event, Content, Outbound, Other | Referral-Influenced Closed Won % |
| Product Revenue Tag | Multi-select | ACM Messenger, ACS Scheduler, AI Skills, etc. | AI-Specific Revenue, Enhancement Revenue |

### Case object

| Field | Type | Values | Needed by KPI |
|---|---|---|---|
| First Contact Resolution | Checkbox | true/false | First-Contact Resolution Rate |
| Escalation Tier | Picklist | Tier 1, Tier 2, Tier 3, Engineering | Escalation Rate |

### Workflow gaps

| Workflow | Description | Needed by KPI |
|---|---|---|
| Escalation tracking | Auto-set escalation tier on case reassignment | Escalation Rate |
| Post-ticket survey | Trigger survey on case close, capture CES score | CES (Support) |
| Implementation milestones | Track API access date, go-live date per account | Time-to-Value |

## Owners

| Gap | Owner | Target date |
|---|---|---|
| Channel Type field | Zach + Bex | TBD |
| Adjacent Vertical tags | Zach | TBD |
| Referral Source field | Cathy | TBD |
| Product Revenue tagging | Kristi + Madison | TBD |
| FCR field on Case | Cathy | TBD |
| Escalation workflow | Cathy | TBD |
| Post-ticket survey | Cathy | TBD |
| Implementation milestones | Cathy | TBD |

## SF Connected App requirements

Once field gaps are resolved, engineering needs:

1. **SF Connected App** — OAuth 2.0 Web Server Flow, scoped to read-only API access
2. **Worker Secret:** `SF_CLIENT_ID`, `SF_CLIENT_SECRET`, `SF_REFRESH_TOKEN`
3. **SOQL queries** per KPI — designed after field schema is finalized
4. **Worker `/salesforce/*` route** — upgrade from 501 stub to full proxy with auth + CORS

## CIC KPIs gated on Salesforce

| Module | KPI | Current state |
|---|---|---|
| Direct Sales | New MRR Added (Total) | Mock + Manual |
| Direct Sales | Expansion Revenue | Mock |
| Direct Sales | New Logo Revenue | Mock |
| Direct Sales | New Segment Bookings | Mock |
| Direct Sales | Average Deal Size (ACV) | Mock |
| Direct Sales | Pipeline Coverage Ratio | Mock |
| Channel Partnerships | Revenue by Partner | Mock |
| Channel Partnerships | MxC Revenue Ramp | Mock |
| Channel Partnerships | Senior Living Partner Revenue | Mock |
| Customer Success | Gross Retention Rate | Mock |
| Customer Success | NRR | Mock |
| Customer Success | Churn Revenue | Mock |
| Customer Success | Health Score Distribution | Mock |
| Customer Success | At-Risk Account Value | Mock |
| Product | AI-Specific Revenue | Not Yet |
| Product | Enhancement Revenue (Existing) | Not Yet |
| Product | Enhancement Revenue (New Segments) | Not Yet |

17 KPIs across 4 modules depend on Salesforce data. Resolving the field gaps is the critical path.
