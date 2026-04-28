"""Unit tests for SalesforceConnector compute methods.

Bypasses `__init__` (which would otherwise call simple_salesforce.Salesforce
and authenticate) via `__new__`, then injects a mock `sf.query` so tests
exercise window math + result parsing without a real SF instance.
"""

from datetime import date
from unittest.mock import MagicMock

import pytest

from agents.data_connector.salesforce import SalesforceConnector


# ── Helpers ────────────────────────────────────────────────────────────────


def make_connector(mrr_field="Amount", query_records=None):
    """Build a connector skipping the simple_salesforce login path."""
    c = SalesforceConnector.__new__(SalesforceConnector)
    c.sf = MagicMock()
    c.sf.query = MagicMock(
        return_value={"records": query_records or [{}]}
    )
    c.instance_url = "https://test.my.salesforce.com"
    c.mrr_field = mrr_field
    return c


# ── compute_new_mrr_added ──────────────────────────────────────────────────


class TestComputeNewMrrAdded:

    def test_month_window_starts_first_of_month(self):
        c = make_connector(query_records=[{"total_value": 0, "won_count": 0}])
        r = c.compute_new_mrr_added(window="month", reference=date(2026, 4, 28))
        assert r["window_start"] == "2026-04-01"
        assert r["window_end"] == "2026-04-28"
        assert r["window"] == "month"

    def test_quarter_window_starts_first_of_quarter(self):
        c = make_connector(query_records=[{"total_value": 0, "won_count": 0}])
        # April 28 is in Q2 2026 (Apr 1 - Jun 30)
        r = c.compute_new_mrr_added(window="quarter", reference=date(2026, 4, 28))
        assert r["window_start"] == "2026-04-01"
        assert r["window_end"] == "2026-04-28"

    @pytest.mark.parametrize("ref,expected_start", [
        (date(2026, 1, 15), "2026-01-01"),  # Q1
        (date(2026, 5, 1),  "2026-04-01"),  # Q2
        (date(2026, 8, 31), "2026-07-01"),  # Q3
        (date(2026, 12, 1), "2026-10-01"),  # Q4
    ])
    def test_quarter_window_boundary_matrix(self, ref, expected_start):
        c = make_connector(query_records=[{"total_value": 0, "won_count": 0}])
        r = c.compute_new_mrr_added(window="quarter", reference=ref)
        assert r["window_start"] == expected_start

    def test_invalid_window_raises_value_error(self):
        c = make_connector()
        with pytest.raises(ValueError, match="unsupported window"):
            c.compute_new_mrr_added(window="year", reference=date(2026, 4, 28))

    def test_parses_aliased_aggregate_keys(self):
        c = make_connector(query_records=[
            {"total_value": 35400, "won_count": 5},
        ])
        r = c.compute_new_mrr_added(window="month", reference=date(2026, 4, 28))
        assert r["value"] == 35400.0
        assert r["won_count"] == 5

    def test_falls_back_to_expr_keys_when_alias_does_not_take(self):
        """Salesforce sometimes returns aggregates as expr0/expr1 even when
        the SOQL specifies an alias. The connector must handle both."""
        c = make_connector(query_records=[
            {"expr0": 12000.0, "expr1": 3},
        ])
        r = c.compute_new_mrr_added(window="month", reference=date(2026, 4, 28))
        assert r["value"] == 12000.0
        assert r["won_count"] == 3

    def test_empty_records_returns_zero(self):
        c = make_connector(query_records=[])
        r = c.compute_new_mrr_added(window="month", reference=date(2026, 4, 28))
        assert r["value"] == 0
        assert r["won_count"] == 0

    def test_null_aggregates_return_zero(self):
        """COUNT/SUM on an empty Opportunity table yields nulls."""
        c = make_connector(query_records=[
            {"total_value": None, "won_count": None},
        ])
        r = c.compute_new_mrr_added(window="month", reference=date(2026, 4, 28))
        assert r["value"] == 0
        assert r["won_count"] == 0

    def test_soql_uses_configured_mrr_field(self):
        c = make_connector(mrr_field="MRR__c",
                           query_records=[{"total_value": 0, "won_count": 0}])
        c.compute_new_mrr_added(window="month", reference=date(2026, 4, 28))
        soql = c.sf.query.call_args.args[0]
        assert "SUM(MRR__c)" in soql
        assert "FROM Opportunity" in soql
        assert "IsWon = TRUE" in soql

    def test_soql_uses_window_dates(self):
        c = make_connector(query_records=[{"total_value": 0, "won_count": 0}])
        c.compute_new_mrr_added(window="month", reference=date(2026, 4, 28))
        soql = c.sf.query.call_args.args[0]
        assert "CloseDate >= 2026-04-01" in soql
        assert "CloseDate <= 2026-04-28" in soql

    def test_field_echoed_in_response(self):
        c = make_connector(mrr_field="MRR__c",
                           query_records=[{"total_value": 0, "won_count": 0}])
        r = c.compute_new_mrr_added(window="month", reference=date(2026, 4, 28))
        assert r["field"] == "MRR__c"


# ── describe_field_requirements ─────────────────────────────────────────────


def test_describe_field_requirements_returns_admin_questions():
    out = SalesforceConnector.describe_field_requirements()
    expected_keys = {
        "mrr_field",
        "new_vs_expansion",
        "segment",
        "health_score",
        "partner_channel",
        "customer_facing_bug",
        "referral_source",
    }
    assert set(out.keys()) == expected_keys
    # Each entry should be a non-empty string
    assert all(isinstance(v, str) and v for v in out.values())
