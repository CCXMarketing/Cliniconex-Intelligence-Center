"""
Strategic Advisor Agent - Campaign performance analysis and recommendations.

Analyzes campaign data against configurable thresholds and produces
three-tier recommendations:
  🔴 IMMEDIATE ACTION REQUIRED  (pause campaigns, stop bleeding)
  🟡 STRATEGIC ADJUSTMENTS      (optimize, adjust bids)
  🟢 NEW TACTICS TO TEST        (scale winners, new strategies)
"""

from typing import Dict, List, Optional
import logging

logger = logging.getLogger("strategic_advisor.campaign_analyzer")


class CampaignAnalyzer:
    """Analyzes campaign performance and generates actionable recommendations."""

    # Minimum clicks before CTR/conversion-rate judgements are meaningful
    MIN_CLICKS_FOR_RATE_ANALYSIS = 20

    def __init__(self, default_thresholds: Optional[Dict] = None):
        self.default_thresholds = default_thresholds or {}

    # ------------------------------------------------------------------
    # Primary analysis entry-point
    # ------------------------------------------------------------------

    def analyze_campaigns(
        self, campaigns: List[Dict], thresholds: Dict
    ) -> Dict:
        """
        Analyze a list of campaigns against business thresholds.

        Args:
            campaigns: List of campaign dicts. Expected keys per campaign:
                name, spend, conversions, clicks, impressions, cpa, ctr,
                conversion_rate.  All monetary values in the same currency
                as the thresholds.
            thresholds: Parsed thresholds.yaml dict with sections cpa,
                budget, alerts, etc.

        Returns:
            Dict with categorized campaigns, summary stats, and raw
            analysis per campaign that feeds into generate_recommendations().
        """
        cpa_thresholds = thresholds.get("cpa", {})
        budget_limits = thresholds.get("budget", {})
        alert_cfg = thresholds.get("alerts", {})

        per_campaign: List[Dict] = []
        total_spend = 0.0
        total_conversions = 0
        total_clicks = 0
        total_impressions = 0

        for c in campaigns:
            spend = float(c.get("spend", 0) or 0)
            conversions = int(c.get("conversions", 0) or 0)
            clicks = int(c.get("clicks", 0) or 0)
            impressions = int(c.get("impressions", 0) or 0)

            cpa = float(c.get("cpa", 0) or 0)
            if cpa == 0 and conversions > 0:
                cpa = spend / conversions

            ctr = float(c.get("ctr", 0) or 0)
            if ctr == 0 and impressions > 0:
                ctr = clicks / impressions

            conv_rate = float(c.get("conversion_rate", 0) or 0)
            if conv_rate == 0 and clicks > 0:
                conv_rate = conversions / clicks

            total_spend += spend
            total_conversions += conversions
            total_clicks += clicks
            total_impressions += impressions

            # --- flag problems ---
            issues: List[str] = []
            severity = "green"  # default

            zero_conv_limit = float(budget_limits.get("zero_conversion_limit", 150))
            is_budget_waster = spend > zero_conv_limit and conversions == 0
            if is_budget_waster:
                issues.append("budget_waster")
                severity = "red"

            cpa_excellent = float(cpa_thresholds.get("excellent", 75))
            cpa_warning = float(cpa_thresholds.get("warning", 200))
            cpa_critical = float(cpa_thresholds.get("critical", 300))

            is_cpa_critical = conversions > 0 and cpa > cpa_critical
            is_cpa_warning = conversions > 0 and cpa_warning < cpa <= cpa_critical
            is_cpa_excellent = conversions > 0 and cpa <= cpa_excellent

            if is_cpa_critical:
                issues.append("cpa_critical")
                severity = "red"
            elif is_cpa_warning:
                issues.append("cpa_warning")
                if severity != "red":
                    severity = "yellow"

            has_enough_clicks = clicks >= self.MIN_CLICKS_FOR_RATE_ANALYSIS
            is_low_ctr = has_enough_clicks and ctr < 0.01  # <1 %
            is_low_conv = has_enough_clicks and conv_rate < 0.01  # <1 %

            if is_low_ctr:
                issues.append("low_ctr")
                if severity == "green":
                    severity = "yellow"
            if is_low_conv:
                issues.append("low_conversion_rate")
                if severity == "green":
                    severity = "yellow"

            is_winner = is_cpa_excellent and conversions >= 2
            if is_winner:
                issues.append("winner")

            per_campaign.append({
                "name": c.get("name", "Unknown"),
                "spend": spend,
                "conversions": conversions,
                "clicks": clicks,
                "impressions": impressions,
                "cpa": round(cpa, 2),
                "ctr": round(ctr, 4),
                "conversion_rate": round(conv_rate, 4),
                "severity": severity,
                "issues": issues,
                "is_budget_waster": is_budget_waster,
                "is_cpa_critical": is_cpa_critical,
                "is_cpa_warning": is_cpa_warning,
                "is_cpa_excellent": is_cpa_excellent,
                "is_winner": is_winner,
                "raw": c,
            })

        overall_cpa = total_spend / total_conversions if total_conversions else 0

        return {
            "campaigns": per_campaign,
            "summary": {
                "total_campaigns": len(campaigns),
                "total_spend": round(total_spend, 2),
                "total_conversions": total_conversions,
                "total_clicks": total_clicks,
                "total_impressions": total_impressions,
                "overall_cpa": round(overall_cpa, 2),
                "red_count": sum(1 for c in per_campaign if c["severity"] == "red"),
                "yellow_count": sum(1 for c in per_campaign if c["severity"] == "yellow"),
                "green_count": sum(1 for c in per_campaign if c["severity"] == "green"),
                "budget_wasters": sum(1 for c in per_campaign if c["is_budget_waster"]),
                "winners": sum(1 for c in per_campaign if c["is_winner"]),
            },
            "thresholds_used": {
                "cpa_excellent": float(cpa_thresholds.get("excellent", 75)),
                "cpa_warning": float(cpa_thresholds.get("warning", 200)),
                "cpa_critical": float(cpa_thresholds.get("critical", 300)),
                "zero_conversion_limit": float(budget_limits.get("zero_conversion_limit", 150)),
            },
        }

    # ------------------------------------------------------------------
    # Generate three-tier recommendations
    # ------------------------------------------------------------------

    def generate_recommendations(self, analysis_results: Dict) -> Dict:
        """
        Turn analysis results into prioritized, actionable recommendations.

        Args:
            analysis_results: Output of analyze_campaigns().

        Returns:
            Dict with immediate_actions, strategic_adjustments, and
            new_tactics lists.
        """
        immediate_actions: List[Dict] = []
        strategic_adjustments: List[Dict] = []
        new_tactics: List[Dict] = []

        thresholds = analysis_results.get("thresholds_used", {})
        cpa_warning = thresholds.get("cpa_warning", 200)
        cpa_critical = thresholds.get("cpa_critical", 300)

        for c in analysis_results.get("campaigns", []):
            name = c["name"]
            spend = c["spend"]
            conversions = c["conversions"]
            cpa = c["cpa"]
            ctr = c["ctr"]
            conv_rate = c["conversion_rate"]

            # --- 🔴 IMMEDIATE ACTION REQUIRED ---
            if c["is_budget_waster"]:
                immediate_actions.append({
                    "action": "PAUSE",
                    "campaign": name,
                    "reason": f"${spend:,.0f} spend with 0 conversions",
                    "impact": f"Save ${spend:,.0f}/month",
                })

            if c["is_cpa_critical"]:
                # If CPA is extremely high (>2x critical), recommend pause
                if cpa > cpa_critical * 2:
                    immediate_actions.append({
                        "action": "PAUSE",
                        "campaign": name,
                        "reason": f"CPA ${cpa:,.0f} is {cpa / cpa_critical:.1f}x the ${cpa_critical} critical threshold",
                        "impact": f"Stop ${spend:,.0f}/month bleeding",
                    })
                else:
                    immediate_actions.append({
                        "action": "REDUCE_BUDGET",
                        "campaign": name,
                        "reason": f"CPA ${cpa:,.0f} exceeds ${cpa_critical} critical threshold",
                        "impact": f"Reduce waste while investigating root cause",
                    })

            # --- 🟡 STRATEGIC ADJUSTMENTS ---
            if c["is_cpa_warning"]:
                # Calculate recommended bid reduction
                reduction_pct = min(30, int((cpa - cpa_warning) / cpa_warning * 100) + 10)
                strategic_adjustments.append({
                    "action": "LOWER_BID",
                    "campaign": name,
                    "amount": f"{reduction_pct}%",
                    "reason": f"CPA ${cpa:,.0f} exceeds ${cpa_warning} threshold",
                })

            if "low_ctr" in c["issues"]:
                strategic_adjustments.append({
                    "action": "REFRESH_AD_COPY",
                    "campaign": name,
                    "reason": f"CTR {ctr:.2%} is below 1% minimum",
                    "suggestion": "Test new headlines and descriptions targeting pain points",
                })

            if "low_conversion_rate" in c["issues"] and "low_ctr" not in c["issues"]:
                strategic_adjustments.append({
                    "action": "OPTIMIZE_LANDING_PAGE",
                    "campaign": name,
                    "reason": f"Conversion rate {conv_rate:.2%} is below 1% (traffic exists but doesn't convert)",
                    "suggestion": "Review landing page relevance, load speed, and CTA clarity",
                })

            # --- 🟢 NEW TACTICS TO TEST ---
            if c["is_winner"]:
                budget_increase = max(100, int(spend * 0.25 / 50) * 50)  # round to $50
                new_tactics.append({
                    "action": "SCALE",
                    "campaign": name,
                    "suggestion": f"Increase budget by ${budget_increase:,}/week",
                    "reason": f"CPA ${cpa:,.0f}, {conversions} conversions — consistent performer",
                })

            # Moderate CPA with decent volume — test audience expansion
            if c["is_cpa_excellent"] and conversions >= 5:
                new_tactics.append({
                    "action": "EXPAND_AUDIENCE",
                    "campaign": name,
                    "suggestion": "Test lookalike audiences or broader keyword match types",
                    "reason": f"Strong CPA ${cpa:,.0f} with {conversions} conversions suggests room to scale",
                })

        # Sort by impact: highest spend first for immediate, lowest CPA first for winners
        immediate_actions.sort(key=lambda x: _parse_dollar(x.get("impact", "$0")), reverse=True)
        new_tactics.sort(key=lambda x: _parse_dollar(x.get("reason", "$0")))

        return {
            "immediate_actions": immediate_actions,
            "strategic_adjustments": strategic_adjustments,
            "new_tactics": new_tactics,
            "summary": {
                "total_recommendations": (
                    len(immediate_actions)
                    + len(strategic_adjustments)
                    + len(new_tactics)
                ),
                "immediate_count": len(immediate_actions),
                "strategic_count": len(strategic_adjustments),
                "new_tactics_count": len(new_tactics),
            },
        }

    # ------------------------------------------------------------------
    # Create alerts
    # ------------------------------------------------------------------

    def create_alerts(
        self, campaigns: List[Dict], thresholds: Dict
    ) -> List[Dict]:
        """
        Generate alert dicts for campaigns that violate thresholds.

        Args:
            campaigns: Raw campaign list (same format as analyze_campaigns input).
            thresholds: Parsed thresholds.yaml dict.

        Returns:
            List of alert dicts with level, campaign, metric, value,
            threshold, and message fields.
        """
        alerts: List[Dict] = []
        cpa_cfg = thresholds.get("cpa", {})
        budget_cfg = thresholds.get("budget", {})
        alert_cfg = thresholds.get("alerts", {})

        cpa_critical = float(cpa_cfg.get("critical", 300))
        cpa_warning = float(cpa_cfg.get("warning", 200))
        zero_conv_limit = float(budget_cfg.get("zero_conversion_limit", 150))
        daily_max = float(budget_cfg.get("daily_max", 500))
        monthly_max = float(budget_cfg.get("monthly_max", 15000))
        spend_variance = float(alert_cfg.get("daily_spend_variance", 0.50))

        for c in campaigns:
            name = c.get("name", "Unknown")
            spend = float(c.get("spend", 0) or 0)
            conversions = int(c.get("conversions", 0) or 0)
            cpa = float(c.get("cpa", 0) or 0)
            if cpa == 0 and conversions > 0:
                cpa = spend / conversions

            # Zero-conversion budget alert
            if spend > zero_conv_limit and conversions == 0:
                alerts.append({
                    "level": "critical",
                    "campaign": name,
                    "metric": "spend_no_conversions",
                    "value": spend,
                    "threshold": zero_conv_limit,
                    "message": f"${spend:,.0f} spent with zero conversions (limit: ${zero_conv_limit:,.0f})",
                })

            # CPA critical
            if conversions > 0 and cpa > cpa_critical:
                alerts.append({
                    "level": "critical",
                    "campaign": name,
                    "metric": "cpa",
                    "value": cpa,
                    "threshold": cpa_critical,
                    "message": f"CPA ${cpa:,.0f} exceeds critical threshold ${cpa_critical:,.0f}",
                })

            # CPA warning
            if conversions > 0 and cpa_warning < cpa <= cpa_critical:
                alerts.append({
                    "level": "warning",
                    "campaign": name,
                    "metric": "cpa",
                    "value": cpa,
                    "threshold": cpa_warning,
                    "message": f"CPA ${cpa:,.0f} exceeds warning threshold ${cpa_warning:,.0f}",
                })

            # Daily budget exceeded
            daily_spend = float(c.get("daily_spend", 0) or 0)
            if daily_spend > daily_max:
                alerts.append({
                    "level": "warning",
                    "campaign": name,
                    "metric": "daily_spend",
                    "value": daily_spend,
                    "threshold": daily_max,
                    "message": f"Daily spend ${daily_spend:,.0f} exceeds ${daily_max:,.0f} limit",
                })

            # Monthly budget exceeded
            if spend > monthly_max:
                alerts.append({
                    "level": "critical",
                    "campaign": name,
                    "metric": "monthly_spend",
                    "value": spend,
                    "threshold": monthly_max,
                    "message": f"Monthly spend ${spend:,.0f} exceeds ${monthly_max:,.0f} limit",
                })

            # Spend variance (requires previous_daily_spend in campaign data)
            prev_daily = float(c.get("previous_daily_spend", 0) or 0)
            if prev_daily > 0 and daily_spend > 0:
                variance = abs(daily_spend - prev_daily) / prev_daily
                if variance > spend_variance:
                    alerts.append({
                        "level": "warning",
                        "campaign": name,
                        "metric": "spend_variance",
                        "value": round(variance, 2),
                        "threshold": spend_variance,
                        "message": (
                            f"Daily spend changed {variance:.0%} "
                            f"(${prev_daily:,.0f} → ${daily_spend:,.0f}), "
                            f"exceeds {spend_variance:.0%} variance limit"
                        ),
                    })

        # Sort: critical first, then warning
        level_order = {"critical": 0, "warning": 1, "info": 2}
        alerts.sort(key=lambda a: level_order.get(a["level"], 99))

        return alerts

    # ------------------------------------------------------------------
    # CPA categorization
    # ------------------------------------------------------------------

    def categorize_by_cpa(
        self, campaigns: List[Dict], cpa_thresholds: Dict
    ) -> Dict:
        """
        Bucket campaigns by CPA performance tier.

        Args:
            campaigns: Raw campaign list.
            cpa_thresholds: Dict with excellent, warning, critical keys.

        Returns:
            Dict with excellent, warning, critical, and no_conversions
            lists of campaign dicts augmented with a cpa_category field.
        """
        excellent_limit = float(cpa_thresholds.get("excellent", 75))
        warning_limit = float(cpa_thresholds.get("warning", 200))

        buckets: Dict[str, List[Dict]] = {
            "excellent": [],
            "warning": [],
            "critical": [],
            "no_conversions": [],
        }

        for c in campaigns:
            spend = float(c.get("spend", 0) or 0)
            conversions = int(c.get("conversions", 0) or 0)
            cpa = float(c.get("cpa", 0) or 0)
            if cpa == 0 and conversions > 0:
                cpa = spend / conversions

            entry = {
                "name": c.get("name", "Unknown"),
                "spend": spend,
                "conversions": conversions,
                "cpa": round(cpa, 2),
            }

            if conversions == 0:
                entry["cpa_category"] = "no_conversions"
                buckets["no_conversions"].append(entry)
            elif cpa <= excellent_limit:
                entry["cpa_category"] = "excellent"
                buckets["excellent"].append(entry)
            elif cpa <= warning_limit:
                entry["cpa_category"] = "warning"
                buckets["warning"].append(entry)
            else:
                entry["cpa_category"] = "critical"
                buckets["critical"].append(entry)

        # Sort each bucket by CPA ascending (no_conversions by spend descending)
        for key in ("excellent", "warning", "critical"):
            buckets[key].sort(key=lambda x: x["cpa"])
        buckets["no_conversions"].sort(key=lambda x: x["spend"], reverse=True)

        return {
            **buckets,
            "summary": {
                "excellent_count": len(buckets["excellent"]),
                "warning_count": len(buckets["warning"]),
                "critical_count": len(buckets["critical"]),
                "no_conversions_count": len(buckets["no_conversions"]),
            },
        }


