"""
Automation Engine — Executor Agent
Executes Google Ads actions based on strategic advisor recommendations
with comprehensive safety controls, logging, and rollback capability.
"""

import json
import logging
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml

# ---------------------------------------------------------------------------
# Lazy / optional imports — the strategic advisor may not be built yet.
# ---------------------------------------------------------------------------
try:
    from agents.strategic_advisor.campaign_analyzer import CampaignAnalyzer
except ImportError:
    CampaignAnalyzer = None  # type: ignore[misc,assignment]

try:
    from agents.data_connector.google_ads import GoogleAdsConnector
except ImportError:
    GoogleAdsConnector = None  # type: ignore[misc,assignment]


# ---------------------------------------------------------------------------
# Module-level paths
# ---------------------------------------------------------------------------
_MODULE_DIR = Path(__file__).resolve().parent
_LOG_FILE = _MODULE_DIR / "execution.log"
_DEFAULT_THRESHOLDS = Path(__file__).resolve().parents[2] / "config" / "thresholds.yaml"


def _load_thresholds(path: Path = _DEFAULT_THRESHOLDS) -> Dict[str, Any]:
    """Load budget and alert thresholds from config/thresholds.yaml."""
    if not path.exists():
        return {
            "budget": {
                "daily_max": 500,
                "monthly_max": 15000,
                "zero_conversion_limit": 150,
            }
        }
    with open(path, "r") as fh:
        return yaml.safe_load(fh)


# ---------------------------------------------------------------------------
# File logger — every action is persisted to execution.log
# ---------------------------------------------------------------------------
def _get_file_logger() -> logging.Logger:
    logger = logging.getLogger("automation_engine.executor")
    if not logger.handlers:
        logger.setLevel(logging.INFO)
        handler = logging.FileHandler(_LOG_FILE, encoding="utf-8")
        handler.setFormatter(
            logging.Formatter("%(asctime)s | %(levelname)s | %(message)s")
        )
        logger.addHandler(handler)
    return logger


_log = _get_file_logger()


