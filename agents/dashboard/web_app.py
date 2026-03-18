"""
Cliniconex Marketing Intelligence Center — Web Dashboard Server

Flask-based premium dashboard with real-time data from all agents.
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
    return GoogleAdsConnector(
        developer_token=ga["developer_token"],
        client_id=ga["client_id"],
        client_secret=ga["client_secret"],
        refresh_token=ga["refresh_token"],
        customer_id=ga["customer_id"],
        login_customer_id=ga["login_customer_id"],
    )


# ── Demo data (used when connectors are unavailable) ───────────────────────


def _demo_campaigns():
    """Realistic demo campaign data for when Google Ads isn't connected."""
    return [
        {
            "id": "1",
            "name": "Brand Awareness - Healthcare",
            "status": "ENABLED",
            "impressions": 145200,
            "clicks": 4356,
            "cost": 8712.00,
            "conversions": 87,
        },
        {
            "id": "2",
            "name": "Long-Term Care Facilities",
            "status": "ENABLED",
            "impressions": 89300,
            "clicks": 2679,
            "cost": 6698.50,
            "conversions": 54,
        },
        {
            "id": "3",
            "name": "Automated Communications",
            "status": "ENABLED",
            "impressions": 67800,
            "clicks": 2034,
            "cost": 5085.00,
            "conversions": 41,
        },
        {
            "id": "4",
            "name": "Family Engagement Platform",
            "status": "ENABLED",
            "impressions": 52100,
            "clicks": 1563,
            "cost": 4689.00,
            "conversions": 28,
        },
        {
            "id": "5",
            "name": "Retargeting - Website Visitors",
            "status": "ENABLED",
            "impressions": 198400,
            "clicks": 5952,
            "cost": 4761.60,
            "conversions": 95,
        },
        {
            "id": "6",
            "name": "Competitor Conquesting",
            "status": "ENABLED",
            "impressions": 34500,
            "clicks": 690,
            "cost": 3450.00,
            "conversions": 7,
        },
        {
            "id": "7",
            "name": "Emergency Notification Demo",
            "status": "PAUSED",
            "impressions": 12300,
            "clicks": 369,
            "cost": 1845.00,
            "conversions": 3,
        },
        {
            "id": "8",
            "name": "DSA - Blog Content",
            "status": "ENABLED",
            "impressions": 78900,
            "clicks": 2367,
            "cost": 3550.50,
            "conversions": 33,
        },
    ]


def _demo_contacts():
    """Demo contact/deal data."""
    return {
        "contacts": [{"id": str(i)} for i in range(1, 851)],
        "deals": [
            {"id": str(i), "value": 1200 + (i * 37) % 800}
            for i in range(1, 68)
        ],
    }


