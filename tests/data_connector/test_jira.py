"""Unit tests for JiraConnector compute methods.

Stubs `JiraConnector.search` so we exercise the pure classification
logic without touching the network. The transport / auth path
(`_get`, retry/backoff) is intentionally not covered here.
"""

from datetime import date

import pytest

from agents.data_connector.jira import JiraConnector

END_DATE_FIELD = "customfield_10892"


# ── Helpers ────────────────────────────────────────────────────────────────


def make_issue(
    key="DELIVERY-1",
    duedate=None,
    resolutiondate=None,
    end_date=None,
    status_category="in progress",
    issuetype="Task",
    labels=None,
):
    """Build a Jira-issue-shaped dict the way the search API returns them."""
    fields = {
        "duedate": duedate,
        "resolutiondate": resolutiondate,
        "status": {"statusCategory": {"key": status_category}},
        "issuetype": {"name": issuetype},
        "labels": labels or [],
    }
    if end_date is not None:
        fields[END_DATE_FIELD] = end_date
    return {"key": key, "fields": fields}


def make_connector():
    """Build a connector without exercising the transport layer."""
    return JiraConnector(
        site_url="https://example.atlassian.net",
        email="bot@example.com",
        api_token="dummy",
    )


def stub_search(connector, issues):
    """Stub the connector's `search` to return canned issues. Records
    the JQL passed in so tests can assert on it."""
    captured = {}

    def _search(jql, fields, page_size=100):
        captured["jql"] = jql
        captured["fields"] = fields
        return list(issues)

    connector.search = _search
    return captured


# ── _compute_say_do_window: bucket classification ──────────────────────────