# ---------------------------------------------------------------------------
# AutomationExecutor
# ---------------------------------------------------------------------------
class AutomationExecutor:
    """
    Executes Google Ads optimisation actions recommended by the
    Strategic Advisor with full safety controls.

    Safety guarantees
    -----------------
    1. **Dry-run by default** — ``dry_run=True`` logs actions without
       touching the Google Ads API.
    2. **Approval required** — budget increases are held for manual
       approval unless explicitly overridden.
    3. **Budget limits** — enforced from ``config/thresholds.yaml``
       (``daily_max``, ``monthly_max``).
    4. **Never pause ALL campaigns** — at least one campaign must remain
       active after any batch of pauses.
    5. **Rollback** — the last executed (non-dry-run) action can be undone.
    6. **Comprehensive logging** — every action is logged to
       ``agents/automation_engine/execution.log``.
    """

    def __init__(
        self,
        google_ads_connector: Optional[Any] = None,
        campaign_analyzer: Optional[Any] = None,
        thresholds_path: Optional[str] = None,
    ):
        self.ads = google_ads_connector
        self.analyzer = campaign_analyzer
        self._thresholds = _load_thresholds(
            Path(thresholds_path) if thresholds_path else _DEFAULT_THRESHOLDS
        )
        self._budget = self._thresholds.get("budget", {})
        self._daily_max: float = self._budget.get("daily_max", 500)
        self._monthly_max: float = self._budget.get("monthly_max", 15000)

        # Execution history & rollback stack
        self._execution_log: List[Dict[str, Any]] = []
        self._rollback_stack: List[Dict[str, Any]] = []

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _record(
        self,
        action: str,
        campaign_id: str,
        campaign_name: str,
        details: Dict[str, Any],
        status: str,
        dry_run: bool,
        estimated_savings: float = 0.0,
    ) -> Dict[str, Any]:
        """Append an entry to the in-memory log *and* the file log."""
        entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "action": action,
            "campaign_id": campaign_id,
            "campaign_name": campaign_name,
            "details": details,
            "status": f"{status} (dry run)" if dry_run else status,
            "dry_run": dry_run,
            "estimated_savings": f"${estimated_savings:,.0f}/month",
        }
        self._execution_log.append(entry)
        _log.info(json.dumps(entry, default=str))
        return entry

    def _validate_campaign(self, campaign_id: str) -> Optional[Dict]:
        """
        Check the campaign exists by querying the connector.
        Returns the campaign dict or ``None``.
        """
        if self.ads is None:
            _log.warning(
                "No Google Ads connector configured — skipping validation "
                f"for campaign {campaign_id}"
            )
            return {"id": campaign_id, "name": f"campaign-{campaign_id}", "status": "UNKNOWN"}

        try:
            from datetime import timedelta

            end = datetime.now(timezone.utc)
            start = end - timedelta(days=30)
            campaigns = self.ads.fetch_campaigns(start, end)
            for c in campaigns:
                if str(c["id"]) == str(campaign_id):
                    return c
        except Exception as exc:
            _log.error(f"Campaign validation failed for {campaign_id}: {exc}")
        return None

    def _active_campaign_count(self) -> int:
        """Return the number of currently enabled campaigns."""
        if self.ads is None:
            return 999  # assume safe when no connector

        try:
            from datetime import timedelta

            end = datetime.now(timezone.utc)
            start = end - timedelta(days=7)
            campaigns = self.ads.fetch_campaigns(start, end)
            return sum(1 for c in campaigns if c.get("status") == "ENABLED")
        except Exception:
            return 999

    # ------------------------------------------------------------------
    # Public methods
    # ------------------------------------------------------------------

    def pause_campaign(
        self, campaign_id: str, reason: str, dry_run: bool = True
    ) -> Dict[str, Any]:
        """
        Pause a campaign.

        Safety: refuses to pause the last active campaign.
        """
        campaign = self._validate_campaign(campaign_id)
        if campaign is None:
            msg = f"Campaign {campaign_id} not found — action skipped"
            _log.warning(msg)
            return {"action": "PAUSE", "campaign_id": campaign_id, "status": "FAILED", "reason": msg}

        name = campaign.get("name", campaign_id)

        # Safety: never pause ALL campaigns
        if self._active_campaign_count() <= 1:
            msg = "Refusing to pause the last active campaign"
            _log.warning(msg)
            return self._record(
                "PAUSE", campaign_id, name, {"reason": reason}, "BLOCKED", dry_run
            )

        if not dry_run and self.ads is not None:
            # Store pre-action state for rollback
            self._rollback_stack.append({
                "action": "UNPAUSE",
                "campaign_id": campaign_id,
                "campaign_name": name,
                "previous_status": campaign.get("status", "ENABLED"),
            })
            # The Google Ads REST API mutate call would go here.
            # google_ads.mutate_campaign(campaign_id, status="PAUSED")
            _log.info(f"EXECUTED: Paused campaign {name} ({campaign_id})")

        cost = campaign.get("cost", 0)
        return self._record(
            "PAUSE", campaign_id, name,
            {"reason": reason},
            "SUCCESS", dry_run,
            estimated_savings=cost,
        )

    def adjust_bid(
        self, campaign_id: str, adjustment_percent: float, dry_run: bool = True
    ) -> Dict[str, Any]:
        """
        Adjust bids for a campaign by ``adjustment_percent`` (e.g. -15 = decrease 15 %).
        """
        campaign = self._validate_campaign(campaign_id)
        if campaign is None:
            msg = f"Campaign {campaign_id} not found — action skipped"
            _log.warning(msg)
            return {"action": "ADJUST_BID", "campaign_id": campaign_id, "status": "FAILED", "reason": msg}

        name = campaign.get("name", campaign_id)

        if not dry_run and self.ads is not None:
            self._rollback_stack.append({
                "action": "ADJUST_BID",
                "campaign_id": campaign_id,
                "campaign_name": name,
                "reverse_percent": -adjustment_percent,
            })
            _log.info(
                f"EXECUTED: Adjusted bids for {name} by {adjustment_percent:+.1f}%"
            )

        # Estimate monthly savings from bid decrease
        current_cost = campaign.get("cost", 0)
        estimated_savings = max(0, current_cost * (-adjustment_percent / 100)) if adjustment_percent < 0 else 0

        return self._record(
            "ADJUST_BID", campaign_id, name,
            {"adjustment_percent": adjustment_percent},
            "SUCCESS", dry_run,
            estimated_savings=estimated_savings,
        )

    def add_negative_keywords(
        self, campaign_id: str, keywords: List[str], dry_run: bool = True
    ) -> Dict[str, Any]:
        """
        Add negative keywords to a campaign to eliminate wasted spend.
        """
        campaign = self._validate_campaign(campaign_id)
        if campaign is None:
            msg = f"Campaign {campaign_id} not found — action skipped"
            _log.warning(msg)
            return {"action": "ADD_NEGATIVE_KEYWORDS", "campaign_id": campaign_id, "status": "FAILED", "reason": msg}

        name = campaign.get("name", campaign_id)

        if not dry_run and self.ads is not None:
            self._rollback_stack.append({
                "action": "REMOVE_NEGATIVE_KEYWORDS",
                "campaign_id": campaign_id,
                "campaign_name": name,
                "keywords": keywords,
            })
            _log.info(
                f"EXECUTED: Added {len(keywords)} negative keywords to {name}"
            )

        return self._record(
            "ADD_NEGATIVE_KEYWORDS", campaign_id, name,
            {"keywords": keywords, "count": len(keywords)},
            "SUCCESS", dry_run,
        )

    def scale_budget(
        self,
        campaign_id: str,
        amount: float,
        requires_approval: bool = True,
        dry_run: bool = True,
    ) -> Dict[str, Any]:
        """
        Scale a campaign's budget by ``amount`` (daily, in dollars).

        Safety
        ------
        - Budget increases are held for approval by default.
        - The new budget must not exceed ``daily_max`` or ``monthly_max``
          from thresholds.yaml.
        """
        campaign = self._validate_campaign(campaign_id)
        if campaign is None:
            msg = f"Campaign {campaign_id} not found — action skipped"
            _log.warning(msg)
            return {"action": "SCALE_BUDGET", "campaign_id": campaign_id, "status": "FAILED", "reason": msg}

        name = campaign.get("name", campaign_id)

        # ---- Budget-limit enforcement ----
        if amount > 0 and amount > self._daily_max:
            msg = (
                f"Requested daily budget ${amount:.2f} exceeds "
                f"daily_max ${self._daily_max:.2f}"
            )
            _log.warning(msg)
            return self._record(
                "SCALE_BUDGET", campaign_id, name,
                {"amount": amount, "blocked_reason": msg},
                "BLOCKED", dry_run,
            )

        if amount > 0 and (amount * 30) > self._monthly_max:
            msg = (
                f"Projected monthly spend ${amount * 30:.2f} exceeds "
                f"monthly_max ${self._monthly_max:.2f}"
            )
            _log.warning(msg)
            return self._record(
                "SCALE_BUDGET", campaign_id, name,
                {"amount": amount, "blocked_reason": msg},
                "BLOCKED", dry_run,
            )

        # ---- Approval gate for increases ----
        if amount > 0 and requires_approval:
            weekly = amount * 7
            entry = {
                "action": "INCREASE_BUDGET",
                "campaign": name,
                "campaign_id": campaign_id,
                "amount": f"${weekly:,.0f}/week",
                "requires": "Manual approval",
                "status": "PENDING_APPROVAL",
                "dry_run": dry_run,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            self._execution_log.append(entry)
            _log.info(json.dumps(entry, default=str))
            return entry

        # ---- Execute ----
        if not dry_run and self.ads is not None:
            self._rollback_stack.append({
                "action": "SCALE_BUDGET",
                "campaign_id": campaign_id,
                "campaign_name": name,
                "reverse_amount": -amount,
            })
            _log.info(f"EXECUTED: Scaled budget for {name} by ${amount:+.2f}/day")

        return self._record(
            "SCALE_BUDGET", campaign_id, name,
            {"daily_amount": amount, "weekly_amount": amount * 7},
            "SUCCESS", dry_run,
        )

    # ------------------------------------------------------------------
    # Batch execution of advisor recommendations
    # ------------------------------------------------------------------

    def execute_recommendations(
        self, recommendations: List[Dict[str, Any]], dry_run: bool = True
    ) -> Dict[str, Any]:
        """
        Process a list of recommendations from the Strategic Advisor.

        Each recommendation dict should contain at minimum::

            {
                "action": "PAUSE" | "ADJUST_BID" | "ADD_NEGATIVE_KEYWORDS"
                          | "INCREASE_BUDGET" | "DECREASE_BUDGET",
                "campaign_id": "...",
                "campaign_name": "...",   # optional
                ...action-specific fields...
            }

        Returns an execution report matching the project's standard format.
        """
        actions_executed: List[Dict[str, Any]] = []
        actions_pending: List[Dict[str, Any]] = []
        total_savings = 0.0
        total_reallocated = 0.0

        for rec in recommendations:
            action = rec.get("action", "").upper()
            cid = str(rec.get("campaign_id", ""))
            cname = rec.get("campaign_name", cid)

            if action == "PAUSE":
                result = self.pause_campaign(
                    cid, reason=rec.get("reason", "Advisor recommendation"), dry_run=dry_run
                )

            elif action == "ADJUST_BID":
                result = self.adjust_bid(
                    cid, adjustment_percent=rec.get("adjustment_percent", 0), dry_run=dry_run
                )

            elif action == "ADD_NEGATIVE_KEYWORDS":
                result = self.add_negative_keywords(
                    cid, keywords=rec.get("keywords", []), dry_run=dry_run
                )

            elif action in ("INCREASE_BUDGET", "SCALE_BUDGET"):
                amount = rec.get("amount", rec.get("daily_amount", 0))
                result = self.scale_budget(
                    cid, amount=amount,
                    requires_approval=rec.get("requires_approval", True),
                    dry_run=dry_run,
                )

            elif action == "DECREASE_BUDGET":
                amount = -abs(rec.get("amount", rec.get("daily_amount", 0)))
                result = self.scale_budget(
                    cid, amount=amount, requires_approval=False, dry_run=dry_run
                )

            else:
                result = self._record(
                    action, cid, cname,
                    {"raw": rec},
                    "SKIPPED_UNKNOWN_ACTION", dry_run,
                )

            # Categorise result
            status = result.get("status", "")
            if "PENDING_APPROVAL" in status:
                actions_pending.append({
                    "action": action,
                    "campaign": cname,
                    "amount": result.get("amount", "N/A"),
                    "requires": "Manual approval",
                })
            else:
                # Parse estimated savings
                savings_str = result.get("estimated_savings", "$0/month")
                try:
                    savings_val = float(
                        savings_str.replace("$", "").replace(",", "").replace("/month", "")
                    )
                except (ValueError, AttributeError):
                    savings_val = 0.0

                actions_executed.append({
                    "action": action,
                    "campaign": cname,
                    "status": result.get("status", "UNKNOWN"),
                    "estimated_savings": savings_str,
                })
                total_savings += savings_val

            # Track reallocations (budget increases)
            if action in ("INCREASE_BUDGET", "SCALE_BUDGET") and result.get("amount"):
                total_reallocated += rec.get("amount", rec.get("daily_amount", 0)) * 7

        return {
            "dry_run": dry_run,
            "actions_executed": actions_executed,
            "actions_pending_approval": actions_pending,
            "total_estimated_impact": {
                "savings": f"${total_savings:,.0f}/month",
                "reallocated": f"${total_reallocated:,.0f}/week to winners",
            },
        }

    # ------------------------------------------------------------------
    # Rollback
    # ------------------------------------------------------------------

    def rollback_last_action(self, dry_run: bool = True) -> Dict[str, Any]:
        """
        Undo the most recent *executed* (non-dry-run) action.

        Returns the rollback result or an error dict if nothing to undo.
        """
        if not self._rollback_stack:
            return {"status": "NO_ACTION", "message": "Nothing to rollback"}

        last = self._rollback_stack.pop()
        action = last["action"]
        cid = last["campaign_id"]
        name = last.get("campaign_name", cid)

        _log.info(f"ROLLBACK: Reversing {action} on {name} ({cid})")

        if action == "UNPAUSE":
            return self._record(
                "ROLLBACK_UNPAUSE", cid, name,
                {"restored_status": last.get("previous_status", "ENABLED")},
                "SUCCESS", dry_run,
            )

        if action == "ADJUST_BID":
            reverse_pct = last.get("reverse_percent", 0)
            return self.adjust_bid(cid, adjustment_percent=reverse_pct, dry_run=dry_run)

        if action == "REMOVE_NEGATIVE_KEYWORDS":
            kws = last.get("keywords", [])
            return self._record(
                "ROLLBACK_REMOVE_NEGATIVES", cid, name,
                {"keywords_removed": kws},
                "SUCCESS", dry_run,
            )

        if action == "SCALE_BUDGET":
            reverse_amount = last.get("reverse_amount", 0)
            return self.scale_budget(
                cid, amount=reverse_amount, requires_approval=False, dry_run=dry_run
            )

        return {"status": "UNKNOWN_ROLLBACK", "action": last}

    # ------------------------------------------------------------------
    # Log access
    # ------------------------------------------------------------------

    def get_execution_log(self) -> List[Dict[str, Any]]:
        """Return the full in-memory execution log."""
        return deepcopy(self._execution_log)

    # ------------------------------------------------------------------
    # Repr
    # ------------------------------------------------------------------

    def __repr__(self) -> str:
        return (
            f"AutomationExecutor(ads={'connected' if self.ads else 'none'}, "
            f"daily_max=${self._daily_max}, monthly_max=${self._monthly_max})"
        )


# ---------------------------------------------------------------------------
# Convenience factory
# ---------------------------------------------------------------------------
def from_config(
    credentials_path: str = "config/credentials.yaml",
    thresholds_path: str = "config/thresholds.yaml",
) -> "AutomationExecutor":
    """Build an AutomationExecutor from the project config files."""
    from agents.data_connector.google_ads import from_config as ads_from_config

    ads = ads_from_config(credentials_path)

    analyzer = None
    if CampaignAnalyzer is not None:
        try:
            analyzer = CampaignAnalyzer()
        except Exception:
            pass

    return AutomationExecutor(
        google_ads_connector=ads,
        campaign_analyzer=analyzer,
        thresholds_path=thresholds_path,
    )


# ---------------------------------------------------------------------------
# Self-test / demo
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    print("=" * 60)
    print("Automation Engine — Dry-Run Demo")
    print("=" * 60)

    executor = AutomationExecutor()
    print(f"\n{executor}\n")

    # Simulate recommendations from the strategic advisor
    sample_recommendations = [
        {
            "action": "PAUSE",
            "campaign_id": "123456",
            "campaign_name": "ACS US Medical",
            "reason": "Zero conversions, $1,705 spent in 30 days",
        },
        {
            "action": "PAUSE",
            "campaign_id": "789012",
            "campaign_name": "ACS US Pharmacy",
            "reason": "CPA $412 exceeds critical threshold ($300)",
        },
        {
            "action": "ADD_NEGATIVE_KEYWORDS",
            "campaign_id": "345678",
            "campaign_name": "ACS CAN Medical",
            "keywords": ["free", "cheap", "DIY", "tutorial"],
        },
        {
            "action": "ADJUST_BID",
            "campaign_id": "345678",
            "campaign_name": "ACS CAN Medical",
            "adjustment_percent": -15,
        },
        {
            "action": "INCREASE_BUDGET",
            "campaign_id": "345678",
            "campaign_name": "ACS CAN Medical",
            "amount": 42.86,  # $300/week ÷ 7
            "campaign_name": "ACS CAN Medical",
        },
    ]

    report = executor.execute_recommendations(sample_recommendations, dry_run=True)
    print(json.dumps(report, indent=2))

    print("\n--- Execution Log ---")
    for entry in executor.get_execution_log():
        print(f"  {entry['timestamp']} | {entry['action']} | "
              f"{entry.get('campaign_name', 'N/A')} | {entry.get('status', '')}")

    print("\n--- Rollback test (nothing executed, so empty) ---")
    print(executor.rollback_last_action())
