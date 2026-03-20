"""
Demand Gen ROI — Calculation Engine

All funnel, ROAS, and revenue logic lives here so it can be called
from both the Flask web dashboard and the CLI via main.py.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any


MONTH_KEYS = [f"{datetime.now().year}-{m:02d}" for m in range(1, 13)]
MONTH_LABELS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

# ── Stage mapping ─────────────────────────────────────────────────────────
# Map ActiveCampaign pipeline stage titles to demand-gen funnel stages.
# This is intentionally loose — stages are matched case-insensitively and
# by substring so it works even if the AC stage name drifts a little.

_STAGE_ALIASES: dict[str, list[str]] = {
    "created": ["created", "new", "prospect", "inbound", "open"],
    "engaged": ["engaged", "contacted", "responded", "meeting", "demo"],
    "captured": ["captured", "qualified", "mql", "sql", "opportunity"],
    "converted": ["converted", "won", "closed", "customer"],
}


def _classify_stage(stage_title: str) -> str | None:
    """Return the funnel bucket for an AC stage title, or None."""
    t = stage_title.lower().strip()
    for bucket, aliases in _STAGE_ALIASES.items():
        for alias in aliases:
            if alias in t:
                return bucket
    return None


# ── Helpers ───────────────────────────────────────────────────────────────


def _safe_div(a: float, b: float) -> float | None:
    """Division returning None on zero denominator (IFERROR equivalent)."""
    if not b:
        return None
    return a / b


def _month_key(iso_date: str) -> str | None:
    """Extract YYYY-MM from an ISO date string, or None."""
    if not iso_date:
        return None
    try:
        return iso_date[:7]
    except (TypeError, IndexError):
        return None


# ── Pipeline Funnel ───────────────────────────────────────────────────────


def build_funnel_table(
    deals: list[dict],
    stages: list[dict],
    year: int | None = None,
) -> dict[str, Any]:
    """Build the monthly funnel table from AC pipeline data.

    Returns::
        {
            "months": ["2026-01", ..., "2026-12"],
            "labels": ["Jan", ..., "Dec"],
            "created":   [int, ...],
            "engaged":   [int, ...],
            "captured":  [int, ...],
            "converted": [int, ...],
            "engaged_rate":   [float|None, ...],
            "captured_rate":  [float|None, ...],
            "converted_rate": [float|None, ...],
            "ytd_totals": {"created": int, "engaged": int, ...},
        }
    """
    year = year or datetime.now().year
    months = [f"{year}-{m:02d}" for m in range(1, 13)]

    # Build stage_id → bucket mapping
    stage_bucket: dict[str, str] = {}
    for s in stages:
        title = s.get("title", "")
        bucket = _classify_stage(title)
        if bucket:
            stage_bucket[str(s.get("id", ""))] = bucket

    # Init monthly buckets
    monthly: dict[str, dict[str, int]] = {
        mk: {"created": 0, "engaged": 0, "captured": 0, "converted": 0}
        for mk in months
    }

    for deal in deals:
        # Determine month from deal creation date
        cdate = deal.get("cdate") or deal.get("mdate") or deal.get("created_timestamp")
        mk = _month_key(cdate)
        if mk not in monthly:
            continue

        # Determine funnel bucket from stage
        stage_id = str(deal.get("stage") or deal.get("dealStage") or "")
        bucket = stage_bucket.get(stage_id)

        # Also check deal status for converted (won deals)
        deal_status = str(deal.get("status", ""))
        if deal_status == "1":
            bucket = "converted"

        if not bucket:
            # Default: if the deal exists in the pipeline, it's at least "created"
            bucket = "created"

        # Cascade: a converted deal also counts as captured, engaged, created
        cascade = {
            "created": ["created"],
            "engaged": ["created", "engaged"],
            "captured": ["created", "engaged", "captured"],
            "converted": ["created", "engaged", "captured", "converted"],
        }
        for b in cascade.get(bucket, ["created"]):
            monthly[mk][b] += 1

    # Flatten
    created = [monthly[mk]["created"] for mk in months]
    engaged = [monthly[mk]["engaged"] for mk in months]
    captured = [monthly[mk]["captured"] for mk in months]
    converted = [monthly[mk]["converted"] for mk in months]

    engaged_rate = [_safe_div(engaged[i], created[i]) for i in range(12)]
    captured_rate = [_safe_div(captured[i], engaged[i]) for i in range(12)]
    converted_rate = [_safe_div(converted[i], captured[i]) for i in range(12)]

    ytd = {
        "created": sum(created),
        "engaged": sum(engaged),
        "captured": sum(captured),
        "converted": sum(converted),
    }
    ytd["engaged_rate"] = _safe_div(ytd["engaged"], ytd["created"])
    ytd["captured_rate"] = _safe_div(ytd["captured"], ytd["engaged"])
    ytd["converted_rate"] = _safe_div(ytd["converted"], ytd["captured"])

    return {
        "months": months,
        "labels": list(MONTH_LABELS),
        "created": created,
        "engaged": engaged,
        "captured": captured,
        "converted": converted,
        "engaged_rate": engaged_rate,
        "captured_rate": captured_rate,
        "converted_rate": converted_rate,
        "ytd_totals": ytd,
    }


# ── Revenue & ROAS ───────────────────────────────────────────────────────


def compute_roas(
    funnel: dict[str, Any],
    ad_spend: dict[str, dict[str, float]],
    ltv_monthly: dict[str, float],
    year: int | None = None,
) -> dict[str, Any]:
    """Calculate three ROAS flavors per month + annual totals.

    Args:
        funnel: Output of ``build_funnel_table``.
        ad_spend: ``{"google": {"2026-01": 1234.56, ...}, "linkedin": {...}}``.
                  Keyed by platform, then by YYYY-MM.
        ltv_monthly: ``{"2026-01": 12345.0, ...}`` from config.

    Returns dict with monthly arrays + annual summary.
    """
    year = year or datetime.now().year
    months = funnel["months"]
    converted = funnel["converted"]

    # Aggregate ad spend across all platforms per month
    total_spend = []
    spend_by_platform: dict[str, list[float]] = {}
    for mk in months:
        month_total = 0.0
        for platform, platform_spend in ad_spend.items():
            val = platform_spend.get(mk, 0.0)
            month_total += val
            spend_by_platform.setdefault(platform, []).append(val)
        total_spend.append(month_total)

    # LTV per month
    ltv = [ltv_monthly.get(mk, 0.0) for mk in months]

    # Monthly new revenue = conversions * average deal value (use LTV as proxy)
    monthly_new_revenue = [
        converted[i] * ltv[i] if ltv[i] and converted[i] else 0.0
        for i in range(12)
    ]

    # Cumulative ARR
    cumulative_arr = []
    running = 0.0
    for i in range(12):
        running += monthly_new_revenue[i]
        cumulative_arr.append(running)

    # ROAS A: monthly_new_revenue / ad_spend
    roas_a = [_safe_div(monthly_new_revenue[i], total_spend[i]) for i in range(12)]

    # ROAS B: cumulative_arr / ad_spend (cumulative spend)
    cumulative_spend = []
    cs = 0.0
    for s in total_spend:
        cs += s
        cumulative_spend.append(cs)
    roas_b = [_safe_div(cumulative_arr[i], cumulative_spend[i]) for i in range(12)]

    # ROAS C: (conversions * ltv) / ad_spend
    roas_c = [
        _safe_div(converted[i] * ltv[i], total_spend[i]) for i in range(12)
    ]

    # Annual totals — SUMPRODUCT style
    annual_spend = sum(total_spend)
    annual_conversions = sum(converted)
    annual_ltv_weighted = sum(converted[i] * ltv[i] for i in range(12))
    annual_roas = _safe_div(annual_ltv_weighted, annual_spend)
    annual_new_revenue = sum(monthly_new_revenue)

    # LTV outlier flags (> 50000)
    ltv_outlier_flags = [ltv[i] > 50000 for i in range(12)]

    return {
        "months": months,
        "labels": funnel["labels"],
        "total_spend": total_spend,
        "spend_by_platform": spend_by_platform,
        "cumulative_spend": cumulative_spend,
        "ltv": ltv,
        "ltv_outlier_flags": ltv_outlier_flags,
        "monthly_new_revenue": monthly_new_revenue,
        "cumulative_arr": cumulative_arr,
        "roas_a": roas_a,
        "roas_b": roas_b,
        "roas_c": roas_c,
        "annual": {
            "total_spend": round(annual_spend, 2),
            "total_conversions": annual_conversions,
            "total_new_revenue": round(annual_new_revenue, 2),
            "total_cumulative_arr": round(cumulative_arr[-1] if cumulative_arr else 0.0, 2),
            "ltv_weighted_revenue": round(annual_ltv_weighted, 2),
            "roas": round(annual_roas, 2) if annual_roas is not None else None,
        },
    }


def classify_roas(value: float | None, thresholds: dict) -> str:
    """Return a CSS class name for a ROAS value."""
    if value is None:
        return "roas-none"
    excellent = thresholds.get("roas_excellent", 8.0)
    good = thresholds.get("roas_good", 4.0)
    warning = thresholds.get("roas_warning", 1.0)
    if value >= excellent:
        return "roas-excellent"
    if value >= good:
        return "roas-good"
    if value >= warning:
        return "roas-warning"
    return "roas-critical"


# ── Full ROI payload builder ──────────────────────────────────────────────


def build_roi_payload(
    deals: list[dict],
    stages: list[dict],
    ad_spend: dict[str, dict[str, float]],
    ltv_monthly: dict[str, float],
    thresholds: dict,
    year: int | None = None,
) -> dict[str, Any]:
    """Assemble the complete Demand Gen ROI data payload.

    This is the single entry point for both the Flask route and CLI.
    """
    funnel = build_funnel_table(deals, stages, year)
    roas_data = compute_roas(funnel, ad_spend, ltv_monthly, year)

    roas_thresholds = {
        "roas_excellent": thresholds.get("roas_excellent", 8.0),
        "roas_good": thresholds.get("roas_good", 4.0),
        "roas_warning": thresholds.get("roas_warning", 1.0),
    }

    # Classify each month's ROAS C (the primary display ROAS)
    roas_classes = [classify_roas(v, roas_thresholds) for v in roas_data["roas_c"]]
    annual_roas_class = classify_roas(
        roas_data["annual"]["roas"], roas_thresholds
    )

    # Target progress (4:1 minimum, 8:1 excellent)
    annual_roas_val = roas_data["annual"]["roas"]
    target_min = roas_thresholds["roas_good"]  # 4.0
    target_excellent = roas_thresholds["roas_excellent"]  # 8.0
    progress_pct = min(
        (annual_roas_val / target_excellent * 100) if annual_roas_val else 0, 100
    )

    return {
        "funnel": funnel,
        "roas": roas_data,
        "roas_classes": roas_classes,
        "annual_roas_class": annual_roas_class,
        "thresholds": roas_thresholds,
        "target": {
            "minimum": target_min,
            "excellent": target_excellent,
            "current": annual_roas_val,
            "progress_pct": round(progress_pct, 1),
        },
    }