class TestComputeSayDoWindow:

    def test_resolved_on_time_via_resolutiondate(self):
        c = make_connector()
        stub_search(c, [
            make_issue(
                duedate="2026-04-15",
                resolutiondate="2026-04-14T10:00:00.000-0400",
                status_category="done",
            ),
        ])
        r = c._compute_say_do_window("DELIVERY", date(2026, 4, 1), date(2026, 4, 30))
        assert r["on_time"] == 1
        assert r["resolved_late"] == 0
        assert r["overdue_open"] == 0
        assert r["ratio"] == 1.0

    def test_resolved_late_via_resolutiondate(self):
        c = make_connector()
        stub_search(c, [
            make_issue(
                duedate="2026-04-15",
                resolutiondate="2026-04-20T10:00:00.000-0400",
                status_category="done",
            ),
        ])
        r = c._compute_say_do_window("DELIVERY", date(2026, 4, 1), date(2026, 4, 30))
        assert r["on_time"] == 0
        assert r["resolved_late"] == 1
        assert r["overdue_open"] == 0
        assert r["late"] == 1
        assert r["ratio"] == 0.0

    def test_overdue_open_when_not_done(self):
        c = make_connector()
        stub_search(c, [
            make_issue(duedate="2026-04-15", status_category="in progress"),
        ])
        r = c._compute_say_do_window("DELIVERY", date(2026, 4, 1), date(2026, 4, 30))
        assert r["overdue_open"] == 1
        assert r["on_time"] == 0
        assert r["ratio"] == 0.0

    def test_end_date_used_when_resolutiondate_missing(self):
        """The DELIVERY workflow sometimes closes issues without setting
        resolutiondate; End Date custom field is the fallback."""
        c = make_connector()
        stub_search(c, [
            make_issue(
                duedate="2026-04-15",
                resolutiondate=None,
                end_date="2026-04-15",
                status_category="done",
            ),
        ])
        r = c._compute_say_do_window("DELIVERY", date(2026, 4, 1), date(2026, 4, 30))
        assert r["on_time"] == 1
        assert r["overdue_open"] == 0

    def test_end_date_preferred_over_resolutiondate(self):
        """When both fields are set the team-maintained End Date wins."""
        c = make_connector()
        stub_search(c, [
            make_issue(
                duedate="2026-04-15",
                # End Date in time, resolutiondate after due — End Date wins
                end_date="2026-04-14",
                resolutiondate="2026-04-20T10:00:00.000-0400",
                status_category="done",
            ),
        ])
        r = c._compute_say_do_window("DELIVERY", date(2026, 4, 1), date(2026, 4, 30))
        assert r["on_time"] == 1
        assert r["resolved_late"] == 0

    def test_end_date_ignored_when_status_not_done(self):
        """An End Date set on an in-flight issue must NOT count as complete."""
        c = make_connector()
        stub_search(c, [
            make_issue(
                duedate="2026-04-15",
                end_date="2026-04-14",
                status_category="in progress",
            ),
        ])
        r = c._compute_say_do_window("DELIVERY", date(2026, 4, 1), date(2026, 4, 30))
        assert r["overdue_open"] == 1
        assert r["on_time"] == 0

    def test_missing_duedate_skipped(self):
        c = make_connector()
        stub_search(c, [
            make_issue(duedate=None, status_category="done"),
            make_issue(
                duedate="2026-04-15",
                resolutiondate="2026-04-15T09:00:00.000-0400",
                status_category="done",
            ),
        ])
        r = c._compute_say_do_window("DELIVERY", date(2026, 4, 1), date(2026, 4, 30))
        assert r["total"] == 1
        assert r["on_time"] == 1

    def test_empty_population_ratio_is_none(self):
        c = make_connector()
        stub_search(c, [])
        r = c._compute_say_do_window("DELIVERY", date(2026, 4, 1), date(2026, 4, 30))
        assert r["total"] == 0
        assert r["ratio"] is None
        assert r["window_start"] == "2026-04-01"
        assert r["window_end"] == "2026-04-30"

    def test_jql_uses_absolute_dates_and_excludes_epic(self):
        c = make_connector()
        captured = stub_search(c, [])
        c._compute_say_do_window("DELIVERY", date(2026, 1, 1), date(2026, 3, 31))
        jql = captured["jql"]
        assert 'issuetype != Epic' in jql
        assert '"2026-01-01"' in jql
        assert '"2026-03-31"' in jql
        assert 'duedate >=' in jql and 'duedate <=' in jql

    def test_grace_1d_promotes_one_day_late_to_on_time(self):
        """An issue completed exactly 1 day past due is late under strict
        but on-time under 1-day grace."""
        c = make_connector()
        stub_search(c, [
            make_issue(
                duedate="2026-04-15",
                end_date="2026-04-16",
                status_category="done",
            ),
        ])
        r = c._compute_say_do_window("DELIVERY", date(2026, 4, 1), date(2026, 4, 30))
        assert r["on_time"] == 0
        assert r["resolved_late"] == 1
        assert r["ratio"] == 0.0
        assert r["on_time_grace_1d"] == 1
        assert r["resolved_late_grace_1d"] == 0
        assert r["ratio_grace_1d"] == 1.0

    def test_grace_1d_does_not_help_two_day_late(self):
        """Grace is exactly 1 day — completion 2 days past due stays late."""
        c = make_connector()
        stub_search(c, [
            make_issue(
                duedate="2026-04-15",
                end_date="2026-04-17",
                status_category="done",
            ),
        ])
        r = c._compute_say_do_window("DELIVERY", date(2026, 4, 1), date(2026, 4, 30))
        assert r["resolved_late"] == 1
        assert r["resolved_late_grace_1d"] == 1
        assert r["on_time_grace_1d"] == 0
        assert r["ratio_grace_1d"] == 0.0

    def test_grace_1d_does_not_rescue_overdue_open(self):
        """An issue that's still open is never on-time, regardless of grace."""
        c = make_connector()
        stub_search(c, [
            make_issue(duedate="2026-04-15", status_category="in progress"),
        ])
        r = c._compute_say_do_window("DELIVERY", date(2026, 4, 1), date(2026, 4, 30))
        assert r["overdue_open"] == 1
        assert r["on_time_grace_1d"] == 0
        assert r["late_grace_1d"] == 1
        assert r["ratio_grace_1d"] == 0.0

    def test_grace_1d_mixed_population(self):
        c = make_connector()
        stub_search(c, [
            # On-time strict — also on-time at grace
            make_issue(duedate="2026-04-10", end_date="2026-04-10", status_category="done"),
            # Resolved 1 day late — late strict, on-time at grace
            make_issue(duedate="2026-04-12", end_date="2026-04-13", status_category="done"),
            # Resolved 3 days late — late under both
            make_issue(duedate="2026-04-15", end_date="2026-04-18", status_category="done"),
            # Still open — late under both
            make_issue(duedate="2026-04-20", status_category="in progress"),
        ])
        r = c._compute_say_do_window("DELIVERY", date(2026, 4, 1), date(2026, 4, 30))
        assert r["on_time"] == 1
        assert r["resolved_late"] == 2
        assert r["overdue_open"] == 1
        assert r["ratio"] == 0.25
        assert r["on_time_grace_1d"] == 2
        assert r["resolved_late_grace_1d"] == 1
        assert r["late_grace_1d"] == 2
        assert r["ratio_grace_1d"] == 0.5

    def test_grace_1d_empty_population_is_none(self):
        c = make_connector()
        stub_search(c, [])
        r = c._compute_say_do_window("DELIVERY", date(2026, 4, 1), date(2026, 4, 30))
        assert r["ratio_grace_1d"] is None
        assert r["on_time_grace_1d"] == 0

    def test_ratio_computation_mixed_population(self):
        c = make_connector()
        stub_search(c, [
            # 3 on time
            make_issue(duedate="2026-04-10", end_date="2026-04-10", status_category="done"),
            make_issue(duedate="2026-04-12", end_date="2026-04-11", status_category="done"),
            make_issue(duedate="2026-04-15",
                       resolutiondate="2026-04-14T08:00:00Z",
                       status_category="done"),
            # 2 late
            make_issue(duedate="2026-04-10",
                       resolutiondate="2026-04-15T08:00:00Z",
                       status_category="done"),
            make_issue(duedate="2026-04-10", end_date="2026-04-12", status_category="done"),
            # 1 overdue open
            make_issue(duedate="2026-04-15", status_category="in progress"),
        ])
        r = c._compute_say_do_window("DELIVERY", date(2026, 4, 1), date(2026, 4, 30))
        assert r["on_time"] == 3
        assert r["resolved_late"] == 2
        assert r["overdue_open"] == 1
        assert r["total"] == 6
        assert r["late"] == 3
        assert r["ratio"] == 0.5


