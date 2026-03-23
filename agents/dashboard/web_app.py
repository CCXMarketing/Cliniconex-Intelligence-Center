"""
Cliniconex Marketing Intelligence Center — Web Dashboard Server

Flask-based premium dashboard with real-time data from all agents.
All data comes from live connectors — no demo/fake data.
"""

import csv
import io
import json
import logging
import os
from datetime import datetime, timedelta
from pathlib import Path

from flask import Flask, jsonify, render_template, request, Response
from flask_cors import CORS

logger = logging.getLogger(__name__)

# ── Paths ───────────────────────────────────────────────────────────────────

BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent.parent
CONFIG_DIR = PROJECT_DIR / "config"

# ── Configuration helpers ───────────────────────────────────────────────────


def _load_yaml(filename: str) -> dict:
    """Load a YAML config file, returning empty dict on failure."""
    import yaml

    path = CONFIG_DIR / filename
    if not path.exists():
        logger.warning("Config file not found: %s", path)
        return {}
    with open(path, "r") as f:
        return yaml.safe_load(f) or {}


def _load_credentials() -> dict:
    """Load credentials from yaml file (local) or environment variables (Sevalla)."""
    import os

    # Try yaml file first (local development)
    yaml_creds = _load_yaml("credentials.yaml")
    if yaml_creds:
        return yaml_creds

    # Fall back to environment variables (Sevalla production)
    return {
        "activecampaign": {
            "api_url": os.environ.get("AC_API_URL", ""),
            "api_key": os.environ.get("AC_API_KEY", ""),
        },
        "google_ads": {
            "developer_token": os.environ.get("GOOGLE_ADS_DEVELOPER_TOKEN", ""),
            "client_id": os.environ.get("GOOGLE_ADS_CLIENT_ID", ""),
            "client_secret": os.environ.get("GOOGLE_ADS_CLIENT_SECRET", ""),
            "refresh_token": os.environ.get("GOOGLE_ADS_REFRESH_TOKEN", ""),
            "customer_id": os.environ.get("GOOGLE_ADS_CUSTOMER_ID", ""),
            "login_customer_id": os.environ.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID", ""),
        },
        "anthropic": {
            "api_key": os.environ.get("ANTHROPIC_API_KEY", ""),
        },
        "gemini": {
            "api_key": os.environ.get("GEMINI_API_KEY", ""),
        },
    }


def _load_thresholds() -> dict:
    """Load thresholds config, return defaults if file missing."""
    thresholds = _load_yaml("thresholds.yaml")
    if not thresholds:
        return {
            "activecampaign": {"primary_pipeline_id": 1, "pipeline_name": "Prospect Demand Pipeline"},
            "revenue": {"annual_target": 9000000,
                        "q1_target": 2250000, "q2_target": 2250000,
                        "q3_target": 2250000, "q4_target": 2250000},
            "cpa": {"excellent": 75, "warning": 200, "critical": 300},
            "deal_size": {"average": 1200},
            "conversion_rates": {"contact_to_demo": 0.25,
                                 "demo_to_deal": 0.35, "deal_to_won": 0.15},
        }
    return thresholds


# ── Quarter helpers ─────────────────────────────────────────────────────────


def _current_quarter() -> str:
    month = datetime.now().month
    return f"Q{(month - 1) // 3 + 1}"


def _quarter_dates(quarter: str, year: int | None = None):
    year = year or datetime.now().year
    starts = {"Q1": 1, "Q2": 4, "Q3": 7, "Q4": 10}
    start_month = starts[quarter.upper()]
    start = datetime(year, start_month, 1)
    if start_month + 3 > 12:
        end = datetime(year + 1, 1, 1) - timedelta(days=1)
    else:
        end = datetime(year, start_month + 3, 1) - timedelta(days=1)
    return start, end


def _days_remaining_in_quarter() -> int:
    q = _current_quarter()
    _, end = _quarter_dates(q)
    return max((end - datetime.now()).days, 0)


def _pipeline_config(thresholds: dict) -> dict:
    """Extract ActiveCampaign pipeline configuration from thresholds."""
    ac_cfg = thresholds.get("activecampaign", {})
    return {
        "pipeline_id": ac_cfg.get("primary_pipeline_id"),
        "pipeline_name": ac_cfg.get("pipeline_name", "All Pipelines"),
    }


# ── Connector factories ────────────────────────────────────────────────────


def _build_activecampaign(creds: dict):
    from agents.data_connector.activecampaign import ActiveCampaignConnector

    ac = creds.get("activecampaign", {})
    if not ac.get("api_url") or not ac.get("api_key"):
        return None
    return ActiveCampaignConnector(api_url=ac["api_url"], api_key=ac["api_key"])


def _build_google_ads(creds: dict):
    from agents.data_connector.google_ads import GoogleAdsConnector

    ga = creds.get("google_ads", {})
    required = [
        "developer_token",
        "client_id",
        "client_secret",
        "refresh_token",
        "customer_id",
        "login_customer_id",
    ]
    if not all(ga.get(k) for k in required):
        return None
    # Skip if placeholder credentials
    if ga.get("refresh_token", "").startswith("PLACEHOLDER"):
        return None
    return GoogleAdsConnector(
        developer_token=ga["developer_token"],
        client_id=ga["client_id"],
        client_secret=ga["client_secret"],
        refresh_token=ga["refresh_token"],
        customer_id=ga["customer_id"],
        login_customer_id=ga["login_customer_id"],
    )


# ── Live data fetcher ──────────────────────────────────────────────────────


def _fetch_ac_data(
    creds: dict,
    pipeline_id: int | None = None,
) -> dict:
    """Fetch contacts (with deals) and deals from ActiveCampaign.

    Args:
        creds: Credentials dict.
        pipeline_id: If set, filter deals to this pipeline only.

    Returns dict with keys: connected, contacts, deals, pipeline_stages.
    """
    result = {
        "connected": False,
        "contacts": [],
        "deals": [],
        "pipeline_stages": [],
        "error": None,
    }
    try:
        ac = _build_activecampaign(creds)
        if ac and ac.test_connection():
            result["connected"] = True

            # Contacts — fetch contacts with active deals in the pipeline
            # (replaces date-filtered fetch; we want contacts in the funnel,
            #  not contacts created in a date range)
            result["contacts"] = ac.fetch_contacts_with_deals(
                pipeline_id=pipeline_id, limit=5000,
            )

            # Deals — pipeline-filtered if ID provided
            if pipeline_id is not None:
                result["deals"] = ac.fetch_deals_by_pipeline(
                    pipeline_id, limit=1000
                )
                try:
                    result["pipeline_stages"] = ac.get_pipeline_stages(
                        pipeline_id
                    )
                except Exception:
                    pass
            else:
                result["deals"] = ac.fetch_deals(limit=1000)
                try:
                    result["pipeline_stages"] = ac.get_pipeline_stages()
                except Exception:
                    pass
    except Exception as e:
        result["error"] = str(e)
        logger.warning("ActiveCampaign error: %s", e)
    return result


def _fetch_gads_data(creds: dict, start_date, end_date) -> dict:
    """Fetch campaigns and metrics from Google Ads.

    Returns dict with keys: connected, campaigns, metrics.
    """
    result = {
        "connected": False,
        "campaigns": [],
        "metrics": {},
        "error": None,
    }
    try:
        gads = _build_google_ads(creds)
        if gads and gads.test_connection():
            result["connected"] = True
            result["campaigns"] = gads.fetch_campaigns(start_date, end_date)
            result["metrics"] = gads.fetch_performance_metrics(start_date, end_date)
    except Exception as e:
        result["error"] = str(e)
        logger.debug("Google Ads unavailable: %s", e)
    return result


# ── Deal-to-campaign adapter ───────────────────────────────────────────────


def _deals_to_campaign_rows(deals: list, stages: list) -> list:
    """Convert ActiveCampaign deals into campaign-table-compatible rows.

    Groups deals by pipeline stage so each stage becomes a row in the
    campaign performance table.
    """
    # Build stage-name lookup
    stage_map = {}
    for s in stages:
        stage_map[str(s.get("id", ""))] = s.get("title", f"Stage {s.get('id')}")

    # Group deals by stage
    stage_groups: dict[str, list] = {}
    for deal in deals:
        sid = str(deal.get("stage", deal.get("dealStage", "unknown")))
        stage_groups.setdefault(sid, []).append(deal)

    rows = []
    for sid, group in stage_groups.items():
        total_value = sum(float(d.get("value", 0)) for d in group)
        deal_count = len(group)
        won_count = sum(
            1 for d in group if str(d.get("status", "")) == "1"
        )
        avg_value = total_value / deal_count if deal_count else 0
        stage_name = stage_map.get(sid, f"Pipeline Stage {sid}")

        rows.append(
            {
                "id": f"stage-{sid}",
                "name": stage_name,
                "status": "ENABLED",
                "impressions": 0,
                "clicks": deal_count,
                "conversions": won_count,
                "cost": round(total_value, 2),
                "cpa": round(avg_value, 2),
                "ctr": 0,
                "conversion_rate": round(
                    won_count / deal_count * 100 if deal_count else 0, 2
                ),
                "cpa_status": "none",
            }
        )

    # If no stage grouping worked, show individual deals
    if not rows and deals:
        for deal in deals:
            value = float(deal.get("value", 0))
            status_code = str(deal.get("status", "0"))
            rows.append(
                {
                    "id": deal.get("id", ""),
                    "name": deal.get("title", f"Deal #{deal.get('id', '?')}"),
                    "ac_url": deal.get("ac_url", ""),
                    "status": "ENABLED" if status_code in ("0", "1") else "PAUSED",
                    "impressions": 0,
                    "clicks": 0,
                    "conversions": 1 if status_code == "1" else 0,
                    "cost": round(value, 2),
                    "cpa": round(value, 2) if status_code == "1" else 0,
                    "ctr": 0,
                    "conversion_rate": 100.0 if status_code == "1" else 0,
                    "cpa_status": "none",
                }
            )

    return rows


