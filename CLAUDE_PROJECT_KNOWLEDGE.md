# Cliniconex Marketing Intelligence Center — Project Knowledge

## What This Is
A multi-agent AI system for revenue forecasting and marketing campaign optimization at Cliniconex. Built in Python, it connects to ActiveCampaign CRM and Google Ads to track the marketing funnel, calculate leads needed to hit revenue targets, and monitor campaign performance.

## Architecture
```
main.py (CLI orchestrator — Click + Rich)
├── agents/data_connector/activecampaign.py  — ActiveCampaign API v3
├── agents/data_connector/google_ads.py      — Google Ads REST API v17
├── agents/data_connector/base_connector.py  — Abstract base (caching, retries, rate limits)
├── agents/revenue_analyst/calculator.py     — Reverse math: revenue target → leads needed
├── agents/strategic_advisor/campaign_analyzer.py — Campaign analysis + 3-tier recommendations
├── agents/automation_engine/executor.py     — Google Ads automation with safety controls
└── agents/dashboard/web_app.py              — Flask premium web dashboard (port 8080)
```

## CLI Commands
- `python main.py dashboard` — Full revenue intelligence dashboard
- `python main.py test-connection` — Verify API connectivity
- `python main.py analyze --start-date YYYY-MM-DD --end-date YYYY-MM-DD` — Date range analysis
- `python main.py serve --port 8080 --mode sexy` — Launch web dashboard

## Key Business Numbers
- **Annual target:** $9M ($2.25M/quarter)
- **Primary pipeline:** Prospect Demand Pipeline (ActiveCampaign ID: 1)
- **Pipeline stages:** Contact Created → Contact Engaged → MQL/PQM → HIRO (Target > 25%)
- **Current pipeline value:** ~$4.8M (marketing pipeline only, filtered from $13.7M total)
- **Average deal size:** $1,200 LTV
- **CPA thresholds:** Excellent ≤$75 | Warning ≤$200 | Critical >$300

## ActiveCampaign Pipelines
1. **Pipeline 1** — Prospect Demand Pipeline (PRIMARY — marketing funnel)
6. Pipeline 6 — Contact Deals-UTM Term
8. Pipeline 8 — Partner Demand Pipeline
9. Pipeline 9 — Partner Opportunity Pipeline
15. Pipeline 15 — Prospect Opportunity Pipeline

All dashboard data is filtered to Pipeline 1 only. Config in `config/thresholds.yaml`.

## API Connections
- **ActiveCampaign:** CONNECTED — api_url: cliniconexmarketing.api-us1.com
- **Google Ads:** NOT YET CONNECTED — refresh_token is placeholder, needs OAuth setup via generate_token.py

## Important Technical Notes
- AC API uses `filters[group]` for pipeline filtering (NOT `filters[d_groupid]` — that silently returns unfiltered results)
- Never use demo/fake/mock data — always real API calls or empty results with status flags
- Pipeline stages for Pipeline 1 return from `get_pipeline_stages(pipeline_id=1)`
- Contacts are date-filtered by quarter using `fetch_contacts_by_date(start, end)`
- Revenue Calculator's `analyze_funnel()` accepts optional `pipeline_stages` param for stage-based classification

## Configuration Files
- `config/credentials.yaml` — API keys (gitignored, template at credentials.yaml.example)
- `config/thresholds.yaml` — Revenue targets, CPA thresholds, conversion rates, budget limits, pipeline config

## Web Dashboard Design
- **Font:** Nunito Sans (300, 400, 600, 700, 800)
- **Brand colors:** Green #ADC837→#C6DC65, Teal #02475A, Cyan #029FB5, Purple #522E76
- **Features:** Dark/light mode, glassmorphism, Chart.js charts, animated counters, sortable tables, sparklines, keyboard shortcuts, CSV export, 30s auto-refresh

## Dependencies
Python 3.12, Flask 3.0, Click 8.1, Rich 13.7, PyYAML 6.0, Requests 2.31, google-auth-oauthlib 1.2, Anthropic SDK 0.8

## Development Status (as of March 2026)
- **Phase 1 (Data):** ✅ Complete — All connectors built and tested
- **Phase 2 (Intelligence):** ✅ Complete — Revenue calculator, strategic advisor, dashboard
- **Phase 3 (Automation):** 🟡 Started — Engine built, not yet wired to CLI
- **Phase 4 (Prediction):** ❌ Not started — Predictive forecasting, scheduled reports
