"""
Cliniconex Marketing Intelligence Center — Web Dashboard Server

Flask-based premium dashboard with real-time data from all agents.
All data comes from live connectors — no demo/fake data.
"""

import csv
import io
import json
import logging
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
    return _load_yaml("credentials.yaml")


def _load_thresholds() -> dict:
    return _load_yaml("thresholds.yaml")


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
    date_start: str | None = None,
    date_end: str | None = None,
) -> dict:
    """Fetch contacts and deals from ActiveCampaign.

    Args:
        creds: Credentials dict.
        pipeline_id: If set, filter deals to this pipeline only.
        date_start: If set, filter contacts created after this date (YYYY-MM-DD).
        date_end: If set, filter contacts created before this date (YYYY-MM-DD).

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

            # Contacts — date-filtered if range provided
            if date_start and date_end:
                result["contacts"] = ac.fetch_contacts_by_date(
                    start_date=date_start,
                    end_date=date_end,
                    limit=1000,
                )
            else:
                result["contacts"] = ac.fetch_contacts(limit=1000)

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


# ── Flask app factory ───────────────────────────────────────────────────────


def create_app() -> Flask:
    """Create and configure the Flask dashboard application."""
    app = Flask(
        __name__,
        template_folder=str(BASE_DIR / "templates"),
        static_folder=str(BASE_DIR / "static"),
    )
    app.config["SECRET_KEY"] = "mic-dashboard-secret"
    CORS(app)

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

        quarter = _current_quarter()
        quarter_key = f"{quarter.lower()}_target"
        revenue_target = thresholds.get("revenue", {}).get(quarter_key, 0)
        q_start, q_end = _quarter_dates(quarter)
        days_left = _days_remaining_in_quarter()

        # Fetch live data filtered to pipeline + quarter
        ac = _fetch_ac_data(
            creds,
            pipeline_id=pcfg["pipeline_id"],
            date_start=q_start.strftime("%Y-%m-%d"),
            date_end=q_end.strftime("%Y-%m-%d"),
        )
        ac_connected = ac["connected"]
        contacts_count = len(ac["contacts"])
        deals_count = len(ac["deals"])
        pipeline_value = sum(float(d.get("value", 0)) for d in ac["deals"])

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

        return jsonify(
            {
                "quarter": quarter,
                "date_range": {
                    "start": q_start.strftime("%Y-%m-%d"),
                    "end": q_end.strftime("%Y-%m-%d"),
                },
                "pipeline": {
                    "id": pcfg["pipeline_id"],
                    "name": pcfg["pipeline_name"],
                },
                "revenue_target": revenue_target,
                "pipeline_value": round(pipeline_value, 2),
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
                "last_updated": datetime.now().isoformat(),
            }
        )

    # ── API: Funnel data ────────────────────────────────────────────────

    @app.route("/api/funnel")
    def api_funnel():
        thresholds = _load_thresholds()
        creds = _load_credentials()
        pcfg = _pipeline_config(thresholds)
        quarter = _current_quarter()
        q_start, q_end = _quarter_dates(quarter)

        # Fetch live data filtered to pipeline + quarter
        ac = _fetch_ac_data(
            creds,
            pipeline_id=pcfg["pipeline_id"],
            date_start=q_start.strftime("%Y-%m-%d"),
            date_end=q_end.strftime("%Y-%m-%d"),
        )
        contacts = ac["contacts"]
        deals = ac["deals"]
        pipeline_stages = ac["pipeline_stages"]
        ac_connected = ac["connected"]

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

        return jsonify(
            {
                "stages": funnel.get("stage_breakdown", []),
                "conversion_rates": funnel.get("conversion_rates", {}),
                "pipeline_value": funnel.get("pipeline_value", 0),
                "avg_deal_size": funnel.get("avg_deal_size", 0),
                "live_data": ac_connected,
            }
        )

    # ── API: Campaigns ──────────────────────────────────────────────────

    @app.route("/api/campaigns")
    def api_campaigns():
        thresholds = _load_thresholds()
        creds = _load_credentials()
        quarter = _current_quarter()
        q_start, q_end = _quarter_dates(quarter)

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
        quarter = _current_quarter()
        q_start, q_end = _quarter_dates(quarter)

        # Try Google Ads daily data first
        gads = _fetch_gads_data(creds, q_start, q_end)
        if gads["connected"] and gads["campaigns"]:
            # Build trend from campaign metrics
            # (Google Ads fetch_campaigns returns aggregate, not daily —
            #  so we return a single summary point per campaign)
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
            return jsonify({"days": trend_days, "live_data": True, "source": "google_ads"})

        # Fall back to ActiveCampaign deal history
        pcfg = _pipeline_config(_load_thresholds())
        ac = _fetch_ac_data(creds, pipeline_id=pcfg["pipeline_id"])
        if ac["connected"] and ac["deals"]:
            trend_days = _build_trend_from_deals(ac["deals"])
            return jsonify(
                {"days": trend_days, "live_data": True, "source": "activecampaign"}
            )

        # No data available
        return jsonify({"days": [], "live_data": False, "source": "none"})

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