# ── compute_say_do_ratio: lookback wrapper ─────────────────────────────────


class TestComputeSayDoRatio:

    def test_wraps_window_helper_and_carries_period_days(self):
        c = make_connector()
        stub_search(c, [
            make_issue(
                duedate="2026-04-15",
                resolutiondate="2026-04-15T08:00:00Z",
                status_category="done",
            ),
        ])
        r = c.compute_say_do_ratio("DELIVERY", lookback_days=30)
        assert r["period_days"] == 30
        # Output shape should still include the window-helper keys
        assert "window_start" in r and "window_end" in r


# ── compute_say_do_ratio_by_quarter ────────────────────────────────────────


class TestComputeSayDoByQuarter:

    def test_returns_n_quarters_oldest_first(self):
        c = make_connector()
        stub_search(c, [])
        # April 28, 2026 is in Q2 2026
        out = c.compute_say_do_ratio_by_quarter(
            "DELIVERY", num_quarters=4, reference=date(2026, 4, 28),
        )
        assert [q["quarter"] for q in out] == [
            "Q3 2025", "Q4 2025", "Q1 2026", "Q2 2026",
        ]

    def test_current_quarter_window_capped_at_reference(self):
        c = make_connector()
        stub_search(c, [])
        out = c.compute_say_do_ratio_by_quarter(
            "DELIVERY", num_quarters=1, reference=date(2026, 4, 28),
        )
        assert out[0]["quarter"] == "Q2 2026"
        assert out[0]["window_start"] == "2026-04-01"
        assert out[0]["window_end"] == "2026-04-28"  # NOT 2026-06-30

    def test_past_quarter_window_uses_full_quarter(self):
        c = make_connector()
        stub_search(c, [])
        out = c.compute_say_do_ratio_by_quarter(
            "DELIVERY", num_quarters=2, reference=date(2026, 4, 28),
        )
        # Q1 2026 = Jan 1 to Mar 31
        q1 = next(q for q in out if q["quarter"] == "Q1 2026")
        assert q1["window_start"] == "2026-01-01"
        assert q1["window_end"] == "2026-03-31"

    def test_year_boundary_walks_back_correctly(self):
        c = make_connector()
        stub_search(c, [])
        # Jan 15 2026 is in Q1 2026; 4 quarters back goes into 2025
        out = c.compute_say_do_ratio_by_quarter(
            "DELIVERY", num_quarters=4, reference=date(2026, 1, 15),
        )
        assert [q["quarter"] for q in out] == [
            "Q2 2025", "Q3 2025", "Q4 2025", "Q1 2026",
        ]
        q4_2025 = next(q for q in out if q["quarter"] == "Q4 2025")
        assert q4_2025["window_start"] == "2025-10-01"
        assert q4_2025["window_end"] == "2025-12-31"