# ── Trend data from real deal history ──────────────────────────────────────


def _build_trend_from_deals(deals: list) -> list:
    """Build daily trend data from deal creation/modification dates."""
    if not deals:
        return []

    # Parse deal dates and group by day
    daily: dict[str, dict] = {}
    for deal in deals:
        date_str = deal.get("cdate") or deal.get("mdate") or deal.get("created_timestamp")
        if not date_str:
            continue
        try:
            dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
            day_key = dt.strftime("%Y-%m-%d")
        except (ValueError, TypeError):
            # Try simpler parse
            try:
                dt = datetime.strptime(str(date_str)[:10], "%Y-%m-%d")
                day_key = dt.strftime("%Y-%m-%d")
            except (ValueError, TypeError):
                continue

        if day_key not in daily:
            daily[day_key] = {
                "date": day_key,
                "deal_count": 0,
                "total_value": 0,
                "won_count": 0,
            }
        daily[day_key]["deal_count"] += 1
        daily[day_key]["total_value"] += float(deal.get("value", 0))
        if str(deal.get("status", "")) == "1":
            daily[day_key]["won_count"] += 1

    if not daily:
        return []

    # Sort by date and convert to trend format
    sorted_days = sorted(daily.values(), key=lambda d: d["date"])
    cumulative_value = 0
    trend = []
    for day in sorted_days:
        cumulative_value += day["total_value"]
        deal_count = day["deal_count"]
        won_count = day["won_count"]
        total_value = day["total_value"]
        avg_value = total_value / deal_count if deal_count else 0

        dt = datetime.strptime(day["date"], "%Y-%m-%d")
        trend.append(
            {
                "date": day["date"],
                "label": dt.strftime("%b %d"),
                "spend": round(total_value, 2),
                "cumulative_spend": round(cumulative_value, 2),
                "clicks": deal_count,
                "conversions": won_count,
                "impressions": deal_count,
                "cpa": round(avg_value, 2),
                "ctr": round(won_count / deal_count * 100 if deal_count else 0, 2),
                "conversion_rate": round(
                    won_count / deal_count * 100 if deal_count else 0, 2
                ),
            }
        )

    return trend


# ── Time Intelligence CSS ──────────────────────────────────────────────────

_TIME_INTELLIGENCE_CSS = """\
/* Time Intelligence Bar */
.time-intelligence-bar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 16px;
    padding: 12px 20px;
    background: var(--lgrey-100, #F4F4F4);
    border-bottom: 1px solid var(--neutral-300, #D1D5DB);
    border-radius: 8px;
    margin-bottom: 24px;
}

.time-presets {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
}

.time-preset,
.time-preset-gads {
    height: 28px;
    padding: 0 12px;
    border-radius: 14px;
    border: 1px solid var(--neutral-300, #D1D5DB);
    background: white;
    color: var(--dgrey-100, #404041);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
}

.time-preset:hover,
.time-preset-gads:hover {
    border-color: var(--green-100, #ADC837);
    background: rgba(173, 200, 55, 0.1);
}

.time-preset.active,
.time-preset-gads.active {
    background: var(--green-100, #ADC837);
    color: #404041;
    font-weight: 700;
    border-color: var(--green-100, #ADC837);
}

.time-comparison {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
}

.compare-label {
    font-size: 12px;
    color: var(--dgrey-100, #404041);
    font-weight: 500;
}

.time-comparison select {
    height: 28px;
    padding: 0 8px;
    border: 1px solid var(--neutral-300, #D1D5DB);
    border-radius: 6px;
    font-size: 12px;
    background: white;
    color: var(--dgrey-100, #404041);
    cursor: pointer;
}

.time-active-period {
    font-size: 12px;
    color: var(--dgrey-100, #404041);
    opacity: 0.7;
    white-space: nowrap;
}

/* Dashboard Sections */
.dashboard-section {
    background: var(--card-bg, white);
    border-radius: 12px;
    border: 1px solid var(--neutral-200, #E5E7EB);
    margin-bottom: 24px;
    overflow: hidden;
    transition: box-shadow 0.2s ease;
}

.dashboard-section:hover {
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

.dashboard-section .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--neutral-200, #E5E7EB);
}

.dashboard-section .section-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 16px;
    font-weight: 700;
    color: var(--dgrey-100, #404041);
    margin: 0;
}

.section-icon {
    font-size: 18px;
}

.section-actions {
    display: flex;
    align-items: center;
    gap: 8px;
}

.section-badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 10px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.section-badge.live {
    background: rgba(173, 200, 55, 0.15);
    color: #7A9A00;
}

.section-body {
    padding: 20px;
    min-height: 120px;
}

.section-loading {
    padding: 20px;
}

.section-loading.hidden,
.section-error.hidden {
    display: none;
}

.skeleton-loader {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.skeleton-loader::before,
.skeleton-loader::after {
    content: '';
    display: block;
    height: 16px;
    border-radius: 4px;
    background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
    background-size: 200% 100%;
    animation: skeleton-shimmer 1.5s infinite;
}

.skeleton-loader::after {
    width: 60%;
}

@keyframes skeleton-shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
}

.section-error {
    padding: 16px 20px;
    background: rgba(239, 68, 68, 0.05);
    border-top: 1px solid rgba(239, 68, 68, 0.1);
}

.error-msg {
    color: var(--error, #EF4444);
    font-size: 13px;
}

/* Delta Badge */
.delta-badge {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    font-size: 12px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.04);
}

/* Responsive */
@media (max-width: 768px) {
    .time-intelligence-bar {
        flex-direction: column;
        align-items: flex-start;
    }
    .time-comparison {
        margin-left: 0;
    }
    .time-presets {
        width: 100%;
    }
}
"""


# ── Flask app factory ───────────────────────────────────────────────────────


