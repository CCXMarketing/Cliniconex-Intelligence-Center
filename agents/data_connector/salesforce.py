"""
Salesforce connector for OKR dashboard KPIs.

First KPI: `new_mrr_added` (Sales tab) — proves auth and mirrors the
way `say_do_ratio` kicked off the Jira connector.

Auth: OAuth 2.0 password flow via a Connected App + integration user.
JWT Bearer flow can slot in later by adding a branch to the constructor
when the SF admin prefers that path.

Other Sales / CS / Exec KPIs are blocked on knowing the org's custom
field API names (MRR, segment, customer health score, etc.). The
`mrr_field` constructor arg is kept configurable so we can flip from
the placeholder default without a code change once the schema is
confirmed.
"""

import logging
from datetime import date
from typing import Dict, Optional

logger = logging.getLogger(__name__)


class ConnectionResult(dict):
    """Dict subclass that is truthy when connected (mirrors Jira pattern)."""

    def __bool__(self):
        return bool(self.get("connected", False))


class SalesforceConnector:
    """Connector for Salesforce REST API via simple-salesforce."""

    def __init__(
        self,
        instance_url: str,
        username: str,
        password: str,
        security_token: str,
        consumer_key: Optional[str] = None,
        consumer_secret: Optional[str] = None,
        domain: str = "login",
        mrr_field: str = "Amount",
    ):
        """
        Args:
            instance_url: e.g. https://cliniconex.my.salesforce.com (informational)
            username, password, security_token: integration user credentials
            consumer_key, consumer_secret: from the Connected App. If both are
                provided we go through OAuth 2.0 password grant; otherwise the
                client falls back to the legacy SOAP login.
            domain: 'login' for production, 'test' for a sandbox
            mrr_field: SOQL field name on Opportunity for the recurring-revenue
                amount. Defaults to standard `Amount` until the org's custom
                MRR field is known (likely something like `MRR__c`).
        """
        from simple_salesforce import Salesforce

        kwargs = dict(
            username=username,
            password=password,
            security_token=security_token,
            domain=domain,
        )
        if consumer_key and consumer_secret:
            kwargs["consumer_key"] = consumer_key
            kwargs["consumer_secret"] = consumer_secret

        self.sf = Salesforce(**kwargs)
        self.instance_url = instance_url.rstrip("/")
        self.mrr_field = mrr_field

    # ── Introspection ───────────────────────────────────────────────────────

    def test_connection(self) -> ConnectionResult:
        """Round-trip a cheap call to verify auth + reachability."""
        try:
            info = self.sf.query("SELECT Id, Username FROM User LIMIT 1")
            user = (info.get("records") or [{}])[0]
            return ConnectionResult(
                connected=True,
                instance=self.instance_url,
                user_id=user.get("Id"),
                username=user.get("Username"),
            )
        except Exception as e:
            return ConnectionResult(connected=False, error=str(e))

    # ── KPI: New MRR Added (Phase 1) ────────────────────────────────────────

    def compute_new_mrr_added(
        self, window: str = "month", reference: Optional[date] = None
    ) -> Dict:
        """
        Sum of recurring-revenue-equivalent on Opportunities won in the window.

        Args:
            window: 'month' or 'quarter'
            reference: optional anchor date (defaults to today)

        Returns:
            {
              "value": float,
              "won_count": int,
              "window": str,
              "window_start": str,   # ISO date
              "window_end": str,     # ISO date
              "field": str,          # which SOQL field was summed
            }

        Open questions to reconcile against the actual SF schema:
        - The right SOQL field for monthly recurring revenue (likely
          a `MRR__c` custom field rather than `Amount`).
        - Whether to filter `Type = 'New Business'` to exclude
          expansion deals from this KPI.
        - Whether `IsWon = TRUE` matches the StageName values the
          team treats as closed-won (it should — `IsWon` is a
          standard derived bool — but worth confirming).
        """
        ref = reference or date.today()
        if window == "month":
            start = date(ref.year, ref.month, 1)
        elif window == "quarter":
            q_idx = (ref.month - 1) // 3
            start = date(ref.year, q_idx * 3 + 1, 1)
        else:
            raise ValueError(f"unsupported window: {window!r}")

        end = ref
        soql = (
            f"SELECT SUM({self.mrr_field}) total_value, COUNT(Id) won_count "
            f"FROM Opportunity "
            f"WHERE IsWon = TRUE "
            f"AND CloseDate >= {start.isoformat()} "
            f"AND CloseDate <= {end.isoformat()}"
        )
        result = self.sf.query(soql)
        row = (result.get("records") or [{}])[0]
        # Aggregate aliases land on the row object; SF also exposes them as
        # expr0/expr1 if the alias doesn't take. Fall back to that to be safe.
        total = row.get("total_value", row.get("expr0")) or 0
        count = row.get("won_count", row.get("expr1")) or 0

        return {
            "value": float(total),
            "won_count": int(count),
            "window": window,
            "window_start": start.isoformat(),
            "window_end": end.isoformat(),
            "field": self.mrr_field,
        }

    # ── Documentation ───────────────────────────────────────────────────────

    @staticmethod
    def describe_field_requirements() -> Dict[str, str]:
        """Open questions about SF custom fields that block additional KPIs.

        Hand this to the SF admin so they can answer in one round-trip.
        """
        return {
            "mrr_field": (
                "Which Opportunity field carries monthly recurring revenue? "
                "Default `Amount` will work for total deal value but not MRR. "
                "Likely candidates: MRR__c, Recurring_Revenue__c, ARR__c."
            ),
            "new_vs_expansion": (
                "How is New Logo distinguished from Expansion on Opportunity? "
                "Standard `Type` field, RecordType, or a custom flag?"
            ),
            "segment": (
                "Custom field on Opportunity (or Account) that classifies "
                "Senior Living / US Medical / Hospital — used for "
                "pipeline_by_segment and new_segment_bookings."
            ),
            "health_score": (
                "Account-level field for customer health (Red/Yellow/Green) — "
                "used for health_score_distribution and at_risk_account_value."
            ),
            "partner_channel": (
                "Account or Opportunity field identifying partner / channel "
                "(PCC / QHR / MxC / Direct) — used for revenue_by_partner."
            ),
            "customer_facing_bug": (
                "Case-level flag for 'visible to customers' vs internal — used "
                "for the bug_reduction Product KPI."
            ),
            "referral_source": (
                "Opportunity field capturing referral lead source — used for "
                "referral_influenced_pct."
            ),
        }
