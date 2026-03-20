# Marketing Intelligence Center — Deployment Guide

## Sevalla Deployment (Python REST API)

The Flask app serves both the HTML dashboard and the ToolHub JSON API.

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `TOOLHUB_SERVICE_TOKEN` | Yes | Random 64-char secret shared with ToolHub. Used for `X-Service-Token` header auth on `/api/*` routes. |
| `TOOLHUB_ORIGIN` | Yes | ToolHub's production URL for CORS (e.g., `https://toolhub.cliniconex.com`) |
| `PORT` | Auto | Injected by Sevalla at runtime |
| `ACTIVECAMPAIGN_API_URL` | Yes | ActiveCampaign account API URL |
| `ACTIVECAMPAIGN_API_KEY` | Yes | ActiveCampaign API key |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | No | Google Ads developer token |
| `GOOGLE_ADS_CLIENT_ID` | No | Google Ads OAuth client ID |
| `GOOGLE_ADS_CLIENT_SECRET` | No | Google Ads OAuth client secret |
| `GOOGLE_ADS_REFRESH_TOKEN` | No | Google Ads OAuth refresh token |
| `GOOGLE_ADS_CUSTOMER_ID` | No | Google Ads customer ID |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | No | Google Ads MCC login customer ID |

### API Endpoints

| Route | Method | Auth | Description |
|---|---|---|---|
| `/api/health` | GET | None | Health check for Sevalla |
| `/api/dashboard` | GET | Service Token | Full dashboard data as JSON |
| `/api/forecast` | GET | Service Token | Monte Carlo forecast + attainment |
| `/api/campaigns` | GET | Service Token | Google Ads campaign list |
| `/api/automate` | POST | Service Token | Run automation recommendations |
| `/api/rollback` | POST | Service Token | Rollback last automation action |
| `/api/automation-log` | GET | Service Token | Execution log entries |

### Authentication

All routes except `/api/health` require the `X-Service-Token` header with the value matching `TOOLHUB_SERVICE_TOKEN`.

### Procfile

```
web: python main.py serve --port $PORT --mode sexy
```

## ToolHub Bundle

The React bundle in `toolhub-bundle/` is built and registered separately.

### Build-Time Variables

| Variable | Description |
|---|---|
| `VITE_API_BASE_URL` | The Python API's Sevalla URL (e.g., `https://marketing-api.sevalla.app`) |
| `VITE_SERVICE_TOKEN` | Same 64-char secret as `TOOLHUB_SERVICE_TOKEN` |

### GitHub Secrets (for CI/CD)

| Secret | Description |
|---|---|
| `VITE_API_BASE_URL` | Python API URL |
| `VITE_SERVICE_TOKEN` | Service token |
| `TOOLHUB_DB_URL` | ToolHub PostgreSQL connection string |

### Commands

```bash
cd toolhub-bundle
pnpm install
pnpm build        # Produces dist/marketing-intelligence.js
pnpm register     # Upserts bundle into ToolHub DB
```
