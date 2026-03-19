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

api_bp = Blueprint("api", __name__)

# ── Paths ─────────────────────────────────────────────────────────────────

BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent.parent
CONFIG_DIR = PROJECT_DIR / "config"
EXECUTION_LOG_PATH = PROJECT_DIR / "agents" / "automation_engine" / "execution.log"

# ── Service Token Auth ────────────────────────────────────────────────────

SERVICE_TOKEN = os.environ.get("TOOLHUB_SERVICE_TOKEN")


def require_service_token(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not SERVICE_TOKEN:
            return jsonify({"error": "Service token not configured"}), 500
        token = request.headers.get("X-Service-Token", "")
        if not hmac.compare_digest(token, SERVICE_TOKEN):
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
    return _load_yaml("credentials.yaml")


def _load_thresholds() -> dict:
    return _load_yaml("thresholds.yaml")


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