def create_app() -> Flask:
    """Create and configure the Flask dashboard application."""
    app = Flask(
        __name__,
        template_folder=str(BASE_DIR / "templates"),
        static_folder=str(BASE_DIR / "static"),
    )
    app.config["SECRET_KEY"] = "mic-dashboard-secret"

    # CORS — ToolHub-aware configuration
    toolhub_origin = os.environ.get("TOOLHUB_ORIGIN", "https://toolhub.cliniconex.com")
    CORS(app, resources={
        r"/api/*": {
            "origins": [toolhub_origin],
            "methods": ["GET", "POST", "OPTIONS"],
            "allow_headers": ["Content-Type", "X-Service-Token"],
            "supports_credentials": False,
        }
    })

    # Register ToolHub REST API blueprint
    from agents.dashboard.api import api_bp
    app.register_blueprint(api_bp)

    # ── Main page ───────────────────────────────────────────────────────

    @app.route("/")
    def index():
        return render_template("index.html")

    # ── API: Hero metrics ───────────────────────────────────────────────

    @app.route("/api/metrics")
    def api_metrics():
        thresholds = _load_thresholds()
        creds = _load_credentials()
        pcfg = _pipeline_config(thresholds)

        # Pipeline selector — accept ?pipeline_id= or default to thresholds
        pipeline_id = request.args.get("pipeline_id", type=int)
        if pipeline_id is None:
            pipeline_id = pcfg["pipeline_id"]

        quarter = _current_quarter()
        quarter_key = f"{quarter.lower()}_target"
        revenue_target = thresholds.get("revenue", {}).get(quarter_key, 0)
        q_start, q_end = _quarter_dates(quarter)
        days_left = _days_remaining_in_quarter()

        # Fetch live data filtered to pipeline
        ac = _fetch_ac_data(creds, pipeline_id=pipeline_id)
        ac_connected = ac["connected"]
        contacts_count = len(ac["contacts"])
        deals_count = len(ac["deals"])
        pipeline_value = sum(float(d.get("value", 0)) for d in ac["deals"])

        # Currency split
        currency_buckets: dict[str, float] = {}
        for d in ac["deals"]:
            cur = d.get("currency", "usd").lower()
            currency_buckets[cur] = currency_buckets.get(cur, 0.0) + float(d.get("value", 0))

        # Available pipelines for selector
        available_pipelines = []
        try:
            ac_conn = _build_activecampaign(creds)
            if ac_conn:
                available_pipelines = ac_conn.fetch_all_pipelines()
        except Exception:
            pass

        # Check Google Ads connectivity
        gads_connected = False
        try:
            gads = _build_google_ads(creds)
            if gads and gads.test_connection():
                gads_connected = True
        except Exception:
            pass

        # Revenue calculations (same logic as CLI main.py)
        try:
            from agents.revenue_analyst.calculator import RevenueCalculator

            avg_deal = thresholds.get("deal_size", {}).get("average", 1200)
            calc = RevenueCalculator(default_avg_deal_size=avg_deal)

            gap = calc.calculate_gap(
                target=revenue_target,
                current=pipeline_value,
                time_remaining=days_left,
            )
            leads = calc.calculate_leads_needed(
                revenue_target=revenue_target - pipeline_value,
                conversion_rates=thresholds.get("conversion_rates"),
            )
        except Exception as e:
            logger.warning("RevenueCalculator error: %s", e)
            pct = (pipeline_value / revenue_target * 100) if revenue_target else 0
            gap = {
                "pct_complete": pct,
                "on_track": pct >= 60,
                "required_daily_pace": (revenue_target - pipeline_value) / max(days_left, 1),
            }
            leads = {"contacts_needed": 0}

        pct = gap.get("pct_complete", 0)
        if pct >= 90:
            status = "on_track"
        elif pct >= 60:
            status = "monitor"
        else:
            status = "behind"

        # Resolve pipeline name from available pipelines or config
        pipeline_name = pcfg["pipeline_name"]
        for p in available_pipelines:
            if p["id"] == pipeline_id:
                pipeline_name = p["title"]
                break

        return jsonify(
            {
                "quarter": quarter,
                "date_range": {
                    "start": q_start.strftime("%Y-%m-%d"),
                    "end": q_end.strftime("%Y-%m-%d"),
                },
                "pipeline": {
                    "id": pipeline_id,
                    "name": pipeline_name,
                },
                "revenue_target": revenue_target,
                "pipeline_value": round(pipeline_value, 2),
                "pipeline_value_by_currency": {
                    k: round(v, 2) for k, v in currency_buckets.items()
                },
                "pct_complete": round(pct, 1),
                "status": status,
                "days_remaining": days_left,
                "leads_needed": leads.get("contacts_needed", 0),
                "daily_pace": round(gap.get("required_daily_pace", 0), 2),
                "contacts": contacts_count,
                "deals": deals_count,
                "connections": {
                    "activecampaign": ac_connected,
                    "google_ads": gads_connected,
                },
                "available_pipelines": available_pipelines,
                "last_updated": datetime.now().isoformat(),
            }
        )

    # ── API: Funnel data ────────────────────────────────────────────────

    @app.route("/api/funnel")
    def api_funnel():
        thresholds = _load_thresholds()
        creds = _load_credentials()
        pcfg = _pipeline_config(thresholds)

        # Pipeline selector
        pipeline_id = request.args.get("pipeline_id", type=int)
        if pipeline_id is None:
            pipeline_id = pcfg["pipeline_id"]

        # Fetch live data filtered to pipeline
        ac = _fetch_ac_data(creds, pipeline_id=pipeline_id)
        contacts = ac["contacts"]
        deals = ac["deals"]
        pipeline_stages = ac["pipeline_stages"]
        ac_connected = ac["connected"]

        # Resolve pipeline name
        pipeline_name = pcfg["pipeline_name"]
        try:
            ac_conn = _build_activecampaign(creds)
            if ac_conn:
                for p in ac_conn.fetch_all_pipelines():
                    if p["id"] == pipeline_id:
                        pipeline_name = p["title"]
                        break
        except Exception:
            pass

        # Analyze funnel (same logic as CLI main.py)
        try:
            from agents.revenue_analyst.calculator import RevenueCalculator

            avg_deal = thresholds.get("deal_size", {}).get("average", 1200)
            calc = RevenueCalculator(default_avg_deal_size=avg_deal)
            funnel = calc.analyze_funnel(contacts, deals, pipeline_stages)
        except Exception as e:
            logger.warning("Funnel analysis error: %s", e)
            funnel = {
                "stage_breakdown": [],
                "conversion_rates": {},
                "pipeline_value": sum(float(d.get("value", 0)) for d in deals),
                "avg_deal_size": 0,
            }

        # Attach deals to each stage for drill-down
        stage_deal_map: dict = {}
        for deal in deals:
            sid = str(deal.get("stage", ""))
            if sid not in stage_deal_map:
                stage_deal_map[sid] = []
            stage_deal_map[sid].append({
                "id": str(deal.get("id", "")),
                "title": deal.get("title", ""),
                "value": float(deal.get("value", 0)),
                "currency": deal.get("currency", "usd"),
                "status": int(deal.get("status", 0)),
                "created_date": deal.get("cdate", ""),
                "updated_date": deal.get("mdate", ""),
                "ac_url": deal.get("ac_url", ""),
            })
        for stage in funnel.get("stage_breakdown", []):
            sid = str(stage.get("stage_id", ""))
            stage["deals"] = stage_deal_map.get(sid, [])

        return jsonify(
            {
                "stages": funnel.get("stage_breakdown", []),
                "conversion_rates": funnel.get("conversion_rates", {}),
                "pipeline_value": funnel.get("pipeline_value", 0),
                "pipeline_value_by_currency": funnel.get("pipeline_value_by_currency", {}),
                "avg_deal_size": funnel.get("avg_deal_size", 0),
                "live_data": ac_connected,
                "pipeline_id": pipeline_id,
                "pipeline_name": pipeline_name,
            }
        )

    # ── API: Pipeline Health ─────────────────────────────────────────────

    @app.route("/api/pipeline-health")
    def api_pipeline_health():
        """Return pipeline health: stalled, overdue, healthy deals by stage."""
        thresholds = _load_thresholds()
        creds = _load_credentials()
        pcfg = _pipeline_config(thresholds)

        pipeline_id = request.args.get("pipeline_id", type=int)
        if pipeline_id is None:
            pipeline_id = pcfg["pipeline_id"]

        stall_days = thresholds.get(
            "pipeline_health", {}
        ).get("stall_warning_days", 14)

        try:
            ac = _build_activecampaign(creds)
            if not ac or not ac.test_connection():
                return jsonify({"error": "ActiveCampaign not connected"})

            health = ac.fetch_pipeline_health(
                pipeline_id=pipeline_id,
                stall_threshold_days=stall_days,
            )

            # Resolve pipeline name
            pipeline_name = pcfg["pipeline_name"]
            try:
                for p in ac.fetch_all_pipelines():
                    if p["id"] == pipeline_id:
                        pipeline_name = p["title"]
                        break
            except Exception:
                pass

            # Map fields to match charts.js renderPipelineHealth expectations
            return jsonify({
                "total_open": health.get("total_open_deals", 0),
                "total_open_value": health.get("total_open_value", 0),
                "health_score": round(
                    health.get("health_score", 0) * 100, 1
                ) if health.get("health_score", 0) <= 1 else health.get("health_score", 0),
                "at_risk_deals": health.get("stalled_deals", []),
                "healthy_deals": health.get("healthy_deals", []),
                "overdue_deals": health.get("overdue_deals", []),
                "stages": [
                    {
                        "name": s.get("stage_name", ""),
                        "stage_id": s.get("stage_id", ""),
                        "deal_count": s.get("deal_count", 0),
                        "total_value": s.get("total_value", 0),
                        "stalled_count": s.get("stalled_count", 0),
                        "is_stalled": s.get("stalled_count", 0) > 0,
                    }
                    for s in health.get("by_stage", [])
                ],
                "pipeline_id": pipeline_id,
                "pipeline_name": pipeline_name,
                "stall_threshold_days": stall_days,
                "as_of": datetime.now().isoformat(),
            })
        except Exception as e:
            logger.exception("Pipeline health error")
            return jsonify({"error": str(e)}), 500

    # ── API: Deal Velocity ───────────────────────────────────────────────

    @app.route("/api/velocity")
    def api_velocity():
        """Return deal velocity: avg time per stage with pipeline context."""
        thresholds = _load_thresholds()
        creds = _load_credentials()
        pcfg = _pipeline_config(thresholds)

        pipeline_id = request.args.get("pipeline_id", type=int)
        if pipeline_id is None:
            pipeline_id = pcfg["pipeline_id"]

        year = datetime.now().year
        start_date = request.args.get("start_date", f"{year}-01-01")
        end_date = request.args.get(
            "end_date", datetime.now().strftime("%Y-%m-%d")
        )

        try:
            start_dt = datetime.strptime(start_date, "%Y-%m-%d")
            end_dt = datetime.strptime(end_date, "%Y-%m-%d")
            days = max((end_dt - start_dt).days, 1)
        except ValueError:
            days = 90

        try:
            ac = _build_activecampaign(creds)
            if not ac or not ac.test_connection():
                return jsonify({"error": "ActiveCampaign not connected", "stages": []})

            velocity = ac.fetch_stage_velocity(
                pipeline_id=pipeline_id,
                days=days,
                use_real_history=False,
            )

            # Resolve pipeline name
            pipeline_name = pcfg["pipeline_name"]
            try:
                for p in ac.fetch_all_pipelines():
                    if p["id"] == pipeline_id:
                        pipeline_name = p["title"]
                        break
            except Exception:
                pass

            # Creation to close: sum of avg_days across all stages
            creation_to_close = sum(
                s.get("avg_days_in_stage", 0) for s in velocity
            )

            return jsonify({
                "stages": velocity,
                "pipeline_id": pipeline_id,
                "pipeline_name": pipeline_name,
                "creation_to_close_avg_days": round(creation_to_close, 1),
                "date_range": {
                    "start": start_date,
                    "end": end_date,
                    "days": days,
                },
                "as_of": datetime.now().isoformat(),
            })
        except Exception as e:
            logger.exception("Velocity error")
            return jsonify({"error": str(e), "stages": []}), 500

    # ── API: Contact Acquisition ─────────────────────────────────────────

    @app.route("/api/acquisition")
    def api_acquisition():
        """Return contact acquisition by source/medium/campaign."""
        thresholds = _load_thresholds()
        creds = _load_credentials()
        pcfg = _pipeline_config(thresholds)

        pipeline_id = request.args.get("pipeline_id", type=int)
        if pipeline_id is None:
            pipeline_id = pcfg["pipeline_id"]

        try:
            ac = _build_activecampaign(creds)
            if not ac or not ac.test_connection():
                return jsonify({
                    "error": "ActiveCampaign not connected",
                    "by_source": [], "by_medium": [], "campaigns": [],
                })

            contacts = ac.fetch_contacts_with_utm(pipeline_id=pipeline_id)

            # Aggregate by source / medium / campaign
            source_counts: dict = {}
            medium_counts: dict = {}
            campaign_details: dict = {}
            for c in contacts:
                src = (c.get("utm_source") or "unknown").lower()
                med = (c.get("utm_medium") or "unknown").lower()
                camp = c.get("utm_campaign") or "unknown"
                source_counts[src] = source_counts.get(src, 0) + 1
                medium_counts[med] = medium_counts.get(med, 0) + 1
                key = f"{camp}|{src}|{med}"
                if key not in campaign_details:
                    campaign_details[key] = {
                        "name": camp, "source": src, "medium": med, "count": 0,
                    }
                campaign_details[key]["count"] += 1

            total = len(contacts)
            by_source = sorted(
                [{"name": k, "count": v} for k, v in source_counts.items()],
                key=lambda x: x["count"], reverse=True,
            )
            by_medium = sorted(
                [{"name": k, "count": v} for k, v in medium_counts.items()],
                key=lambda x: x["count"], reverse=True,
            )
            campaigns = sorted(
                list(campaign_details.values()),
                key=lambda x: x["count"], reverse=True,
            )

            return jsonify({
                "total_contacts": total,
                "by_source": by_source,
                "by_medium": by_medium,
                "campaigns": campaigns,
                "pipeline_id": pipeline_id,
            })
        except Exception as e:
            logger.exception("Acquisition error")
            return jsonify({"error": str(e), "by_source": [], "by_medium": [], "campaigns": []}), 500

    # ── API: Revenue Forecast ────────────────────────────────────────────

    @app.route("/api/forecast-weighted")
    def api_forecast_weighted():
        """Return weighted revenue forecast for the current year."""
        thresholds = _load_thresholds()
        creds = _load_credentials()
        pcfg = _pipeline_config(thresholds)

        pipeline_id = request.args.get("pipeline_id", type=int)
        if pipeline_id is None:
            pipeline_id = pcfg["pipeline_id"]

        year = datetime.now().year
        year_start = f"{year}-01-01"
        year_end = f"{year}-12-31"

        cad_to_usd = thresholds.get("currency", {}).get("cad_to_usd_rate", 0.74)

        try:
            ac = _build_activecampaign(creds)
            if not ac or not ac.test_connection():
                return jsonify({"error": "ActiveCampaign not connected", "raw_pipeline": 0, "weighted_forecast": 0, "by_month": []})

            deals = ac.fetch_deals_for_range(year_start, year_end, pipeline_id=pipeline_id)
            stages = ac.get_pipeline_stages(pipeline_id)
            stage_count = max(len(stages), 1)
            stage_order = sorted(stages, key=lambda s: int(s.get("order", 0)))

            # Build stage weights: 10% at first stage, 90% at last
            stage_weights = {}
            for i, s in enumerate(stage_order):
                weight = round(0.10 + (0.80 * i / max(stage_count - 1, 1)), 2)
                stage_weights[str(s.get("id", ""))] = min(weight, 0.90)

            open_deals = [d for d in deals if int(d.get("status", 0)) == 0]
            won_deals = [d for d in deals if int(d.get("status", 0)) == 1]

            raw_total = sum(float(d.get("value", 0)) for d in open_deals)
            won_value = sum(float(d.get("value", 0)) for d in won_deals)

            # Currency breakdown
            usd_raw = sum(float(d.get("value", 0)) for d in open_deals if d.get("currency", "usd") == "usd")
            cad_raw = sum(float(d.get("value", 0)) for d in open_deals if d.get("currency", "") == "cad")
            usd_weighted = 0.0
            cad_weighted = 0.0

            weighted_total = 0.0
            by_stage = []
            for stage in stage_order:
                sid = str(stage.get("id", ""))
                weight = stage_weights.get(sid, 0.1)
                stage_deals = [
                    d for d in open_deals
                    if str(d.get("stage_id", d.get("stage", ""))) == sid
                ]
                stage_value = sum(float(d.get("value", 0)) for d in stage_deals)
                stage_weighted = round(stage_value * weight, 2)
                weighted_total += stage_weighted

                # Currency weighted
                for d in stage_deals:
                    v = float(d.get("value", 0)) * weight
                    if d.get("currency", "usd") == "cad":
                        cad_weighted += v
                    else:
                        usd_weighted += v

                by_stage.append({
                    "stage_id": sid,
                    "stage_name": stage.get("title", ""),
                    "weight": weight,
                    "deal_count": len(stage_deals),
                    "raw_value": round(stage_value, 2),
                    "weighted_value": stage_weighted,
                })

            # Close date distribution by month
            monthly: dict = {}
            for deal in open_deals:
                close = deal.get("close_date", "")
                if close:
                    try:
                        dt = datetime.fromisoformat(str(close).replace("Z", "+00:00")).replace(tzinfo=None)
                        key = dt.strftime("%Y-%m")
                        label = dt.strftime("%b %Y")
                    except Exception:
                        key, label = "unknown", "Unknown"
                else:
                    key, label = "unknown", "Unknown"
                if key not in monthly:
                    monthly[key] = {"month": key, "label": label, "deals": 0, "raw": 0.0, "weighted": 0.0}
                monthly[key]["deals"] += 1
                sid = str(deal.get("stage_id", deal.get("stage", "")))
                w = stage_weights.get(sid, 0.1)
                v = float(deal.get("value", 0))
                monthly[key]["raw"] += v
                monthly[key]["weighted"] += v * w

            by_month = [
                {**m, "raw": round(m["raw"], 2), "weighted": round(m["weighted"], 2), "value": round(m["raw"], 2)}
                for m in sorted(monthly.values(), key=lambda x: x["month"])
            ]

            annual_target = thresholds.get("revenue", {}).get("annual_target", 9000000)
            remaining = max(annual_target - won_value - weighted_total, 0)
            coverage = round((weighted_total + won_value) / annual_target, 4) if annual_target else 0
            gap = weighted_total - remaining

            return jsonify({
                "pipeline_id": pipeline_id,
                "year": year,
                "date_range": {"start": year_start, "end": year_end},
                "raw_pipeline": round(raw_total, 2),
                "raw_pipeline_value": round(raw_total, 2),
                "weighted_forecast": round(weighted_total, 2),
                "won_value": round(won_value, 2),
                "coverage_ratio": coverage,
                "remaining_target": round(remaining, 2),
                "gap_to_weighted": round(gap, 2),
                "deal_count": len(open_deals),
                "by_stage": by_stage,
                "by_month": by_month,
                "by_close_date": by_month,
                "usd_raw": round(usd_raw, 2),
                "usd_weighted": round(usd_weighted, 2),
                "cad_raw": round(cad_raw, 2),
                "cad_weighted": round(cad_weighted, 2),
                "cad_to_usd_rate": cad_to_usd,
                "annual_target": annual_target,
                "as_of": datetime.now().isoformat(),
            })
        except Exception as e:
            logger.exception("Forecast error")
            return jsonify({"error": str(e), "raw_pipeline": 0, "weighted_forecast": 0, "by_month": []}), 500

    # ── API: Cohort Analysis ─────────────────────────────────────────────

    @app.route("/api/cohorts")
    def api_cohorts():
        """Return cohort analysis for current year, filtered by pipeline."""
        thresholds = _load_thresholds()
        creds = _load_credentials()
        pcfg = _pipeline_config(thresholds)

        pipeline_id = request.args.get("pipeline_id", type=int)
        if pipeline_id is None:
            pipeline_id = pcfg["pipeline_id"]

        year = datetime.now().year

        try:
            ac = _build_activecampaign(creds)
            if not ac or not ac.test_connection():
                return jsonify({"error": "ActiveCampaign not connected", "cohorts": []})

            raw_cohorts = ac.fetch_cohort_data(
                months=12, pipeline_id=pipeline_id,
            )

            # Resolve pipeline name
            pipeline_name = pcfg["pipeline_name"]
            try:
                for p in ac.fetch_all_pipelines():
                    if p["id"] == pipeline_id:
                        pipeline_name = p["title"]
                        break
            except Exception:
                pass

            # Normalise: pretty month labels, conversion_rate as percentage
            cohorts = []
            for c in raw_cohorts:
                cm = c.get("cohort_month", "")
                # Filter to current year only
                if not cm.startswith(str(year)):
                    continue
                try:
                    from calendar import month_abbr
                    parts = cm.split("-")
                    pretty = month_abbr[int(parts[1])] + " " + parts[0]
                except Exception:
                    pretty = cm

                rate_raw = c.get("conversion_rate", 0) or 0
                cohorts.append({
                    **c,
                    "month": pretty,
                    "cohort": pretty,
                    "contacts": c.get("contacts_created", 0),
                    "converted": c.get("converted_to_hiro", 0),
                    "won_value": float(c.get("total_value_won", 0) or 0),
                    "conversion_rate": round(rate_raw * 100, 1),
                })

            # Summary
            rates = [c["conversion_rate"] for c in cohorts if c["conversion_rate"] is not None]
            days_vals = [c.get("avg_days_to_convert", 0) for c in cohorts if c.get("avg_days_to_convert") is not None]
            avg_conv = round(sum(rates) / len(rates), 1) if rates else 0
            avg_days = round(sum(days_vals) / len(days_vals), 1) if days_vals else 0

            best = max(cohorts, key=lambda c: c["conversion_rate"]) if cohorts else {}
            worst = min(cohorts, key=lambda c: c["conversion_rate"]) if cohorts else {}

            trend = "stable"
            if len(cohorts) >= 6:
                recent = sum(c["conversion_rate"] for c in cohorts[-3:]) / 3
                prev = sum(c["conversion_rate"] for c in cohorts[-6:-3]) / 3
                if prev > 0:
                    delta = ((recent - prev) / prev) * 100
                    trend = "improving" if delta > 5 else "declining" if delta < -5 else "stable"

            return jsonify({
                "cohorts": cohorts,
                "pipeline_id": pipeline_id,
                "pipeline_name": pipeline_name,
                "year": year,
                "trend": trend,
                "best_cohort": {"month": best.get("month", ""), "conversion_rate": best.get("conversion_rate", 0)} if best else None,
                "worst_cohort": {"month": worst.get("month", ""), "conversion_rate": worst.get("conversion_rate", 0)} if worst else None,
                "avg_days_to_convert": avg_days,
                "data_note": f"Each row = deals created that month in {pipeline_name}. Converted = status Won.",
                "as_of": datetime.now().isoformat(),
            })
        except Exception as e:
            logger.exception("Cohorts error")
            return jsonify({"error": str(e), "cohorts": []}), 500

    # ── API: Available pipelines ─────────────────────────────────────────

    @app.route("/api/pipelines")
    def api_pipelines():
        creds = _load_credentials()
        try:
            ac = _build_activecampaign(creds)
            if ac and ac.test_connection():
                pipelines = ac.fetch_all_pipelines()
                return jsonify({"pipelines": pipelines})
        except Exception:
            pass
        return jsonify({"pipelines": []})

    # ── API: Campaigns ──────────────────────────────────────────────────

    @app.route("/api/campaigns")
    def api_campaigns():
        thresholds = _load_thresholds()
        creds = _load_credentials()
        quarter = _current_quarter()
        q_start, q_end = _quarter_dates(quarter)

        # Accept optional date range from query params
        start_date_str = request.args.get("start_date")
        end_date_str = request.args.get("end_date")
        if start_date_str and end_date_str:
            try:
                q_start = datetime.strptime(start_date_str, "%Y-%m-%d")
                q_end = datetime.strptime(end_date_str, "%Y-%m-%d")
            except ValueError:
                pass  # fall back to quarter defaults

        campaigns = []
        source = "none"
        gads_connected = False
        ac_connected = False

        # Try Google Ads first
        gads = _fetch_gads_data(creds, q_start, q_end)
        if gads["connected"] and gads["campaigns"]:
            gads_connected = True
            campaigns = gads["campaigns"]
            source = "google_ads"

        # Fall back to ActiveCampaign deals (real data, not demo)
        if not campaigns:
            pcfg = _pipeline_config(thresholds)
            ac = _fetch_ac_data(creds, pipeline_id=pcfg["pipeline_id"])
            if ac["connected"] and ac["deals"]:
                ac_connected = True
                campaigns = _deals_to_campaign_rows(
                    ac["deals"], ac["pipeline_stages"]
                )
                source = "activecampaign"

        # Enrich with CPA analysis
        cpa_thresholds = thresholds.get(
            "cpa", {"excellent": 75, "warning": 200, "critical": 300}
        )

        enriched = []
        for c in campaigns:
            conversions = c.get("conversions", 0)
            cost = c.get("cost", 0)
            clicks = c.get("clicks", 0)
            impressions = c.get("impressions", 0)
            cpa = cost / conversions if conversions else 0

            if conversions == 0:
                cpa_status = "none"
            elif cpa <= cpa_thresholds.get("excellent", 75):
                cpa_status = "excellent"
            elif cpa <= cpa_thresholds.get("warning", 200):
                cpa_status = "warning"
            else:
                cpa_status = "critical"

            ctr = (clicks / impressions * 100) if impressions else 0
            conv_rate = (conversions / clicks * 100) if clicks else 0

            enriched.append(
                {
                    "id": c.get("id", ""),
                    "name": c.get("name", "Unknown"),
                    "status": c.get("status", "UNKNOWN"),
                    "impressions": impressions,
                    "clicks": clicks,
                    "conversions": conversions,
                    "cost": round(cost, 2),
                    "cpa": round(cpa, 2),
                    "ctr": round(ctr, 2),
                    "conversion_rate": round(conv_rate, 2),
                    "cpa_status": c.get("cpa_status", cpa_status),
                }
            )

        # Try strategic analysis
        recommendations = {
            "immediate_actions": [],
            "strategic_adjustments": [],
            "new_tactics": [],
        }
        if campaigns and source == "google_ads":
            try:
                from agents.strategic_advisor.campaign_analyzer import CampaignAnalyzer

                analyzer = CampaignAnalyzer()
                analysis = analyzer.analyze_campaigns(campaigns, cpa_thresholds)
                recommendations = analyzer.generate_recommendations(analysis)
            except Exception:
                pass

        return jsonify(
            {
                "campaigns": enriched,
                "recommendations": recommendations,
                "thresholds": cpa_thresholds,
                "live_data": gads_connected or ac_connected,
                "source": source,
            }
        )

    # ── API: Trend data ─────────────────────────────────────────────────

    @app.route("/api/trends")
    def api_trends():
        creds = _load_credentials()
        thresholds = _load_thresholds()
        pcfg = _pipeline_config(thresholds)

        pipeline_id = request.args.get("pipeline_id", type=int)
        if pipeline_id is None:
            pipeline_id = pcfg["pipeline_id"]

        # Default: Jan 1 of current year to today
        year = datetime.now().year
        default_start = datetime(year, 1, 1)
        default_end = datetime.now()

        start_date_str = request.args.get("start_date")
        end_date_str = request.args.get("end_date")
        if start_date_str and end_date_str:
            try:
                q_start = datetime.strptime(start_date_str, "%Y-%m-%d")
                q_end = datetime.strptime(end_date_str, "%Y-%m-%d")
            except ValueError:
                q_start, q_end = default_start, default_end
        else:
            q_start, q_end = default_start, default_end

        if q_end < q_start:
            q_end = q_start

        # Try Google Ads daily data first
        gads = _fetch_gads_data(creds, q_start, q_end)
        if gads["connected"] and gads["campaigns"]:
            trend_days = []
            for camp in gads["campaigns"]:
                conversions = camp.get("conversions", 0)
                cost = camp.get("cost", 0)
                clicks = camp.get("clicks", 0)
                impressions = camp.get("impressions", 0)
                trend_days.append(
                    {
                        "date": q_start.strftime("%Y-%m-%d"),
                        "label": camp.get("name", "Campaign")[:20],
                        "spend": round(cost, 2),
                        "cumulative_spend": round(cost, 2),
                        "clicks": clicks,
                        "conversions": conversions,
                        "impressions": impressions,
                        "cpa": round(cost / conversions, 2) if conversions else 0,
                        "ctr": round(clicks / impressions * 100, 2)
                        if impressions
                        else 0,
                        "conversion_rate": round(
                            conversions / clicks * 100, 2
                        )
                        if clicks
                        else 0,
                    }
                )
            return jsonify({
                "days": trend_days,
                "live_data": True,
                "source": "google_ads",
                "pipeline_id": pipeline_id,
                "date_range": {
                    "start": q_start.strftime("%Y-%m-%d"),
                    "end": q_end.strftime("%Y-%m-%d"),
                    "label": f"{q_start.strftime('%b %d, %Y')} – {q_end.strftime('%b %d, %Y')}",
                },
                "year": year,
            })

        # Fall back to ActiveCampaign deal history
        try:
            ac = _build_activecampaign(creds)
            if ac and ac.test_connection():
                deals = ac.fetch_deals_for_range(
                    q_start.strftime("%Y-%m-%d"),
                    q_end.strftime("%Y-%m-%d"),
                    pipeline_id=pipeline_id,
                )
                if deals:
                    # Group by month for year-level view
                    monthly: dict = {}
                    for deal in deals:
                        date_str = deal.get("created_date", "")
                        if not date_str:
                            continue
                        try:
                            dt = datetime.fromisoformat(
                                date_str.replace("Z", "+00:00")
                            ).replace(tzinfo=None)
                            month_key = dt.strftime("%Y-%m")
                            month_label = dt.strftime("%b %Y")
                        except Exception:
                            continue
                        if month_key not in monthly:
                            monthly[month_key] = {
                                "month": month_key, "label": month_label,
                                "deal_count": 0, "won_count": 0, "total_value": 0.0,
                            }
                        monthly[month_key]["deal_count"] += 1
                        monthly[month_key]["total_value"] += float(deal.get("value", 0))
                        if str(deal.get("status", "")) == "1":
                            monthly[month_key]["won_count"] += 1

                    trend_months = []
                    for key in sorted(monthly.keys()):
                        m = monthly[key]
                        total = m["deal_count"]
                        won = m["won_count"]
                        trend_months.append({
                            "date": m["month"],
                            "label": m["label"],
                            "deal_count": total,
                            "won_count": won,
                            "conversion_rate": round(won / total * 100 if total else 0, 2),
                            "total_value": round(m["total_value"], 2),
                            # Compat fields for existing chart renderer
                            "spend": round(m["total_value"], 2),
                            "clicks": total,
                            "conversions": won,
                            "impressions": total,
                            "cpa": round(m["total_value"] / total if total else 0, 2),
                            "ctr": round(won / total * 100 if total else 0, 2),
                            "cumulative_spend": 0,
                        })

                    # Resolve pipeline name
                    pipeline_name = pcfg["pipeline_name"]
                    try:
                        for p in ac.fetch_all_pipelines():
                            if p["id"] == pipeline_id:
                                pipeline_name = p["title"]
                                break
                    except Exception:
                        pass

                    return jsonify({
                        "days": trend_months,
                        "months": trend_months,
                        "live_data": True,
                        "source": "activecampaign",
                        "pipeline_id": pipeline_id,
                        "pipeline_name": pipeline_name,
                        "date_range": {
                            "start": q_start.strftime("%Y-%m-%d"),
                            "end": q_end.strftime("%Y-%m-%d"),
                            "label": f"{q_start.strftime('%b %d, %Y')} – {q_end.strftime('%b %d, %Y')}",
                        },
                        "year": year,
                    })
        except Exception as e:
            logger.debug("Trends AC fallback error: %s", e)

        # No data available
        return jsonify({"days": [], "months": [], "live_data": False, "source": "none"})

    # ── API: Alerts ─────────────────────────────────────────────────────

    @app.route("/api/alerts")
    def api_alerts():
        thresholds = _load_thresholds()
        creds = _load_credentials()
        quarter = _current_quarter()
        q_start, q_end = _quarter_dates(quarter)

        # Try Google Ads campaigns for CPA-based alerts
        gads = _fetch_gads_data(creds, q_start, q_end)
        if gads["connected"] and gads["campaigns"]:
            campaigns = gads["campaigns"]
            try:
                from agents.strategic_advisor.campaign_analyzer import CampaignAnalyzer

                analyzer = CampaignAnalyzer()
                cpa_thresholds = thresholds.get(
                    "cpa", {"excellent": 75, "warning": 200, "critical": 300}
                )
                alerts = analyzer.create_alerts(campaigns, cpa_thresholds)
            except Exception:
                alerts = _generate_fallback_alerts(campaigns, thresholds)
            return jsonify({"alerts": alerts, "source": "google_ads"})

        # Generate alerts from ActiveCampaign deal data
        pcfg = _pipeline_config(thresholds)
        ac = _fetch_ac_data(creds, pipeline_id=pcfg["pipeline_id"])
        if ac["connected"]:
            alerts = _generate_deal_alerts(ac["deals"], thresholds)
            return jsonify({"alerts": alerts, "source": "activecampaign"})

        # No data — no alerts
        return jsonify({"alerts": [], "source": "none"})

    # ── API: Export CSV ─────────────────────────────────────────────────

    @app.route("/api/export/csv")
    def export_csv():
        campaigns_resp = api_campaigns()
        data = json.loads(campaigns_resp.get_data())

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(
            [
                "Campaign",
                "Status",
                "Impressions",
                "Clicks",
                "Conversions",
                "Cost",
                "CPA",
                "CTR",
                "Conv Rate",
            ]
        )
        for c in data["campaigns"]:
            writer.writerow(
                [
                    c["name"],
                    c["status"],
                    c["impressions"],
                    c["clicks"],
                    c["conversions"],
                    c["cost"],
                    c["cpa"],
                    c["ctr"],
                    c["conversion_rate"],
                ]
            )

        output.seek(0)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        return Response(
            output.getvalue(),
            mimetype="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=campaigns_{timestamp}.csv"
            },
        )

    # ── API: Demand Gen ROI ─────────────────────────────────────────────

    @app.route("/api/demand-gen-roi")
    def api_demand_gen_roi():
        from agents.dashboard.demand_gen_roi import build_roi_payload

        thresholds = _load_thresholds()
        creds = _load_credentials()
        pcfg = _pipeline_config(thresholds)
        pipeline_id = pcfg.get("pipeline_id", 1)

        # Determine year
        year = request.args.get("year", type=int) or datetime.now().year

        # Fetch pipeline deals + stages
        ac = _fetch_ac_data(creds, pipeline_id=pipeline_id)
        deals = ac.get("deals", [])
        stages = ac.get("pipeline_stages", [])
        ac_connected = ac.get("connected", False)

        # Ad spend from Google Ads (aggregate per month)
        ad_spend: dict[str, dict[str, float]] = {}
        gads_connected = False
        try:
            gads = _build_google_ads(creds)
            if gads and gads.test_connection():
                gads_connected = True
                # Fetch full year of data, month by month
                google_monthly: dict[str, float] = {}
                for m in range(1, 13):
                    from calendar import monthrange
                    days_in = monthrange(year, m)[1]
                    sd = f"{year}-{m:02d}-01"
                    ed = f"{year}-{m:02d}-{days_in:02d}"
                    try:
                        metrics = gads.fetch_performance_metrics(sd, ed)
                        google_monthly[f"{year}-{m:02d}"] = metrics.get("cost", 0.0)
                    except Exception:
                        google_monthly[f"{year}-{m:02d}"] = 0.0
                ad_spend["google"] = google_monthly
        except Exception as e:
            logger.debug("Google Ads unavailable for ROI: %s", e)

        # LTV from config
        ltv_monthly_raw = thresholds.get("ltv", {}).get("monthly_actuals", {})
        ltv_monthly = {str(k): float(v) for k, v in ltv_monthly_raw.items()}

        payload = build_roi_payload(
            deals=deals,
            stages=stages,
            ad_spend=ad_spend,
            ltv_monthly=ltv_monthly,
            thresholds=thresholds,
            year=year,
        )
        payload["connections"] = {
            "activecampaign": ac_connected,
            "google_ads": gads_connected,
        }
        payload["year"] = year

        return jsonify(payload)

    # ── API: Demand Gen ROI CSV export ───────────────────────────────────

    @app.route("/api/demand-gen-roi/export/csv")
    def export_roi_csv():
        roi_resp = api_demand_gen_roi()
        data = json.loads(roi_resp.get_data())

        output = io.StringIO()
        writer = csv.writer(output)

        funnel = data.get("funnel", {})
        roas = data.get("roas", {})
        labels = funnel.get("labels", [])
        months = funnel.get("months", [])

        # Header
        writer.writerow(["Metric"] + labels + ["YTD Total"])

        # Funnel rows
        ytd = funnel.get("ytd_totals", {})
        for key in ["created", "engaged", "captured", "converted"]:
            vals = funnel.get(key, [])
            writer.writerow(
                [f"Demand {key.title()}"] + vals + [ytd.get(key, "")]
            )

        # Conversion rate rows
        for key in ["engaged_rate", "captured_rate", "converted_rate"]:
            vals = funnel.get(key, [])
            formatted = [
                f"{v:.1%}" if v is not None else "" for v in vals
            ]
            ytd_val = ytd.get(key)
            ytd_fmt = f"{ytd_val:.1%}" if ytd_val is not None else ""
            writer.writerow([key.replace("_", " ").title()] + formatted + [ytd_fmt])

        writer.writerow([])  # blank row

        # ROAS rows
        writer.writerow(
            ["Ad Spend"] + [f"${v:,.2f}" for v in roas.get("total_spend", [])]
            + [f"${roas.get('annual', {}).get('total_spend', 0):,.2f}"]
        )
        writer.writerow(
            ["LTV"] + [f"${v:,.0f}" for v in roas.get("ltv", [])] + [""]
        )
        for label, key in [
            ("ROAS A (Monthly New)", "roas_a"),
            ("ROAS B (Cumulative ARR)", "roas_b"),
            ("ROAS C (LTV-Weighted)", "roas_c"),
        ]:
            vals = roas.get(key, [])
            formatted = [f"{v:.1f}x" if v is not None else "" for v in vals]
            writer.writerow([label] + formatted + [
                f"{roas.get('annual', {}).get('roas', 0):.1f}x"
                if key == "roas_c" else ""
            ])

        output.seek(0)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        return Response(
            output.getvalue(),
            mimetype="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=demand_gen_roi_{timestamp}.csv"
            },
        )

    # ── API: Demand Gen ROI config save ─────────────────────────────────

    @app.route("/api/demand-gen-roi/config", methods=["POST"])
    def api_demand_gen_roi_config():
        import yaml

        data = request.get_json()
        if not data:
            return jsonify({"saved": False, "error": "No JSON body"}), 400

        thresholds_path = CONFIG_DIR / "thresholds.yaml"
        try:
            thresholds = {}
            if thresholds_path.exists():
                with open(thresholds_path, "r") as f:
                    thresholds = yaml.safe_load(f) or {}

            updated_keys = []

            # Merge ltv_monthly into ltv.monthly_actuals
            if "ltv_monthly" in data and isinstance(data["ltv_monthly"], dict):
                ltv = thresholds.setdefault("ltv", {})
                actuals = ltv.setdefault("monthly_actuals", {})
                for k, v in data["ltv_monthly"].items():
                    actuals[str(k)] = float(v)
                updated_keys.append("ltv.monthly_actuals")

            # Merge ad_spend into ad_spend.monthly_overrides
            if "ad_spend" in data and isinstance(data["ad_spend"], dict):
                ads = thresholds.setdefault("ad_spend", {})
                overrides = ads.setdefault("monthly_overrides", {})
                for k, v in data["ad_spend"].items():
                    overrides[str(k)] = float(v)
                updated_keys.append("ad_spend.monthly_overrides")

            if not updated_keys:
                return jsonify({"saved": False, "error": "No recognised keys (expected ltv_monthly or ad_spend)"}), 400

            with open(thresholds_path, "w") as f:
                yaml.dump(thresholds, f, default_flow_style=False, sort_keys=False)

            return jsonify({"saved": True, "updated_keys": updated_keys})
        except Exception as e:
            logger.exception("ROI config save error")
            return jsonify({"saved": False, "error": str(e)}), 400

    # ── API: Gemini CIC Advisor ─────────────────────────────────────────

    @app.route("/api/advisor/chat", methods=["POST"])
    def api_advisor_chat():
        """Gemini AI Advisor chat endpoint."""
        import requests as http_requests

        creds = _load_credentials()
        gemini_key = creds.get("gemini", {}).get("api_key", "")

        if not gemini_key:
            return jsonify({
                "error": "Gemini API key not configured.",
                "response": (
                    "The AI Advisor is not configured yet. "
                    "Add your GEMINI_API_KEY to the environment variables."
                ),
            }), 200

        data = request.get_json()
        if not data:
            return jsonify({"error": "No request body"}), 400

        user_message = data.get("message", "").strip()
        context = data.get("context", {})
        source = context.get("source", "chat")

        if not user_message:
            return jsonify({"error": "No message provided"}), 400

        system_prompt = """You are the CIC Advisor — the AI intelligence assistant
for Cliniconex's internal Intelligence Center dashboard.

Your role:
- Answer questions about the marketing pipeline, deal velocity,
  revenue forecasting, Google Ads performance, and campaign strategy
- Provide specific, actionable recommendations — never generic advice
- Be direct and concise — this is a business tool, not a chatbot
- When you don't have enough data to answer confidently, say so clearly
- Always ground your answers in the context data provided

Business context you must always apply:
- Company: Cliniconex (healthcare communication software)
- Annual revenue target: $9M ($2.25M per quarter)
- Primary pipeline: Prospect Demand Pipeline (Pipeline 1 in ActiveCampaign)
- Pipeline stages: Contact Created > Contact Engaged > MQL/PQM > HIRO
- HIRO target: 25% of open deals should be in HIRO stage
- CPA thresholds: Excellent ≤$75 | Warning ≤$200 | Critical >$300
- Average LTV: ~$29,000
- Currencies: USD and CAD deals in pipeline

Tone: Friendly, direct, informative. Use plain language.
Format: Use short paragraphs. Use bullet points only when listing
3 or more items. Never use corporate jargon.
Length: Keep responses under 250 words unless a detailed analysis
is explicitly requested."""

        # Build context block from dashboard data
        context_block = ""
        ps = context.get("pipeline_summary", {})
        if ps:
            context_block += (
                f"\nCurrent pipeline snapshot:\n"
                f"- Open deals: {ps.get('deals', ps.get('open_deals', 'N/A'))}\n"
                f"- Pipeline value: ${ps.get('pipeline_value', 0):,.0f}\n"
                f"- Quarter: {ps.get('quarter', 'N/A')}\n"
                f"- Progress: {ps.get('pct_complete', 0):.1f}%\n"
                f"- Status: {ps.get('status', 'N/A')}\n"
                f"- Days remaining: {ps.get('days_remaining', 'N/A')}\n"
            )

        alerts = context.get("alerts", [])
        if alerts:
            context_block += f"\nActive alerts ({len(alerts)} total):\n"
            for a in alerts[:5]:
                context_block += (
                    f"- [{a.get('level', '').upper()}] "
                    f"{a.get('campaign', '')}: {a.get('message', '')}\n"
                )

        vel = context.get("velocity", {})
        vel_stages = vel.get("stages", [])
        if vel_stages:
            context_block += "\nDeal velocity by stage:\n"
            for s in vel_stages:
                context_block += (
                    f"- {s.get('stage_name', '')}: "
                    f"avg {s.get('avg_days_in_stage', 0):.1f} days "
                    f"({s.get('deal_count', 0)} deals)\n"
                )

        # Source-specific prompt shaping
        if source == "alert_explain":
            prompt_prefix = (
                "The user wants you to explain why this alert is happening "
                "and what they should do about it. Be specific. "
            )
        elif source == "campaign_rec":
            prompt_prefix = (
                "The user wants specific Google Ads budget recommendations. "
                "Focus on which campaigns to scale, pause, or shift budget "
                "based on CPA performance relative to our thresholds. "
            )
        else:
            prompt_prefix = ""

        full_user_message = f"{prompt_prefix}{user_message}"
        if context_block:
            full_user_message += f"\n\nCurrent dashboard data:\n{context_block}"

        gemini_url = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"gemini-1.5-flash:generateContent?key={gemini_key}"
        )

        payload = {
            "system_instruction": {
                "parts": [{"text": system_prompt}]
            },
            "contents": [
                {"role": "user", "parts": [{"text": full_user_message}]}
            ],
            "generationConfig": {
                "temperature": 0.4,
                "maxOutputTokens": 600,
                "topP": 0.9,
            },
        }

        try:
            resp = http_requests.post(gemini_url, json=payload, timeout=30)
            resp.raise_for_status()
            result = resp.json()

            candidates = result.get("candidates", [])
            if not candidates:
                return jsonify({
                    "response": "I couldn't generate a response. Please try again.",
                    "error": "No candidates in Gemini response",
                })

            text = (
                candidates[0]
                .get("content", {})
                .get("parts", [{}])[0]
                .get("text", "")
            )

            return jsonify({
                "response": text,
                "model": "gemini-1.5-flash",
                "source": source,
            })

        except http_requests.exceptions.Timeout:
            return jsonify({
                "response": (
                    "The AI Advisor is taking longer than expected. "
                    "Please try again in a moment."
                ),
                "error": "timeout",
            })
        except Exception as e:
            logger.exception("Gemini API error")
            return jsonify({
                "response": "The AI Advisor encountered an error. Please try again.",
                "error": "internal_error",
            })

    @app.route("/api/advisor/proactive", methods=["GET"])
    def api_advisor_proactive():
        """Generate a proactive insight based on current pipeline state."""
        import requests as http_requests

        creds = _load_credentials()
        gemini_key = creds.get("gemini", {}).get("api_key", "")

        if not gemini_key:
            return jsonify({"insight": None, "configured": False})

        thresholds = _load_thresholds()
        pcfg = _pipeline_config(thresholds)
        pipeline_id = request.args.get("pipeline_id", type=int) or pcfg["pipeline_id"]

        try:
            ac = _build_activecampaign(creds)
            if not ac or not ac.test_connection():
                return jsonify({"insight": None, "configured": True, "error": "AC not connected"})
            summary = ac.fetch_pipeline_summary(pipeline_id=pipeline_id)
        except Exception as e:
            logger.exception("Advisor proactive: pipeline fetch error")
            return jsonify({"insight": None, "error": "internal_error"})

        hiro_rate = summary.get("hiro_rate_pct", 0)
        stalled = summary.get("stalled_count", 0)
        open_deals = summary.get("open_deals", 0)
        pipeline_value = summary.get("total_value_usd", 0)

        prompt = (
            "You are the CIC Advisor for Cliniconex.\n"
            "Based on this pipeline snapshot, give ONE short proactive insight "
            "(2-3 sentences max) — the single most important thing the marketing "
            "team should know or act on right now.\n\n"
            "Be specific. Use the numbers. Don't ask questions. Don't offer a list.\n"
            "Just state the most important observation and what to do about it.\n\n"
            f"Pipeline snapshot:\n"
            f"- Open deals: {open_deals}\n"
            f"- Pipeline value: ${pipeline_value:,.2f}\n"
            f"- HIRO rate: {hiro_rate}% (target: 25%)\n"
            f"- Stalled deals: {stalled}\n"
            f"- Won deals: {summary.get('won_deals', 0)}\n\n"
            f"HIRO target met: {'Yes' if hiro_rate >= 25 else 'No'}\n"
        )

        gemini_url = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"gemini-1.5-flash:generateContent?key={gemini_key}"
        )

        try:
            resp = http_requests.post(
                gemini_url,
                json={
                    "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                    "generationConfig": {"temperature": 0.3, "maxOutputTokens": 150},
                },
                timeout=15,
            )
            resp.raise_for_status()
            result = resp.json()
            text = (
                result.get("candidates", [{}])[0]
                .get("content", {})
                .get("parts", [{}])[0]
                .get("text", "")
            )
            return jsonify({
                "insight": text,
                "configured": True,
                "hiro_rate": hiro_rate,
                "stalled_count": stalled,
            })
        except Exception as e:
            logger.exception("Advisor proactive: Gemini call error")
            return jsonify({"insight": None, "configured": True, "error": "internal_error"})

    # ── CSS: Time Intelligence styles ────────────────────────────────────

    @app.route("/css/time-intelligence.css")
    def time_intelligence_css():
        return Response(_TIME_INTELLIGENCE_CSS, mimetype="text/css")

    return app