def _demo_trend_data():
    """Generate 30 days of trend data for charts."""
    import random

    random.seed(42)
    base_date = datetime.now() - timedelta(days=30)
    days = []
    cumulative_spend = 0
    for i in range(30):
        date = base_date + timedelta(days=i)
        daily_spend = 800 + random.uniform(-200, 400)
        daily_clicks = int(180 + random.uniform(-40, 80))
        daily_conversions = int(daily_clicks * random.uniform(0.015, 0.045))
        daily_impressions = int(daily_clicks / random.uniform(0.025, 0.04))
        cumulative_spend += daily_spend
        days.append(
            {
                "date": date.strftime("%Y-%m-%d"),
                "label": date.strftime("%b %d"),
                "spend": round(daily_spend, 2),
                "cumulative_spend": round(cumulative_spend, 2),
                "clicks": daily_clicks,
                "conversions": daily_conversions,
                "impressions": daily_impressions,
                "cpa": round(daily_spend / max(daily_conversions, 1), 2),
                "ctr": round(daily_clicks / max(daily_impressions, 1) * 100, 2),
                "conversion_rate": round(
                    daily_conversions / max(daily_clicks, 1) * 100, 2
                ),
            }
        )
    return days


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

        quarter = _current_quarter()
        quarter_key = f"{quarter.lower()}_target"
        revenue_target = thresholds.get("revenue", {}).get(quarter_key, 500000)
        days_left = _days_remaining_in_quarter()

        # Try live data
        pipeline_value = 0
        ac_connected = False
        gads_connected = False
        contacts_count = 0
        deals_count = 0

        try:
            ac = _build_activecampaign(creds)
            if ac and ac.test_connection():
                ac_connected = True
                contacts = ac.fetch_contacts(limit=100)
                deals = ac.fetch_deals(limit=100)
                contacts_count = len(contacts)
                deals_count = len(deals)
                pipeline_value = sum(float(d.get("value", 0)) for d in deals)
        except Exception as e:
            logger.debug("ActiveCampaign unavailable: %s", e)

        try:
            gads = _build_google_ads(creds)
            if gads and gads.test_connection():
                gads_connected = True
        except Exception as e:
            logger.debug("Google Ads unavailable: %s", e)

        # Fallback to demo data
        if not ac_connected:
            demo = _demo_contacts()
            contacts_count = len(demo["contacts"])
            deals_count = len(demo["deals"])
            pipeline_value = sum(float(d.get("value", 0)) for d in demo["deals"])

        # Revenue calculations
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
                revenue_target=max(revenue_target - pipeline_value, 0),
                conversion_rates=thresholds.get("conversion_rates"),
            )
        except Exception as e:
            logger.debug("RevenueCalculator error: %s", e)
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

        contacts = []
        deals = []
        ac_connected = False

        try:
            ac = _build_activecampaign(creds)
            if ac and ac.test_connection():
                ac_connected = True
                contacts = ac.fetch_contacts(limit=100)
                deals = ac.fetch_deals(limit=100)
        except Exception:
            pass

        if not ac_connected:
            demo = _demo_contacts()
            contacts = demo["contacts"]
            deals = demo["deals"]

        try:
            from agents.revenue_analyst.calculator import RevenueCalculator

            avg_deal = thresholds.get("deal_size", {}).get("average", 1200)
            calc = RevenueCalculator(default_avg_deal_size=avg_deal)
            funnel = calc.analyze_funnel(contacts, deals)
        except Exception:
            total = len(contacts)
            funnel = {
                "total_contacts": total,
                "engaged": int(total * 0.80),
                "mqls": int(total * 0.20),
                "hiros": int(total * 0.07),
                "pipeline_value": sum(float(d.get("value", 0)) for d in deals),
                "avg_deal_size": 1200,
                "conversion_rates": {
                    "contact_to_engaged": 0.80,
                    "engaged_to_mql": 0.25,
                    "mql_to_hiro": 0.35,
                },
                "stage_breakdown": [
                    {"stage": "Contacts", "count": total, "rate_from_previous": None},
                    {
                        "stage": "Engaged",
                        "count": int(total * 0.80),
                        "rate_from_previous": 0.80,
                    },
                    {
                        "stage": "MQL",
                        "count": int(total * 0.20),
                        "rate_from_previous": 0.25,
                    },
                    {
                        "stage": "HIRO",
                        "count": int(total * 0.07),
                        "rate_from_previous": 0.35,
                    },
                ],
            }

        return jsonify(
            {
                "stages": funnel.get("stage_breakdown", []),
                "conversion_rates": funnel.get("conversion_rates", {}),
                "pipeline_value": funnel.get("pipeline_value", 0),
                "avg_deal_size": funnel.get("avg_deal_size", 1200),
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
        gads_connected = False

        try:
            gads = _build_google_ads(creds)
            if gads and gads.test_connection():
                gads_connected = True
                campaigns = gads.fetch_campaigns(q_start, q_end)
        except Exception:
            pass

        if not gads_connected:
            campaigns = _demo_campaigns()

        # Enrich with CPA analysis
        cpa_thresholds = thresholds.get("cpa", {"excellent": 80, "warning": 150, "critical": 250})

        enriched = []
        for c in campaigns:
            conversions = c.get("conversions", 0)
            cost = c.get("cost", 0)
            clicks = c.get("clicks", 0)
            impressions = c.get("impressions", 0)
            cpa = cost / conversions if conversions else 0

            if conversions == 0:
                cpa_status = "none"
            elif cpa <= cpa_thresholds.get("excellent", 80):
                cpa_status = "excellent"
            elif cpa <= cpa_thresholds.get("warning", 150):
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
                    "cpa_status": cpa_status,
                }
            )

        # Try strategic analysis
        try:
            from agents.strategic_advisor.campaign_analyzer import CampaignAnalyzer

            analyzer = CampaignAnalyzer()
            analysis = analyzer.analyze_campaigns(campaigns, cpa_thresholds)
            recommendations = analyzer.generate_recommendations(analysis)
        except Exception:
            recommendations = {
                "immediate_actions": [],
                "strategic_adjustments": [],
                "new_tactics": [],
            }

        return jsonify(
            {
                "campaigns": enriched,
                "recommendations": recommendations,
                "thresholds": cpa_thresholds,
                "live_data": gads_connected,
            }
        )

    # ── API: Trend data ─────────────────────────────────────────────────

    @app.route("/api/trends")
    def api_trends():
        return jsonify({"days": _demo_trend_data()})

    # ── API: Alerts ─────────────────────────────────────────────────────

    @app.route("/api/alerts")
    def api_alerts():
        thresholds = _load_thresholds()
        creds = _load_credentials()
        quarter = _current_quarter()
        q_start, q_end = _quarter_dates(quarter)

        campaigns = []
        try:
            gads = _build_google_ads(creds)
            if gads and gads.test_connection():
                campaigns = gads.fetch_campaigns(q_start, q_end)
        except Exception:
            pass

        if not campaigns:
            campaigns = _demo_campaigns()

        try:
            from agents.strategic_advisor.campaign_analyzer import CampaignAnalyzer

            analyzer = CampaignAnalyzer()
            cpa_thresholds = thresholds.get(
                "cpa", {"excellent": 80, "warning": 150, "critical": 250}
            )
            alerts = analyzer.create_alerts(campaigns, cpa_thresholds)
        except Exception:
            alerts = _generate_fallback_alerts(campaigns, thresholds)

        return jsonify({"alerts": alerts})

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


def _generate_fallback_alerts(campaigns: list, thresholds: dict) -> list:
    """Generate alerts without the CampaignAnalyzer."""
    alerts = []
    cpa_critical = thresholds.get("cpa", {}).get("critical", 250)
    cpa_warning = thresholds.get("cpa", {}).get("warning", 150)
    zero_limit = thresholds.get("budget", {}).get("zero_conversion_limit", 500)

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

    # Add positive alerts for well-performing campaigns
    excellent = thresholds.get("cpa", {}).get("excellent", 80)
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


# ── Standalone runner ───────────────────────────────────────────────────────


def run_server(port: int = 8080, debug: bool = False):
    """Start the dashboard server."""
    app = create_app()
    print(f"\n  🚀 Marketing Intelligence Center Dashboard")
    print(f"  ───────────────────────────────────────────")
    print(f"  Running on: http://localhost:{port}")
    print(f"  Mode: {'Development' if debug else 'Production'}")
    print(f"  Press Ctrl+C to stop\n")
    app.run(host="0.0.0.0", port=port, debug=debug)


if __name__ == "__main__":
    run_server(debug=True)