# ------------------------------------------------------------------
# Module-level helpers
# ------------------------------------------------------------------

def _parse_dollar(text: str) -> float:
    """Extract the first dollar amount from a string like 'Save $1,705/month'."""
    import re
    match = re.search(r"\$([0-9,]+(?:\.\d+)?)", text)
    if match:
        return float(match.group(1).replace(",", ""))
    return 0.0


# ------------------------------------------------------------------
# Smoke test
# ------------------------------------------------------------------

if __name__ == "__main__":
    import yaml
    from pathlib import Path

    # Load thresholds
    config_path = Path(__file__).resolve().parents[2] / "config" / "thresholds.yaml"
    if config_path.exists():
        with open(config_path) as f:
            thresholds = yaml.safe_load(f)
    else:
        thresholds = {
            "cpa": {"excellent": 75, "warning": 200, "critical": 300},
            "budget": {"zero_conversion_limit": 150, "daily_max": 500, "monthly_max": 15000},
            "alerts": {"cpa_increase_percent": 20, "conversion_rate_drop": 0.05, "daily_spend_variance": 0.50},
        }

    # Sample campaigns (realistic mix)
    sample_campaigns = [
        {
            "name": "ACS US Medical",
            "spend": 1705,
            "conversions": 0,
            "clicks": 312,
            "impressions": 18400,
            "cpa": 0,
            "ctr": 0.017,
            "conversion_rate": 0,
        },
        {
            "name": "ACM US Medical",
            "spend": 760,
            "conversions": 1,
            "clicks": 145,
            "impressions": 9200,
            "cpa": 760,
            "ctr": 0.0158,
            "conversion_rate": 0.0069,
        },
        {
            "name": "ACS CAN Medical",
            "spend": 438,
            "conversions": 3,
            "clicks": 87,
            "impressions": 5100,
            "cpa": 146,
            "ctr": 0.017,
            "conversion_rate": 0.0345,
        },
        {
            "name": "ACM CAN LTC",
            "spend": 225,
            "conversions": 5,
            "clicks": 62,
            "impressions": 3900,
            "cpa": 45,
            "ctr": 0.0159,
            "conversion_rate": 0.0806,
        },
        {
            "name": "ACS US LTC Retargeting",
            "spend": 180,
            "conversions": 4,
            "clicks": 50,
            "impressions": 2200,
            "cpa": 45,
            "ctr": 0.0227,
            "conversion_rate": 0.08,
        },
        {
            "name": "ACM Brand Awareness",
            "spend": 90,
            "conversions": 0,
            "clicks": 8,
            "impressions": 12000,
            "cpa": 0,
            "ctr": 0.0007,
            "conversion_rate": 0,
        },
    ]

    analyzer = CampaignAnalyzer()

    # 1. Analyze
    print("=" * 60)
    print("CAMPAIGN ANALYSIS")
    print("=" * 60)
    analysis = analyzer.analyze_campaigns(sample_campaigns, thresholds)
    summary = analysis["summary"]
    print(f"  Total campaigns: {summary['total_campaigns']}")
    print(f"  Total spend:     ${summary['total_spend']:,.2f}")
    print(f"  Conversions:     {summary['total_conversions']}")
    print(f"  Overall CPA:     ${summary['overall_cpa']:,.2f}")
    print(f"  🔴 Red:    {summary['red_count']}")
    print(f"  🟡 Yellow: {summary['yellow_count']}")
    print(f"  🟢 Green:  {summary['green_count']}")
    print(f"  Budget wasters: {summary['budget_wasters']}")
    print(f"  Winners:        {summary['winners']}")

    # 2. Recommendations
    print("\n" + "=" * 60)
    print("RECOMMENDATIONS")
    print("=" * 60)
    recs = analyzer.generate_recommendations(analysis)

    print(f"\n🔴 IMMEDIATE ACTION REQUIRED ({len(recs['immediate_actions'])})")
    for r in recs["immediate_actions"]:
        print(f"  [{r['action']}] {r['campaign']}")
        print(f"    Reason: {r['reason']}")
        print(f"    Impact: {r.get('impact', 'N/A')}")

    print(f"\n🟡 STRATEGIC ADJUSTMENTS ({len(recs['strategic_adjustments'])})")
    for r in recs["strategic_adjustments"]:
        print(f"  [{r['action']}] {r['campaign']}")
        print(f"    Reason: {r['reason']}")
        if "amount" in r:
            print(f"    Amount: {r['amount']}")
        if "suggestion" in r:
            print(f"    Suggestion: {r['suggestion']}")

    print(f"\n🟢 NEW TACTICS TO TEST ({len(recs['new_tactics'])})")
    for r in recs["new_tactics"]:
        print(f"  [{r['action']}] {r['campaign']}")
        print(f"    Suggestion: {r['suggestion']}")
        print(f"    Reason: {r['reason']}")

    # 3. Alerts
    print("\n" + "=" * 60)
    print("ALERTS")
    print("=" * 60)
    alerts = analyzer.create_alerts(sample_campaigns, thresholds)
    for a in alerts:
        icon = "🚨" if a["level"] == "critical" else "⚠️"
        print(f"  {icon} [{a['level'].upper()}] {a['campaign']}: {a['message']}")

    # 4. CPA Categories
    print("\n" + "=" * 60)
    print("CPA CATEGORIZATION")
    print("=" * 60)
    cats = analyzer.categorize_by_cpa(sample_campaigns, thresholds["cpa"])
    for tier in ("excellent", "warning", "critical", "no_conversions"):
        print(f"\n  {tier.upper()} ({len(cats[tier])})")
        for c in cats[tier]:
            cpa_str = f"${c['cpa']:,.0f}" if c["conversions"] > 0 else "N/A"
            print(f"    {c['name']}: ${c['spend']:,.0f} spend, {c['conversions']} conv, CPA {cpa_str}")
