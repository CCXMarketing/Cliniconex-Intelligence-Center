"""
Revenue Calculator - Reverse math from revenue targets to leads needed.

Works with ActiveCampaign funnel stages:
  Contact Created -> Contact Engaged -> MQL/PQM -> HIRO (deal)
"""

from datetime import datetime
from typing import Dict, List, Optional
import math


# ActiveCampaign tag/status values that map to our funnel stages
FUNNEL_STAGES = ["contact_created", "contact_engaged", "mql", "hiro"]

DEFAULT_CONVERSION_RATES = {
    "contact_to_engaged": 0.80,
    "engaged_to_mql": 0.25,
    "mql_to_hiro": 0.35,
}


class RevenueCalculator:
    """Calculates lead requirements by working backwards from revenue targets."""

    def __init__(self, default_avg_deal_size: float = 1200.0):
        self.default_avg_deal_size = default_avg_deal_size

    # ------------------------------------------------------------------
    # Core: reverse-math from revenue target to contacts needed
    # ------------------------------------------------------------------

    def calculate_leads_needed(
        self,
        revenue_target: float,
        avg_deal_size: Optional[float] = None,
        conversion_rates: Optional[Dict[str, float]] = None,
    ) -> Dict:
        """
        Work backwards from a revenue target to determine how many
        contacts are needed at each funnel stage.

        Args:
            revenue_target: Target revenue in dollars.
            avg_deal_size: Average deal value. Falls back to instance default.
            conversion_rates: Dict with keys contact_to_engaged,
                              engaged_to_mql, mql_to_hiro.  Missing keys
                              are filled from DEFAULT_CONVERSION_RATES.

        Returns:
            Dict with counts at every stage and the rates used.
        """
        if revenue_target <= 0:
            return self._empty_leads_result(revenue_target, "revenue_target must be > 0")

        deal_size = avg_deal_size or self.default_avg_deal_size
        if deal_size <= 0:
            return self._empty_leads_result(revenue_target, "avg_deal_size must be > 0")

        rates = {**DEFAULT_CONVERSION_RATES, **(conversion_rates or {})}
        for key, val in rates.items():
            if val <= 0 or val > 1:
                return self._empty_leads_result(
                    revenue_target, f"conversion rate '{key}' must be between 0 and 1 (got {val})"
                )

        deals_needed = math.ceil(revenue_target / deal_size)
        mql_needed = math.ceil(deals_needed / rates["mql_to_hiro"])
        engaged_needed = math.ceil(mql_needed / rates["engaged_to_mql"])
        contacts_needed = math.ceil(engaged_needed / rates["contact_to_engaged"])

        return {
            "revenue_target": revenue_target,
            "avg_deal_size": deal_size,
            "deals_needed": deals_needed,
            "mql_needed": mql_needed,
            "engaged_needed": engaged_needed,
            "contacts_needed": contacts_needed,
            "conversion_rates": rates,
            "stage_breakdown": [
                {"stage": "Contact Created", "count": contacts_needed},
                {"stage": "Contact Engaged", "count": engaged_needed,
                 "rate_from_previous": rates["contact_to_engaged"]},
                {"stage": "MQL/PQM", "count": mql_needed,
                 "rate_from_previous": rates["engaged_to_mql"]},
                {"stage": "HIRO (Deal)", "count": deals_needed,
                 "rate_from_previous": rates["mql_to_hiro"]},
            ],
            "error": None,
        }

    # ------------------------------------------------------------------
    # Analyze real funnel data from ActiveCampaign
    # ------------------------------------------------------------------

    def analyze_funnel(
        self,
        contacts: List[Dict],
        deals: List[Dict],
        pipeline_stages: Optional[List[Dict]] = None,
    ) -> Dict:
        """
        Derive actual conversion rates from ActiveCampaign contacts/deals.

        Contacts are bucketed by tag into funnel stages.  When tag data is
        unavailable, pipeline stage order is used to classify deals into
        MQL (early stages) vs HIRO (late stages).

        Args:
            contacts: List of ActiveCampaign contact dicts.
            deals: List of ActiveCampaign deal dicts.
            pipeline_stages: Optional list of AC dealStage dicts (from
                ``get_pipeline_stages()``).  When provided, deals are
                classified by their stage position rather than by the
                backward-computation heuristic.

        Returns:
            Dict with counts per stage, observed conversion rates,
            and total pipeline value.
        """
        total_contacts = len(contacts)
        engaged = self._count_contacts_with_tag(contacts, "engaged")
        mqls = self._count_contacts_with_tag(contacts, "mql")

        if engaged > 0 or mqls > 0:
            # Tag data available — use it directly.
            hiros = len(deals)
        elif pipeline_stages and deals:
            # Classify deals using pipeline stage order.
            engaged, mqls, hiros = self._classify_by_pipeline(
                deals, pipeline_stages, total_contacts
            )
        elif total_contacts > 0 and deals:
            # Fallback: use deal-stage heuristic (returns engaged, mqls, hiros).
            engaged, mqls = self._infer_stages_from_deals(deals, total_contacts)
            hiros = max(
                math.ceil(len(deals) * DEFAULT_CONVERSION_RATES["mql_to_hiro"]), 1
            )
        else:
            engaged = mqls = hiros = 0

        rates = {
            "contact_to_engaged": self._safe_divide(engaged, total_contacts),
            "engaged_to_mql": self._safe_divide(mqls, engaged),
            "mql_to_hiro": self._safe_divide(hiros, mqls),
        }

        pipeline_value = sum(float(d.get("value", 0)) for d in deals)
        avg_deal = self._safe_divide(pipeline_value, hiros)

        return {
            "total_contacts": total_contacts,
            "engaged": engaged,
            "mqls": mqls,
            "hiros": hiros,
            "conversion_rates": rates,
            "pipeline_value": pipeline_value,
            "avg_deal_size": avg_deal,
            "stage_breakdown": [
                {"stage": "Contact Created", "count": total_contacts},
                {"stage": "Contact Engaged", "count": engaged,
                 "rate_from_previous": rates["contact_to_engaged"]},
                {"stage": "MQL/PQM", "count": mqls,
                 "rate_from_previous": rates["engaged_to_mql"]},
                {"stage": "HIRO (Deal)", "count": hiros,
                 "rate_from_previous": rates["mql_to_hiro"]},
            ],
            "error": None,
        }

    # ------------------------------------------------------------------
    # Forecast revenue from current run-rate
    # ------------------------------------------------------------------

    def forecast_revenue(
        self, current_pace: float, days_remaining: int
    ) -> Dict:
        """
        Project revenue based on current daily run-rate.

        Args:
            current_pace: Revenue earned per day (current period).
            days_remaining: Calendar days left in the period.

        Returns:
            Dict with projected totals and confidence bands.
        """
        if days_remaining < 0:
            return {"error": "days_remaining cannot be negative"}

        projected = current_pace * days_remaining
        # Simple +/- 15 % band
        low = projected * 0.85
        high = projected * 1.15

        return {
            "daily_pace": current_pace,
            "days_remaining": days_remaining,
            "projected_revenue": round(projected, 2),
            "confidence_band": {
                "low": round(low, 2),
                "high": round(high, 2),
            },
            "error": None,
        }

    # ------------------------------------------------------------------
    # Gap analysis: target vs. current trajectory
    # ------------------------------------------------------------------

    def calculate_gap(
        self,
        target: float,
        current: float,
        time_remaining: int,
    ) -> Dict:
        """
        Compare where you are vs. where you need to be.

        Args:
            target: Revenue target for the period.
            current: Revenue closed so far.
            time_remaining: Days left in the period.

        Returns:
            Dict with gap size, required daily pace, and status.
        """
        gap = target - current
        on_track = gap <= 0

        if time_remaining <= 0 and not on_track:
            return {
                "target": target,
                "current": current,
                "gap": gap,
                "time_remaining_days": time_remaining,
                "required_daily_pace": None,
                "status": "overdue",
                "on_track": False,
                "pct_complete": self._safe_divide(current, target) * 100,
                "error": "No time remaining and target not met",
            }

        required_pace = self._safe_divide(gap, time_remaining) if not on_track else 0.0

        return {
            "target": target,
            "current": current,
            "gap": round(gap, 2),
            "time_remaining_days": time_remaining,
            "required_daily_pace": round(required_pace, 2),
            "status": "on_track" if on_track else "behind",
            "on_track": on_track,
            "pct_complete": round(self._safe_divide(current, target) * 100, 2),
            "error": None,
        }

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _safe_divide(numerator: float, denominator: float) -> float:
        if denominator == 0:
            return 0.0
        return numerator / denominator

    @staticmethod
    def _count_contacts_with_tag(contacts: List[Dict], tag_keyword: str) -> int:
        """Count contacts whose tags list contains *tag_keyword* (case-insensitive)."""
        count = 0
        for c in contacts:
            tags = c.get("tags", [])
            # AC tags can be a list of strings or list of dicts with a "tag" key
            for t in tags:
                tag_str = t.get("tag", t) if isinstance(t, dict) else str(t)
                if tag_keyword.lower() in str(tag_str).lower():
                    count += 1
                    break
        return count

    @staticmethod
    def _classify_by_pipeline(
        deals: List[Dict],
        pipeline_stages: List[Dict],
        total_contacts: int,
    ) -> tuple:
        """Classify deals into funnel stages using pipeline stage order.

        Stages are sorted by their ``order`` field.  The first half of
        stages are considered early-funnel (MQL territory); the second
        half are late-funnel (HIRO territory).

        Counts are based on **unique contacts**, not deals, so that
        funnel rates stay monotonically decreasing.

        Returns:
            (engaged, mqls, hiros)
        """
        sorted_stages = sorted(
            pipeline_stages, key=lambda s: int(s.get("order", 0))
        )
        if not sorted_stages:
            hiros = len(deals)
            return min(hiros, total_contacts), hiros, hiros

        mid = max(len(sorted_stages) // 2, 1)
        late_ids = {str(s["id"]) for s in sorted_stages[mid:]}

        all_contact_ids: set = set()
        hiro_contact_ids: set = set()

        for deal in deals:
            contact_id = str(deal.get("contact", deal.get("id", "")))
            stage_id = str(deal.get("stage", ""))
            all_contact_ids.add(contact_id)
            if stage_id in late_ids:
                hiro_contact_ids.add(contact_id)

        # Engaged = unique contacts that have any deal (known to be active)
        engaged = min(len(all_contact_ids), total_contacts)
        # MQLs = all contacts with deals (they entered the pipeline)
        mqls = engaged
        # HIROs = contacts whose furthest deal is in a late stage
        hiros = min(len(hiro_contact_ids), mqls)

        return engaged, mqls, hiros

    @staticmethod
    def _infer_stages_from_deals(
        deals: List[Dict], total_contacts: int
    ) -> tuple:
        """Rough heuristic when neither tags nor pipeline stages are available.

        Without stage data we cannot tell which deals are late-funnel (HIRO)
        vs early-funnel (MQL).  We treat *all* deals as MQLs and estimate
        that only ``DEFAULT_CONVERSION_RATES["mql_to_hiro"]`` fraction have
        progressed to HIRO.  This prevents every rate from collapsing to
        100%.
        """
        num_deals = len(deals)
        if num_deals == 0:
            return 0, 0

        # All deals represent at least MQL-stage contacts.
        mqls = num_deals

        # Estimate HIROs as a proportion of MQLs using default rate.
        hiros = max(math.ceil(num_deals * DEFAULT_CONVERSION_RATES["mql_to_hiro"]), 1)

        # Work forward from total_contacts for the engaged estimate.
        engaged = int(total_contacts * DEFAULT_CONVERSION_RATES["contact_to_engaged"])
        # Engaged must be at least as large as MQLs.
        engaged = max(engaged, mqls)
        # But not larger than total contacts.
        engaged = min(engaged, total_contacts)

        return engaged, mqls

    @staticmethod
    def _empty_leads_result(revenue_target: float, error: str) -> Dict:
        return {
            "revenue_target": revenue_target,
            "avg_deal_size": 0,
            "deals_needed": 0,
            "mql_needed": 0,
            "engaged_needed": 0,
            "contacts_needed": 0,
            "conversion_rates": {},
            "stage_breakdown": [],
            "error": error,
        }


# ----------------------------------------------------------------------
# Quick smoke-test
# ----------------------------------------------------------------------
if __name__ == "__main__":
    calc = RevenueCalculator(default_avg_deal_size=1200)

    # 1. Reverse-math
    result = calc.calculate_leads_needed(
        revenue_target=9_000_000,
        conversion_rates={
            "contact_to_engaged": 0.80,
            "engaged_to_mql": 0.25,
            "mql_to_hiro": 0.35,
        },
    )
    print("=== Leads Needed ===")
    for stage in result["stage_breakdown"]:
        rate = stage.get("rate_from_previous")
        rate_str = f"  (rate: {rate:.0%})" if rate else ""
        print(f"  {stage['stage']}: {stage['count']:,}{rate_str}")

    # 2. Forecast
    forecast = calc.forecast_revenue(current_pace=25_000, days_remaining=90)
    print(f"\n=== Forecast ===")
    print(f"  Projected: ${forecast['projected_revenue']:,.2f}")

    # 3. Gap
    gap = calc.calculate_gap(target=9_000_000, current=3_500_000, time_remaining=90)
    print(f"\n=== Gap Analysis ===")
    print(f"  Gap: ${gap['gap']:,.2f}")
    print(f"  Required daily pace: ${gap['required_daily_pace']:,.2f}")
    print(f"  Status: {gap['status']}")