# ── Alert generators ────────────────────────────────────────────────────────


def _generate_fallback_alerts(campaigns: list, thresholds: dict) -> list:
    """Generate alerts from Google Ads campaigns without the CampaignAnalyzer."""
    alerts = []
    cpa_critical = thresholds.get("cpa", {}).get("critical", 300)
    cpa_warning = thresholds.get("cpa", {}).get("warning", 200)
    zero_limit = thresholds.get("budget", {}).get("zero_conversion_limit", 150)

    for c in campaigns:
        cost = c.get("cost", 0)
        conversions = c.get("conversions", 0)
        cpa = cost / conversions if conversions else 0

        if conversions == 0 and cost > zero_limit:
            alerts.append(
                {
                    "level": "critical",
                    "campaign": c.get("name", "Unknown"),
                    "metric": "conversions",
                    "value": 0,
                    "threshold": zero_limit,
                    "message": f"${cost:,.2f} spent with zero conversions",
                }
            )
        elif conversions > 0 and cpa > cpa_critical:
            alerts.append(
                {
                    "level": "critical",
                    "campaign": c.get("name", "Unknown"),
                    "metric": "cpa",
                    "value": round(cpa, 2),
                    "threshold": cpa_critical,
                    "message": f"CPA ${cpa:,.2f} exceeds critical threshold ${cpa_critical}",
                }
            )
        elif conversions > 0 and cpa > cpa_warning:
            alerts.append(
                {
                    "level": "warning",
                    "campaign": c.get("name", "Unknown"),
                    "metric": "cpa",
                    "value": round(cpa, 2),
                    "threshold": cpa_warning,
                    "message": f"CPA ${cpa:,.2f} above warning threshold ${cpa_warning}",
                }
            )

    excellent = thresholds.get("cpa", {}).get("excellent", 75)
    for c in campaigns:
        conversions = c.get("conversions", 0)
        cost = c.get("cost", 0)
        if conversions > 0:
            cpa = cost / conversions
            if cpa <= excellent and conversions >= 20:
                alerts.append(
                    {
                        "level": "info",
                        "campaign": c.get("name", "Unknown"),
                        "metric": "cpa",
                        "value": round(cpa, 2),
                        "threshold": excellent,
                        "message": f"Excellent CPA ${cpa:,.2f} — consider scaling budget",
                    }
                )

    return alerts