# ── compute_strategic_allocation ────────────────────────────────────────────


class TestStrategicAllocation:

    @staticmethod
    def labeled(*labels):
        return {"key": "X", "fields": {"labels": list(labels)}}

    def test_no_labels_counts_as_strategic(self):
        c = make_connector()
        stub_search(c, [self.labeled(), self.labeled()])
        r = c.compute_strategic_allocation("DELIVERY", lookback_days=90)
        assert r["strategic"] == 2
        assert r["non_strategic"] == 0
        assert r["ratio"] == 1.0

    def test_kilo_label_marks_non_strategic(self):
        c = make_connector()
        stub_search(c, [self.labeled("KILO"), self.labeled()])
        r = c.compute_strategic_allocation("DELIVERY", lookback_days=90)
        assert r["strategic"] == 1
        assert r["non_strategic"] == 1
        assert r["ratio"] == 0.5

    def test_ktlo_label_marks_non_strategic(self):
        c = make_connector()
        stub_search(c, [self.labeled("KTLO")])
        r = c.compute_strategic_allocation("DELIVERY", lookback_days=90)
        assert r["non_strategic"] == 1
        assert r["strategic"] == 0

    def test_label_match_is_case_insensitive(self):
        c = make_connector()
        stub_search(c, [
            self.labeled("kilo"),
            self.labeled("Ktlo"),
            self.labeled("KILO"),
        ])
        r = c.compute_strategic_allocation("DELIVERY", lookback_days=90)
        assert r["non_strategic"] == 3
        assert r["strategic"] == 0

    def test_mixed_labels_with_kilo_counts_as_non_strategic(self):
        """Any KILO/KTLO label flips the issue to non-strategic, even if
        other labels are present too."""
        c = make_connector()
        stub_search(c, [self.labeled("KILO", "frontend", "urgent")])
        r = c.compute_strategic_allocation("DELIVERY", lookback_days=90)
        assert r["non_strategic"] == 1
        assert r["strategic"] == 0

    def test_empty_population_ratio_is_none(self):
        c = make_connector()
        stub_search(c, [])
        r = c.compute_strategic_allocation("DELIVERY", lookback_days=90)
        assert r["total"] == 0
        assert r["ratio"] is None

    def test_jql_uses_resolved_window(self):
        c = make_connector()
        captured = stub_search(c, [])
        c.compute_strategic_allocation("DELIVERY", lookback_days=30)
        jql = captured["jql"]
        assert "resolved >= -30d" in jql
        assert "issuetype != Epic" in jql


# ── describe_tagging_requirements ───────────────────────────────────────────


def test_describe_tagging_requirements_returns_expected_keys():
    out = JiraConnector.describe_tagging_requirements()
    assert set(out.keys()) == {
        "strategic_allocation",
        "bug_reduction",
        "ai_products_launched",
        "ai_skills_pilots",
    }
    # Sanity-check: KILO/KTLO is mentioned in the strategic_allocation entry
    assert "KILO" in out["strategic_allocation"]
    assert "KTLO" in out["strategic_allocation"]
