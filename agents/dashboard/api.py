"""
Cliniconex Marketing Intelligence Center — REST API for ToolHub Integration

Pure JSON API Blueprint. All routes return application/json.
The existing HTML dashboard is untouched — this runs alongside it.
"""

import hmac
import json
import logging
import math
import os
import random
import re
from datetime import datetime, timedelta
from functools import wraps
from pathlib import Path

from flask import Blueprint, jsonify, request

logger = logging.getLogger(__name__)

# ── Required environment variables for production ────────────────────────────
# TOOLHUB_SERVICE_TOKEN  — 64-char shared secret (required in production)
# TOOLHUB_ORIGIN         — ToolHub production URL, e.g. https://toolhub.cliniconex.com
# PORT                   — Injected by Sevalla at runtime
#
# When TOOLHUB_SERVICE_TOKEN is not set, all API requests are allowed (dev mode).
# When TOOLHUB_ORIGIN is not set, defaults to http://localhost:8080 (dev mode).
# ─────────────────────────────────────────────────────────────────────────────

api_bp = Blueprint("api", __name__)

# ── Paths ─────────────────────────────────────────────────────────────────

BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent.parent
CONFIG_DIR = PROJECT_DIR / "config"
EXECUTION_LOG_PATH = PROJECT_DIR / "agents" / "automation_engine" / "execution.log"

# ── Service Token Auth ────────────────────────────────────────────────────