def _generate_deal_alerts(deals: list, thresholds: dict) -> list:
    """Generate alerts from ActiveCampaign deal pipeline data."""
    alerts = []

    if not deals:
        return alerts

    # Pipeline health alerts
    total_value = sum(float(d.get("value", 0)) for d in deals)
    deal_count = len(deals)
    won_deals = [d for d in deals if str(d.get("status", "")) == "1"]
    lost_deals = [d for d in deals if str(d.get("status", "")) == "2"]
    open_deals = [d for d in deals if str(d.get("status", "")) == "0"]

    avg_deal = thresholds.get("deal_size", {}).get("average", 1200)

    # Alert: high-value deals in pipeline
    high_value_deals = [
        d for d in open_deals
        if float(d.get("value", 0)) > avg_deal * 3
    ]
    for d in high_value_deals:
        value = float(d.get("value", 0))
        alerts.append(
            {
                "level": "info",
                "campaign": d.get("title", f"Deal #{d.get('id', '?')}"),
                "metric": "deal_value",
                "value": round(value, 2),
                "threshold": avg_deal * 3,
                "message": f"High-value deal ${value:,.2f} in pipeline — prioritize follow-up",
                "ac_url": d.get("ac_url", ""),
            }
        )

    # Alert: pipeline summary
    if total_value > 0:
        quarter = _current_quarter()
        quarter_key = f"{quarter.lower()}_target"
        revenue_target = thresholds.get("revenue", {}).get(quarter_key, 0)
        if revenue_target and total_value >= revenue_target:
            alerts.append(
                {
                    "level": "info",
                    "campaign": "Pipeline Health",
                    "metric": "pipeline_value",
                    "value": round(total_value, 2),
                    "threshold": revenue_target,
                    "message": f"Pipeline value ${total_value:,.0f} meets {quarter} target ${revenue_target:,.0f}",
                }
            )
        elif revenue_target and total_value < revenue_target * 0.5:
            alerts.append(
                {
                    "level": "warning",
                    "campaign": "Pipeline Health",
                    "metric": "pipeline_value",
                    "value": round(total_value, 2),
                    "threshold": revenue_target,
                    "message": f"Pipeline value ${total_value:,.0f} is below 50% of {quarter} target ${revenue_target:,.0f}",
                }
            )

    # Alert: lost deal ratio
    if deal_count >= 5 and lost_deals:
        loss_rate = len(lost_deals) / deal_count
        if loss_rate > 0.3:
            alerts.append(
                {
                    "level": "warning",
                    "campaign": "Deal Win Rate",
                    "metric": "loss_rate",
                    "value": round(loss_rate * 100, 1),
                    "threshold": 30,
                    "message": f"{loss_rate:.0%} of deals lost — review sales process",
                }
            )

    return alerts


# ── Standalone runner ───────────────────────────────────────────────────────


def run_server(port: int = 8080, debug: bool = False):
    """Start the dashboard server."""
    app = create_app()
    print(f"\n  Marketing Intelligence Center Dashboard")
    print(f"  Running on: http://localhost:{port}")
    print(f"  Mode: {'Development' if debug else 'Production'}")
    print(f"  Press Ctrl+C to stop\n")
    app.run(host="0.0.0.0", port=port, debug=debug)


if __name__ == "__main__":
    run_server(debug=True)