def require_service_token(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        service_token = os.environ.get("TOOLHUB_SERVICE_TOKEN")

        # If no token configured, allow all requests (local dev mode)
        if not service_token:
            return f(*args, **kwargs)

        # Token is configured — enforce it
        token = request.headers.get("X-Service-Token", "")
        if not hmac.compare_digest(token, service_token):
            return jsonify({"error": "Unauthorized"}), 401

        return f(*args, **kwargs)
    return decorated


# ── Config helpers ────────────────────────────────────────────────────────


def _load_yaml(filename: str) -> dict:
    import yaml

    path = CONFIG_DIR / filename
    if not path.exists():
        logger.warning("Config file not found: %s", path)
        return {}
    with open(path, "r") as f:
        return yaml.safe_load(f) or {}


def _load_credentials() -> dict:
    """Load credentials from yaml (local) or env vars (Sevalla)."""
    yaml_path = CONFIG_DIR / "credentials.yaml"

    if yaml_path.exists():
        import yaml
        with open(yaml_path) as f:
            creds = yaml.safe_load(f) or {}
        if creds:
            logger.info("Credentials: loaded from credentials.yaml")
            return creds

    logger.info("Credentials: credentials.yaml not found, loading from environment variables")

    ac_url = os.environ.get("AC_API_URL", "")
    ac_key = os.environ.get("AC_API_KEY", "")

    logger.info("Credentials: AC_API_URL=%s AC_API_KEY length=%d",
                ac_url, len(ac_key))

    return {
        "activecampaign": {
            "api_url": ac_url,
            "api_key": ac_key,
        },
        "google_ads": {
            "developer_token": os.environ.get("GOOGLE_ADS_DEVELOPER_TOKEN", ""),
            "client_id": os.environ.get("GOOGLE_ADS_CLIENT_ID", ""),
            "client_secret": os.environ.get("GOOGLE_ADS_CLIENT_SECRET", ""),
            "refresh_token": os.environ.get("GOOGLE_ADS_REFRESH_TOKEN", ""),
            "customer_id": os.environ.get("GOOGLE_ADS_CUSTOMER_ID", ""),
            "login_customer_id": os.environ.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID", ""),
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


# ── Quarter helpers ───────────────────────────────────────────────────────


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


def _days_remaining_in_quarter(quarter: str | None = None, year: int | None = None) -> int:
    q = quarter or _current_quarter()
    _, end = _quarter_dates(q, year)
    return max((end - datetime.now()).days, 0)


def _pipeline_config(thresholds: dict) -> dict:
    ac_cfg = thresholds.get("activecampaign", {})
    return {
        "pipeline_id": ac_cfg.get("primary_pipeline_id"),
        "pipeline_name": ac_cfg.get("pipeline_name", "All Pipelines"),
    }


# ── Connector factories ──────────────────────────────────────────────────


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
        "developer_token", "client_id", "client_secret",
        "refresh_token", "customer_id", "login_customer_id",
    ]
    if not all(ga.get(k) for k in required):
        return None
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


# ── Live data fetchers ───────────────────────────────────────────────────


def _fetch_ac_data(
    creds: dict,
    pipeline_id: int | None = None,
) -> dict:
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
            result["contacts"] = ac.fetch_contacts_with_deals(
                pipeline_id=pipeline_id, limit=5000,
            )

            if pipeline_id is not None:
                result["deals"] = ac.fetch_deals_by_pipeline(pipeline_id, limit=1000)
                try:
                    result["pipeline_stages"] = ac.get_pipeline_stages(pipeline_id)
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


# ── Monte Carlo simulation ───────────────────────────────────────────────


def _run_monte_carlo(
    current_value: float,
    daily_pace: float,
    days_remaining: int,
    target: float,
    simulations: int = 1000,
    volatility: float = 0.15,
) -> dict:
    """Run Monte Carlo simulation for revenue attainment."""
    if days_remaining <= 0 or daily_pace <= 0:
        return {
            "p10": current_value,
            "p50": current_value,
            "p90": current_value,
            "attainment_probability": 1.0 if current_value >= target else 0.0,
            "simulations": simulations,
        }

    results = []
    for _ in range(simulations):
        total = current_value
        for _ in range(days_remaining):
            daily = daily_pace * (1 + random.gauss(0, volatility))
            total += max(daily, 0)
        results.append(total)

    results.sort()
    hit_target = sum(1 for r in results if r >= target)

    return {
        "p10": round(results[int(len(results) * 0.10)], 2),
        "p50": round(results[int(len(results) * 0.50)], 2),
        "p90": round(results[int(len(results) * 0.90)], 2),
        "attainment_probability": round(hit_target / simulations, 4),
        "simulations": simulations,
    }


def _calculate_velocity(deals: list) -> dict:
    """Calculate deal velocity trend from deal creation dates."""
    if not deals:
        return {"trend": "no_data", "wow_growth_rates": []}

    # Group deals by ISO week
    weekly: dict[str, int] = {}
    for deal in deals:
        date_str = deal.get("cdate") or deal.get("mdate") or deal.get("created_timestamp")
        if not date_str:
            continue
        try:
            dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
        except (ValueError, TypeError):
            try:
                dt = datetime.strptime(str(date_str)[:10], "%Y-%m-%d")
            except (ValueError, TypeError):
                continue
        week_key = dt.strftime("%Y-W%W")
        weekly[week_key] = weekly.get(week_key, 0) + 1

    sorted_weeks = sorted(weekly.items())
    if len(sorted_weeks) < 2:
        return {"trend": "insufficient_data", "wow_growth_rates": []}

    growth_rates = []
    for i in range(1, len(sorted_weeks)):
        prev = sorted_weeks[i - 1][1]
        curr = sorted_weeks[i][1]
        rate = (curr - prev) / prev if prev > 0 else 0
        growth_rates.append(round(rate, 4))

    avg_growth = sum(growth_rates) / len(growth_rates) if growth_rates else 0
    if avg_growth > 0.05:
        trend = "accelerating"
    elif avg_growth < -0.05:
        trend = "decelerating"
    else:
        trend = "steady"

    return {"trend": trend, "wow_growth_rates": growth_rates[-8:]}


# ── API Routes ────────────────────────────────────────────────────────────


@api_bp.route("/api/health")
def api_health():
    return jsonify({
        "status": "ok",
        "timestamp": datetime.now().isoformat(),
        "version": "1.0.0",
    })


@api_bp.route("/api/dashboard")
@require_service_token
def api_dashboard():
    try:
        thresholds = _load_thresholds()
        creds = _load_credentials()
        pcfg = _pipeline_config(thresholds)

        # Pipeline selector — accept ?pipeline_id= or default to thresholds
        pipeline_id = request.args.get("pipeline_id", type=int)
        if pipeline_id is None:
            pipeline_id = pcfg["pipeline_id"]

        quarter = _current_quarter()
        year = datetime.now().year
        quarter_key = f"{quarter.lower()}_target"
        revenue_target = thresholds.get("revenue", {}).get(quarter_key, 0)
        q_start, q_end = _quarter_dates(quarter)
        days_left = _days_remaining_in_quarter()

        # Fetch live data filtered to selected pipeline
        ac = _fetch_ac_data(creds, pipeline_id=pipeline_id)
        contacts = ac["contacts"]
        deals = ac["deals"]
        pipeline_stages = ac["pipeline_stages"]
        pipeline_value = sum(float(d.get("value", 0)) for d in deals)

        # Currency split
        currency_buckets: dict[str, float] = {}
        for d in deals:
            cur = d.get("currency", "usd").lower()
            currency_buckets[cur] = currency_buckets.get(cur, 0.0) + float(d.get("value", 0))

        # Google Ads connectivity
        gads_connected = False
        try:
            gads = _build_google_ads(creds)
            if gads and gads.test_connection():
                gads_connected = True
        except Exception:
            pass

        # Available pipelines for selector
        available_pipelines = []
        try:
            ac_conn = _build_activecampaign(creds)
            if ac_conn:
                available_pipelines = ac_conn.fetch_all_pipelines()
        except Exception:
            pass

        # Resolve pipeline name
        pipeline_name = pcfg["pipeline_name"]
        for p in available_pipelines:
            if p["id"] == pipeline_id:
                pipeline_name = p["title"]
                break

        # Revenue calculations
        from agents.revenue_analyst.calculator import RevenueCalculator

        avg_deal = thresholds.get("deal_size", {}).get("average", 1200)
        calc = RevenueCalculator(default_avg_deal_size=avg_deal)

        gap = calc.calculate_gap(
            target=revenue_target, current=pipeline_value, time_remaining=days_left,
        )
        leads = calc.calculate_leads_needed(
            revenue_target=max(revenue_target - pipeline_value, 0),
            conversion_rates=thresholds.get("conversion_rates"),
        )
        funnel = calc.analyze_funnel(contacts, deals, pipeline_stages)

        pct = gap.get("pct_complete", 0)
        if pct >= 90:
            status = "on_track"
        elif pct >= 60:
            status = "monitor"
        else:
            status = "behind"

        return jsonify({
            "quarter": quarter,
            "year": year,
            "pipeline": {
                "name": pipeline_name,
                "id": pipeline_id,
                "value": round(pipeline_value, 2),
                "pipeline_value_by_currency": {
                    k: round(v, 2) for k, v in currency_buckets.items()
                },
                "target": revenue_target,
                "pct_complete": round(pct, 1),
                "status": status,
                "days_remaining": days_left,
            },
            "funnel": {
                "stage_breakdown": funnel.get("stage_breakdown", []),
                "conversion_rates": funnel.get("conversion_rates", {}),
                "total_contacts": funnel.get("total_contacts", 0),
                "hiros": funnel.get("hiros", 0),
            },
            "leads_needed": {
                "contacts_needed": leads.get("contacts_needed", 0),
                "deals_needed": leads.get("deals_needed", 0),
                "mql_needed": leads.get("mql_needed", 0),
                "engaged_needed": leads.get("engaged_needed", 0),
            },
            "gap": {
                "gap": gap.get("gap", 0),
                "required_daily_pace": gap.get("required_daily_pace", 0),
                "on_track": gap.get("on_track", False),
                "status": gap.get("status", "behind"),
            },
            "connections": {
                "activecampaign": ac["connected"],
                "google_ads": gads_connected,
            },
            "available_pipelines": available_pipelines,
            "generated_at": datetime.now().isoformat(),
        })
    except Exception as e:
        logger.exception("Dashboard API error")
        return jsonify({"error": str(e), "status": 500}), 500


@api_bp.route("/api/forecast")
@require_service_token
def api_forecast():
    try:
        quarter = request.args.get("quarter", _current_quarter())
        year = int(request.args.get("year", datetime.now().year))
        simulations = int(request.args.get("simulations", 1000))
        volatility = float(request.args.get("volatility", 0.15))

        thresholds = _load_thresholds()
        creds = _load_credentials()
        pcfg = _pipeline_config(thresholds)

        # Pipeline selector
        pipeline_id = request.args.get("pipeline_id", type=int)
        if pipeline_id is None:
            pipeline_id = pcfg["pipeline_id"]

        quarter_key = f"{quarter.lower()}_target"
        revenue_target = thresholds.get("revenue", {}).get(quarter_key, 0)
        q_start, q_end = _quarter_dates(quarter, year)
        days_left = _days_remaining_in_quarter(quarter, year)

        # Fetch live pipeline data
        ac = _fetch_ac_data(creds, pipeline_id=pipeline_id)
        deals = ac["deals"]
        pipeline_value = sum(float(d.get("value", 0)) for d in deals)

        # Calculate daily pace from elapsed time
        total_days_in_quarter = (q_end - q_start).days
        elapsed = total_days_in_quarter - days_left
        daily_pace = pipeline_value / elapsed if elapsed > 0 else 0

        # Attainment score
        pct = (pipeline_value / revenue_target * 100) if revenue_target else 0
        if pct >= 90:
            band = "on_track"
            label = "On Track \U0001f7e2"
        elif pct >= 60:
            band = "monitor"
            label = "Monitor \U0001f7e1"
        else:
            band = "behind"
            label = "Behind \U0001f534"

        # Monte Carlo simulation
        mc = _run_monte_carlo(
            current_value=pipeline_value,
            daily_pace=daily_pace,
            days_remaining=days_left,
            target=revenue_target,
            simulations=simulations,
            volatility=volatility,
        )

        # Velocity
        velocity = _calculate_velocity(deals)

        return jsonify({
            "quarter": quarter,
            "year": year,
            "attainment": {
                "score": round(pct, 1),
                "band": band,
                "label": label,
                "current_value": round(pipeline_value, 2),
                "target": revenue_target,
            },
            "monte_carlo": mc,
            "velocity": velocity,
            "generated_at": datetime.now().isoformat(),
        })
    except Exception as e:
        logger.exception("Forecast API error")
        return jsonify({"error": str(e), "status": 500}), 500


@api_bp.route("/api/campaigns")
@require_service_token
def api_campaigns():
    try:
        thresholds = _load_thresholds()
        creds = _load_credentials()

        start_date_str = request.args.get("start_date")
        end_date_str = request.args.get("end_date")

        if start_date_str and end_date_str:
            q_start = datetime.strptime(start_date_str, "%Y-%m-%d")
            q_end = datetime.strptime(end_date_str, "%Y-%m-%d")
        else:
            quarter = _current_quarter()
            q_start, q_end = _quarter_dates(quarter)

        gads = _fetch_gads_data(creds, q_start, q_end)
        if not gads["connected"]:
            return jsonify({
                "campaigns": [],
                "metrics": {},
                "connected": False,
            })

        cpa_thresholds = thresholds.get(
            "cpa", {"excellent": 75, "warning": 200, "critical": 300}
        )

        enriched = []
        for c in gads["campaigns"]:
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

            enriched.append({
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
                "cpa_status": cpa_status,
            })

        return jsonify({
            "campaigns": enriched,
            "metrics": gads["metrics"],
            "connected": True,
        })
    except Exception as e:
        logger.exception("Campaigns API error")
        return jsonify({"error": str(e), "status": 500}), 500


@api_bp.route("/api/automate", methods=["POST"])
@require_service_token
def api_automate():
    try:
        body = request.get_json(silent=True) or {}
        dry_run = body.get("dry_run", True)
        action_filter = body.get("action", "all")

        from agents.automation_engine.executor import from_config as executor_from_config

        executor = executor_from_config()

        # Get recommendations from strategic advisor if Google Ads is connected
        creds = _load_credentials()
        thresholds = _load_thresholds()
        quarter = _current_quarter()
        q_start, q_end = _quarter_dates(quarter)

        gads = _fetch_gads_data(creds, q_start, q_end)
        if not gads["connected"] or not gads["campaigns"]:
            return jsonify({
                "dry_run": dry_run,
                "actions_executed": [],
                "actions_pending_approval": [],
                "total_estimated_impact": {"savings": "$0", "reallocated": "$0"},
                "message": "No Google Ads campaigns connected — nothing to automate",
            })

        cpa_thresholds = thresholds.get(
            "cpa", {"excellent": 75, "warning": 200, "critical": 300}
        )

        from agents.strategic_advisor.campaign_analyzer import CampaignAnalyzer

        analyzer = CampaignAnalyzer()
        analysis = analyzer.analyze_campaigns(gads["campaigns"], cpa_thresholds)
        recommendations = analyzer.generate_recommendations(analysis)

        # Flatten all recommendations into actionable list
        all_recs = (
            recommendations.get("immediate_actions", [])
            + recommendations.get("strategic_adjustments", [])
        )

        # Filter by action type if specified
        if action_filter and action_filter != "all":
            filter_upper = action_filter.upper()
            all_recs = [r for r in all_recs if filter_upper in r.get("action", "")]

        result = executor.execute_recommendations(all_recs, dry_run=dry_run)
        return jsonify(result)
    except Exception as e:
        logger.exception("Automate API error")
        return jsonify({"error": str(e), "status": 500}), 500


@api_bp.route("/api/rollback", methods=["POST"])
@require_service_token
def api_rollback():
    try:
        body = request.get_json(silent=True) or {}
        dry_run = body.get("dry_run", True)

        from agents.automation_engine.executor import from_config as executor_from_config

        executor = executor_from_config()
        result = executor.rollback_last_action(dry_run=dry_run)
        return jsonify(result)
    except Exception as e:
        logger.exception("Rollback API error")
        return jsonify({"error": str(e), "status": 500}), 500


@api_bp.route("/api/automation-log")
@require_service_token
def api_automation_log():
    try:
        tail = int(request.args.get("tail", 20))
        action_filter = request.args.get("action", "all")

        entries = []

        if EXECUTION_LOG_PATH.exists():
            with open(EXECUTION_LOG_PATH, "r") as f:
                lines = f.readlines()

            for line in lines:
                line = line.strip()
                if not line:
                    continue
                # Parse log format: "TIMESTAMP | LEVEL | MESSAGE"
                parts = line.split(" | ", 2)
                if len(parts) >= 3:
                    entry = {
                        "timestamp": parts[0].strip(),
                        "level": parts[1].strip(),
                        "message": parts[2].strip(),
                    }
                    # Try to extract action and campaign from message
                    msg = parts[2].strip()
                    entry["action"] = _extract_log_field(msg, "action")
                    entry["campaign"] = _extract_log_field(msg, "campaign")
                    entry["status"] = _extract_log_field(msg, "status")
                    entries.append(entry)
                else:
                    entries.append({
                        "timestamp": "",
                        "level": "INFO",
                        "message": line,
                        "action": "",
                        "campaign": "",
                        "status": "",
                    })

        # Filter by action type
        if action_filter and action_filter != "all":
            filter_upper = action_filter.upper()
            entries = [
                e for e in entries
                if filter_upper in e.get("action", "").upper()
                or filter_upper in e.get("message", "").upper()
            ]

        # Return last N entries
        entries = entries[-tail:]

        return jsonify({"entries": entries, "total": len(entries)})
    except Exception as e:
        logger.exception("Automation log API error")
        return jsonify({"error": str(e), "status": 500}), 500


def _extract_log_field(message: str, field: str) -> str:
    """Extract a field value from a structured log message."""
    pattern = rf'{field}[=:]\s*"?([^"|,]+)"?'
    match = re.search(pattern, message, re.IGNORECASE)
    return match.group(1).strip() if match else ""


# ── Shared query-param parser for new analytics endpoints ────────────────


def _parse_time_params(req, thresholds):
    """Parse common time + pipeline params from query string."""
    pipeline_id = req.args.get(
        "pipeline_id",
        thresholds.get("activecampaign", {}).get("primary_pipeline_id"),
        type=int,
    )
    quarter = _current_quarter()
    q_start, q_end = _quarter_dates(quarter)
    start_date = req.args.get("start_date", q_start.strftime("%Y-%m-%d"))
    end_date = req.args.get("end_date", q_end.strftime("%Y-%m-%d"))
    return pipeline_id, start_date, end_date


def _compute_comparison_periods(mode, today):
    """Auto-compute period A / period B dates based on comparison mode."""
    if mode == "mom":
        # Period A = this month, Period B = last month
        a_start = today.replace(day=1)
        a_end = today
        b_end = a_start - timedelta(days=1)
        b_start = b_end.replace(day=1)
    elif mode == "qoq":
        # Period A = this quarter, Period B = last quarter
        q = _current_quarter()
        q_num = int(q[1])
        year = today.year
        a_start, a_end = _quarter_dates(q, year)
        if q_num == 1:
            b_start, b_end = _quarter_dates("Q4", year - 1)
        else:
            b_start, b_end = _quarter_dates(f"Q{q_num - 1}", year)
    elif mode == "yoy":
        # Period A = this quarter, Period B = same quarter last year
        q = _current_quarter()
        year = today.year
        a_start, a_end = _quarter_dates(q, year)
        b_start, b_end = _quarter_dates(q, year - 1)
    else:
        raise ValueError(f"Unknown comparison mode: {mode}")

    return (
        a_start.strftime("%Y-%m-%d"),
        a_end.strftime("%Y-%m-%d"),
        b_start.strftime("%Y-%m-%d"),
        b_end.strftime("%Y-%m-%d"),
    )


def _period_label(mode, start_str, end_str):
    """Generate a human-readable label for a comparison period."""
    start = datetime.strptime(start_str, "%Y-%m-%d")
    if mode == "mom":
        return start.strftime("%B %Y")
    elif mode in ("qoq", "yoy"):
        q_num = (start.month - 1) // 3 + 1
        return f"Q{q_num} {start.year}"
    return f"{start_str} to {end_str}"


# ── New Analytics Endpoints ──────────────────────────────────────────────


@api_bp.route("/api/pipeline-health")
@require_service_token
def pipeline_health():
    try:
        thresholds = _load_thresholds()
        creds = _load_credentials()
        pipeline_id = request.args.get(
            "pipeline_id",
            thresholds.get("activecampaign", {}).get("primary_pipeline_id"),
            type=int,
        )
        stall_threshold_days = request.args.get("stall_threshold_days", 14, type=int)

        ac = _build_activecampaign(creds)
        if not ac or not ac.test_connection():
            return jsonify({
                "pipeline_id": pipeline_id,
                "stall_threshold_days": stall_threshold_days,
                "error": "ActiveCampaign not connected",
                "generated_at": datetime.now().isoformat(),
            })

        data = ac.fetch_pipeline_health(pipeline_id, stall_threshold_days)
        return jsonify({
            "pipeline_id": pipeline_id,
            "stall_threshold_days": stall_threshold_days,
            **data,
            "generated_at": datetime.now().isoformat(),
        })
    except Exception as e:
        logger.exception("Pipeline health API error")
        return jsonify({"error": str(e), "status": 500}), 500


@api_bp.route("/api/velocity")
@require_service_token
def velocity():
    try:
        thresholds = _load_thresholds()
        creds = _load_credentials()
        pipeline_id = request.args.get(
            "pipeline_id",
            thresholds.get("activecampaign", {}).get("primary_pipeline_id"),
            type=int,
        )
        days = request.args.get("days", 90, type=int)

        ac = _build_activecampaign(creds)
        if not ac or not ac.test_connection():
            return jsonify({
                "pipeline_id": pipeline_id,
                "days_analyzed": days,
                "stages": [],
                "generated_at": datetime.now().isoformat(),
            })

        stages = ac.fetch_stage_velocity(pipeline_id, days)

        # Pipeline name
        pipeline_name = "Pipeline " + str(pipeline_id)
        try:
            pipeline_stages_meta = ac.get_pipeline_stages(pipeline_id)
            if pipeline_stages_meta:
                pipelines = ac.fetch_all_pipelines()
                for p in pipelines:
                    if p.get("id") == pipeline_id or str(p.get("id")) == str(pipeline_id):
                        pipeline_name = p.get("title", pipeline_name)
                        break
        except Exception:
            pass

        # Creation to close: sum of avg_days across all stages
        creation_to_close = sum(s.get("avg_days_in_stage", 0) for s in stages)

        return jsonify({
            "pipeline_id": pipeline_id,
            "pipeline_name": pipeline_name,
            "days_analyzed": days,
            "stages": stages,
            "creation_to_close_avg_days": round(creation_to_close, 1),
            "generated_at": datetime.now().isoformat(),
        })
    except Exception as e:
        logger.exception("Velocity API error")
        return jsonify({"error": str(e), "status": 500}), 500


@api_bp.route("/api/acquisition")
@require_service_token
def acquisition():
    try:
        thresholds = _load_thresholds()
        creds = _load_credentials()
        pipeline_id = request.args.get(
            "pipeline_id",
            thresholds.get("activecampaign", {}).get("primary_pipeline_id"),
            type=int,
        )

        ac = _build_activecampaign(creds)
        if not ac or not ac.test_connection():
            return jsonify({
                "total_contacts_with_utm": 0,
                "by_source": [],
                "by_medium": [],
                "by_campaign": [],
                "top_campaigns": [],
                "generated_at": datetime.now().isoformat(),
            })

        contacts = ac.fetch_contacts_with_utm(pipeline_id)

        # Aggregate by source
        source_counts: dict[str, int] = {}
        medium_counts: dict[str, int] = {}
        campaign_details: dict[str, dict] = {}

        for c in contacts:
            src = (c.get("utm_source") or "unknown").lower()
            med = (c.get("utm_medium") or "unknown").lower()
            camp = c.get("utm_campaign") or "unknown"

            source_counts[src] = source_counts.get(src, 0) + 1
            medium_counts[med] = medium_counts.get(med, 0) + 1

            camp_key = f"{camp}|{src}|{med}"
            if camp_key not in campaign_details:
                campaign_details[camp_key] = {
                    "campaign": camp,
                    "source": src,
                    "medium": med,
                    "count": 0,
                }
            campaign_details[camp_key]["count"] += 1

        total = len(contacts)

        by_source = sorted(
            [
                {"name": k, "count": v, "pct": round(v / total * 100, 1) if total else 0.0}
                for k, v in source_counts.items()
            ],
            key=lambda x: x["count"],
            reverse=True,
        )
        by_medium = sorted(
            [
                {"name": k, "count": v, "pct": round(v / total * 100, 1) if total else 0.0}
                for k, v in medium_counts.items()
            ],
            key=lambda x: x["count"],
            reverse=True,
        )
        by_campaign = sorted(
            [
                {"name": v["campaign"], "source": v["source"], "medium": v["medium"], "count": v["count"]}
                for v in campaign_details.values()
            ],
            key=lambda x: x["count"],
            reverse=True,
        )

        return jsonify({
            "total_contacts": total,
            "total_contacts_with_utm": total,
            "by_source": by_source,
            "by_medium": by_medium,
            "campaigns": by_campaign,
            "by_campaign": by_campaign,
            "top_campaigns": by_campaign[:10],
            "generated_at": datetime.now().isoformat(),
        })
    except Exception as e:
        logger.exception("Acquisition API error")
        return jsonify({"error": str(e), "status": 500}), 500


@api_bp.route("/api/rep-performance")
@require_service_token
def rep_performance():
    try:
        thresholds = _load_thresholds()
        creds = _load_credentials()
        pipeline_id, start_date, end_date = _parse_time_params(request, thresholds)

        ac = _build_activecampaign(creds)
        if not ac or not ac.test_connection():
            return jsonify({
                "pipeline_id": pipeline_id,
                "period": {"start": start_date, "end": end_date},
                "reps": [],
                "totals": {
                    "total_deals": 0,
                    "total_pipeline_value": 0.0,
                    "total_won_value": 0.0,
                    "overall_win_rate": 0.0,
                },
                "generated_at": datetime.now().isoformat(),
            })

        reps = ac.fetch_deals_by_owner(pipeline_id, start_date, end_date)

        # Sort by pipeline_value descending
        reps = sorted(reps, key=lambda r: r.get("pipeline_value", 0), reverse=True)

        # Compute totals
        total_deals = sum(r.get("total_deals", 0) for r in reps)
        total_pipeline = sum(r.get("pipeline_value", 0) for r in reps)
        total_won = sum(r.get("won_value", 0) for r in reps)
        total_won_deals = sum(r.get("won_deals", 0) for r in reps)
        overall_win_rate = round(total_won_deals / total_deals * 100, 1) if total_deals else 0.0

        return jsonify({
            "pipeline_id": pipeline_id,
            "period": {"start": start_date, "end": end_date},
            "reps": reps,
            "totals": {
                "total_deals": total_deals,
                "total_pipeline_value": round(total_pipeline, 2),
                "total_won_value": round(total_won, 2),
                "overall_win_rate": overall_win_rate,
            },
            "generated_at": datetime.now().isoformat(),
        })
    except Exception as e:
        logger.exception("Rep performance API error")
        return jsonify({"error": str(e), "status": 500}), 500


@api_bp.route("/api/forecast-weighted")
@require_service_token
def forecast_weighted():
    try:
        thresholds = _load_thresholds()
        creds = _load_credentials()
        pipeline_id, start_date, end_date = _parse_time_params(request, thresholds)

        # Stage probability weights (position-based)
        configured_weights = thresholds.get("stage_weights")
        STAGE_WEIGHTS = {
            0: 0.10,
            1: 0.25,
            2: 0.50,
            3: 0.75,
            4: 0.90,
        }
        if configured_weights and isinstance(configured_weights, dict):
            STAGE_WEIGHTS.update({int(k): float(v) for k, v in configured_weights.items()})

        ac = _build_activecampaign(creds)
        if not ac or not ac.test_connection():
            return jsonify({
                "pipeline_id": pipeline_id,
                "period": {"start": start_date, "end": end_date},
                "raw_pipeline_value": 0.0,
                "weighted_forecast": 0.0,
                "by_close_date": [],
                "coverage_ratio": 0.0,
                "remaining_target": 0.0,
                "currency_breakdown": {},
                "generated_at": datetime.now().isoformat(),
            })

        # Fetch open deals and stage info
        deals = ac.fetch_deals_for_range(start_date, end_date, pipeline_id)
        # fetch_deals_with_stages returns (deals_list, stages_list) tuple
        _, pipeline_stages = ac.fetch_deals_with_stages(pipeline_id=pipeline_id)

        # Build stage position map from pipeline stages
        stage_order = {}
        for idx, s in enumerate(pipeline_stages):
            sid = str(s.get("id", ""))
            if sid:
                stage_order[sid] = idx

        raw_total = 0.0
        weighted_total = 0.0
        monthly: dict[str, dict] = {}
        currency_raw: dict[str, float] = {}
        currency_weighted: dict[str, float] = {}

        for deal in deals:
            # Only open deals (status 0)
            status = deal.get("status")
            if str(status) != "0":
                continue

            value = float(deal.get("value", 0))
            stage_id = str(deal.get("stage", deal.get("stage_id", "")))
            currency = (deal.get("currency", "usd") or "usd").lower()

            # Determine stage position and weight
            pos = stage_order.get(stage_id, 0)
            weight = STAGE_WEIGHTS.get(pos, 0.90 if pos >= 4 else STAGE_WEIGHTS.get(min(pos, 4), 0.10))

            weighted_value = value * weight
            raw_total += value
            weighted_total += weighted_value

            # Currency breakdown
            currency_raw[currency] = currency_raw.get(currency, 0.0) + value
            currency_weighted[currency] = currency_weighted.get(currency, 0.0) + weighted_value

            # Group by close month
            close_date = deal.get("close_date") or deal.get("expected_close") or ""
            if close_date:
                try:
                    month_key = close_date[:7]  # YYYY-MM
                except (TypeError, IndexError):
                    month_key = "unknown"
            else:
                month_key = "unknown"

            if month_key not in monthly:
                monthly[month_key] = {"month": month_key, "deals": 0, "raw_value": 0.0, "weighted_value": 0.0}
            monthly[month_key]["deals"] += 1
            monthly[month_key]["raw_value"] += value
            monthly[month_key]["weighted_value"] += weighted_value

        # Round monthly values
        by_close_date = sorted(monthly.values(), key=lambda x: x["month"])
        for m in by_close_date:
            m["raw_value"] = round(m["raw_value"], 2)
            m["weighted_value"] = round(m["weighted_value"], 2)

        # Remaining target
        quarter_key = f"{_current_quarter().lower()}_target"
        revenue_target = thresholds.get("revenue", {}).get(quarter_key, 0)
        remaining_target = max(revenue_target - raw_total, 0)
        coverage_ratio = round(weighted_total / remaining_target, 2) if remaining_target > 0 else 0.0

        currency_breakdown = {}
        for cur in set(list(currency_raw.keys()) + list(currency_weighted.keys())):
            currency_breakdown[cur] = {
                "raw": round(currency_raw.get(cur, 0.0), 2),
                "weighted": round(currency_weighted.get(cur, 0.0), 2),
            }

        # Alias monthly data for renderer (expects raw/weighted keys)
        by_month = []
        for m in by_close_date:
            by_month.append({
                "month": m["month"],
                "label": m["month"],
                "deals": m["deals"],
                "raw": m["raw_value"],
                "value": m["raw_value"],
                "weighted": m["weighted_value"],
                "raw_value": m["raw_value"],
                "weighted_value": m["weighted_value"],
            })

        gap_to_weighted = weighted_total - remaining_target

        # Currency convenience fields for renderer
        usd_raw = currency_raw.get("usd", 0.0)
        usd_weighted = currency_weighted.get("usd", 0.0)
        cad_raw = currency_raw.get("cad", 0.0)
        cad_weighted = currency_weighted.get("cad", 0.0)

        # Exchange rate for CAD→USD conversion
        cad_to_usd = thresholds.get("currency", {}).get("cad_to_usd_rate", 0.73)

        return jsonify({
            "pipeline_id": pipeline_id,
            "period": {"start": start_date, "end": end_date},
            "raw_pipeline": round(raw_total, 2),
            "raw_pipeline_value": round(raw_total, 2),
            "weighted_forecast": round(weighted_total, 2),
            "by_close_date": by_close_date,
            "by_month": by_month,
            "coverage_ratio": coverage_ratio,
            "remaining_target": round(remaining_target, 2),
            "gap_to_weighted": round(gap_to_weighted, 2),
            "currency_breakdown": currency_breakdown,
            "usd_raw": round(usd_raw, 2),
            "usd_weighted": round(usd_weighted, 2),
            "cad_raw": round(cad_raw, 2),
            "cad_weighted": round(cad_weighted, 2),
            "cad_to_usd_rate": cad_to_usd,
            "generated_at": datetime.now().isoformat(),
        })
    except Exception as e:
        logger.exception("Forecast weighted API error")
        return jsonify({"error": str(e), "status": 500}), 500


@api_bp.route("/api/cohorts")
@require_service_token
def cohorts():
    try:
        creds = _load_credentials()
        months = request.args.get("months", 12, type=int)

        ac = _build_activecampaign(creds)
        if not ac or not ac.test_connection():
            return jsonify({
                "months_analyzed": months,
                "cohorts": [],
                "summary": {
                    "avg_conversion_rate": 0.0,
                    "avg_days_to_convert": 0.0,
                    "best_cohort": None,
                    "worst_cohort": None,
                    "trend": "stable",
                },
                "generated_at": datetime.now().isoformat(),
            })

        raw_cohort_data = ac.fetch_cohort_data(months)

        # Normalise cohort fields: add 'month' alias from 'cohort_month',
        # pretty-print month labels, guard value against NaN
        cohort_data = []
        for c in raw_cohort_data:
            cm = c.get("cohort_month", "")
            # Pretty label: "2026-01" → "Jan 2026"
            try:
                from calendar import month_abbr
                parts = cm.split("-")
                pretty = month_abbr[int(parts[1])] + " " + parts[0] if len(parts) == 2 else cm
            except Exception:
                pretty = cm
            cohort_data.append({
                **c,
                "month": pretty,
                "cohort": pretty,
                "contacts": c.get("contacts_created", 0),
                "converted": c.get("converted_to_hiro", 0),
                "won_value": float(c.get("total_value_won", 0) or 0),
                "conversion_rate": round((c.get("conversion_rate", 0) or 0) * 100, 1),
            })

        # Build summary
        conversion_rates = [c.get("conversion_rate", 0) for c in cohort_data if c.get("conversion_rate") is not None]
        days_to_convert = [c.get("avg_days_to_convert", 0) for c in cohort_data if c.get("avg_days_to_convert") is not None]

        avg_conv = round(sum(conversion_rates) / len(conversion_rates), 2) if conversion_rates else 0.0
        avg_days = round(sum(days_to_convert) / len(days_to_convert), 1) if days_to_convert else 0.0

        best_cohort = None
        worst_cohort = None
        if cohort_data:
            by_conv = sorted(cohort_data, key=lambda c: c.get("conversion_rate", 0), reverse=True)
            best_cohort = {"month": by_conv[0].get("month", ""), "conversion_rate": by_conv[0].get("conversion_rate", 0)}
            worst_cohort = {"month": by_conv[-1].get("month", ""), "conversion_rate": by_conv[-1].get("conversion_rate", 0)}

        # Trend: compare avg conversion rate of last 3 months vs previous 3 months
        trend = "stable"
        if len(cohort_data) >= 6:
            recent_3 = cohort_data[-3:]
            prev_3 = cohort_data[-6:-3]
            recent_avg = sum(c.get("conversion_rate", 0) for c in recent_3) / 3
            prev_avg = sum(c.get("conversion_rate", 0) for c in prev_3) / 3
            if prev_avg > 0:
                delta_pct = ((recent_avg - prev_avg) / prev_avg) * 100
                if delta_pct > 5:
                    trend = "improving"
                elif delta_pct < -5:
                    trend = "declining"

        return jsonify({
            "months_analyzed": months,
            "cohorts": cohort_data,
            "trend": trend,
            "best_cohort": best_cohort,
            "worst_cohort": worst_cohort,
            "avg_days_to_convert": avg_days,
            "summary": {
                "avg_conversion_rate": avg_conv,
                "avg_days_to_convert": avg_days,
                "best_cohort": best_cohort,
                "worst_cohort": worst_cohort,
                "trend": trend,
            },
            "generated_at": datetime.now().isoformat(),
        })
    except Exception as e:
        logger.exception("Cohorts API error")
        return jsonify({"error": str(e), "status": 500}), 500


@api_bp.route("/api/compare")
@require_service_token
def compare():
    try:
        thresholds = _load_thresholds()
        creds = _load_credentials()
        pipeline_id = request.args.get(
            "pipeline_id",
            thresholds.get("activecampaign", {}).get("primary_pipeline_id"),
            type=int,
        )
        mode = request.args.get("mode", "qoq")

        today = datetime.now()

        if mode == "custom":
            a_start = request.args.get("period_a_start")
            a_end = request.args.get("period_a_end")
            b_start = request.args.get("period_b_start")
            b_end = request.args.get("period_b_end")
            if not all([a_start, a_end, b_start, b_end]):
                return jsonify({
                    "error": "Custom mode requires period_a_start, period_a_end, period_b_start, period_b_end",
                }), 400
            a_label = f"{a_start} to {a_end}"
            b_label = f"{b_start} to {b_end}"
        else:
            a_start, a_end, b_start, b_end = _compute_comparison_periods(mode, today)
            a_label = _period_label(mode, a_start, a_end)
            b_label = _period_label(mode, b_start, b_end)

        ac = _build_activecampaign(creds)
        if not ac or not ac.test_connection():
            return jsonify({
                "mode": mode,
                "period_a_label": a_label,
                "period_b_label": b_label,
                "error": "ActiveCampaign not connected",
                "generated_at": datetime.now().isoformat(),
            })

        data = ac.fetch_period_comparison(pipeline_id, a_start, a_end, b_start, b_end)

        return jsonify({
            "mode": mode,
            "period_a_label": a_label,
            "period_b_label": b_label,
            **data,
            "generated_at": datetime.now().isoformat(),
        })
    except Exception as e:
        logger.exception("Compare API error")
        return jsonify({"error": str(e), "status": 500}), 500


@api_bp.route("/api/deals")
@require_service_token
def deals():
    try:
        thresholds = _load_thresholds()
        creds = _load_credentials()
        pipeline_id, start_date, end_date = _parse_time_params(request, thresholds)

        status_filter = request.args.get("status", "all")
        owner_id = request.args.get("owner_id", type=int)
        stage_id = request.args.get("stage_id", type=int)
        limit = request.args.get("limit", 50, type=int)
        offset = request.args.get("offset", 0, type=int)

        ac = _build_activecampaign(creds)
        if not ac or not ac.test_connection():
            return jsonify({
                "deals": [],
                "total": 0,
                "limit": limit,
                "offset": offset,
                "has_more": False,
            })

        all_deals = ac.fetch_deals_for_range(start_date, end_date, pipeline_id)

        # Apply filters
        if status_filter != "all":
            all_deals = [d for d in all_deals if str(d.get("status")) == str(status_filter)]
        if owner_id is not None:
            all_deals = [d for d in all_deals if str(d.get("owner", d.get("owner_id", ""))) == str(owner_id)]
        if stage_id is not None:
            all_deals = [d for d in all_deals if str(d.get("stage", d.get("stage_id", ""))) == str(stage_id)]

        total = len(all_deals)
        paginated = all_deals[offset:offset + limit]
        has_more = (offset + limit) < total

        return jsonify({
            "deals": paginated,
            "total": total,
            "limit": limit,
            "offset": offset,
            "has_more": has_more,
        })
    except Exception as e:
        logger.exception("Deals API error")
        return jsonify({"error": str(e), "status": 500}), 500


# ── ROI Data (local JSON store) ──────────────────────────────────────────

ROI_DATA_PATH = CONFIG_DIR / "roi_data.json"


def _deep_merge(base: dict, updates: dict) -> dict:
    """Recursively merge *updates* into *base* dict."""
    result = base.copy()
    for key, value in updates.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = _deep_merge(result[key], value)
        else:
            result[key] = value
    return result


@api_bp.route("/api/roi-data")
def roi_data_get():
    if not ROI_DATA_PATH.exists():
        return jsonify({"error": "roi_data.json not found"}), 404
    with open(ROI_DATA_PATH) as f:
        return jsonify(json.load(f))


@api_bp.route("/api/roi-data", methods=["POST"])
def roi_data_update():
    existing = {}
    if ROI_DATA_PATH.exists():
        with open(ROI_DATA_PATH) as f:
            existing = json.load(f)

    updates = request.get_json()
    if not updates:
        return jsonify({"error": "No JSON body"}), 400

    merged = _deep_merge(existing, updates)
    with open(ROI_DATA_PATH, "w") as f:
        json.dump(merged, f, indent=2)

    return jsonify({"status": "saved"})


@api_bp.route("/api/roi-data/add-platform", methods=["POST"])
def roi_data_add_platform():
    body = request.get_json()
    platform = (body or {}).get("platform", "").strip()
    if not platform:
        return jsonify({"error": "platform name required"}), 400

    existing = {}
    if ROI_DATA_PATH.exists():
        with open(ROI_DATA_PATH) as f:
            existing = json.load(f)

    platforms = existing.get("platforms", [])
    if platform in platforms:
        return jsonify({"error": "platform already exists"}), 409
    platforms.append(platform)
    existing["platforms"] = platforms

    # Add to every month in every year
    for year_data in existing.get("years", {}).values():
        for month_data in year_data.get("months", {}).values():
            ad_spend = month_data.get("ad_spend", {})
            if platform not in ad_spend:
                ad_spend[platform] = 0
            month_data["ad_spend"] = ad_spend

    with open(ROI_DATA_PATH, "w") as f:
        json.dump(existing, f, indent=2)

    return jsonify({"status": "added", "platform": platform})


@api_bp.route("/api/roi-data/ltv", methods=["POST"])
def roi_data_ltv():
    body = request.get_json()
    ltv = (body or {}).get("ltv_per_conversion")
    if ltv is None:
        return jsonify({"error": "ltv_per_conversion required"}), 400

    existing = {}
    if ROI_DATA_PATH.exists():
        with open(ROI_DATA_PATH) as f:
            existing = json.load(f)

    existing["ltv_per_conversion"] = float(ltv)
    with open(ROI_DATA_PATH, "w") as f:
        json.dump(existing, f, indent=2)

    return jsonify({"status": "saved", "ltv_per_conversion": float(ltv)})
