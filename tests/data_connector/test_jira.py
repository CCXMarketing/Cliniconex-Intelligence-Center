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


START_DATE_FIELD = "customfield_10891"


def alloc_issue(*labels, timespent=None, start=None, end=None):
    """Build a strategic-allocation issue with optional time-tracking fields."""
    fields = {"labels": list(labels)}
    if timespent is not None:
        fields["timespent"] = timespent
    if start is not None:
        fields[START_DATE_FIELD] = start
    if end is not None:
        fields[END_DATE_FIELD] = end
    return {"key": "X", "fields": fields}


class TestStrategicAllocationCounts:
    """ratio_by_count remains the count-weighted ratio (legacy semantics)."""

    def test_no_labels_counts_as_strategic(self):
        c = make_connector()
        stub_search(c, [alloc_issue(), alloc_issue()])
        r = c.compute_strategic_allocation("DELIVERY", lookback_days=90)
        assert r["strategic"] == 2
        assert r["non_strategic"] == 0
        assert r["ratio_by_count"] == 1.0

    def test_kilo_label_marks_non_strategic(self):
        c = make_connector()
        stub_search(c, [alloc_issue("KILO"), alloc_issue()])
        r = c.compute_strategic_allocation("DELIVERY", lookback_days=90)
        assert r["strategic"] == 1
        assert r["non_strategic"] == 1
        assert r["ratio_by_count"] == 0.5

    def test_ktlo_label_marks_non_strategic(self):
        c = make_connector()
        stub_search(c, [alloc_issue("KTLO")])
        r = c.compute_strategic_allocation("DELIVERY", lookback_days=90)
        assert r["non_strategic"] == 1
        assert r["strategic"] == 0

    def test_label_match_is_case_insensitive(self):
        c = make_connector()
        stub_search(c, [
            alloc_issue("kilo"),
            alloc_issue("Ktlo"),
            alloc_issue("KILO"),
        ])
        r = c.compute_strategic_allocation("DELIVERY", lookback_days=90)
        assert r["non_strategic"] == 3
        assert r["strategic"] == 0

    def test_mixed_labels_with_kilo_counts_as_non_strategic(self):
        """Any KILO/KTLO label flips the issue to non-strategic, even if
        other labels are present too."""
        c = make_connector()
        stub_search(c, [alloc_issue("KILO", "frontend", "urgent")])
        r = c.compute_strategic_allocation("DELIVERY", lookback_days=90)
        assert r["non_strategic"] == 1
        assert r["strategic"] == 0

    def test_empty_population_both_ratios_none(self):
        c = make_connector()
        stub_search(c, [])
        r = c.compute_strategic_allocation("DELIVERY", lookback_days=90)
        assert r["total"] == 0
        assert r["ratio"] is None
        assert r["ratio_by_count"] is None
        assert r["total_seconds"] == 0

    def test_jql_uses_resolved_window(self):
        c = make_connector()
        captured = stub_search(c, [])
        c.compute_strategic_allocation("DELIVERY", lookback_days=30)
        jql = captured["jql"]
        assert "resolved >=" in jql and "resolved <=" in jql
        assert "issuetype != Epic" in jql

    def test_no_time_data_yields_count_only_results(self):
        """Without timespent or Start/End, time-weighted ratio is None and
        all issues land in the no_data weight source."""
        c = make_connector()
        stub_search(c, [alloc_issue(), alloc_issue("KILO")])
        r = c.compute_strategic_allocation("DELIVERY", lookback_days=90)
        assert r["ratio"] is None
        assert r["ratio_by_count"] == 0.5
        assert r["weight_sources"] == {"timespent": 0, "date_span": 0, "no_data": 2}


class TestStrategicAllocationTimeWeighted:

    def test_timespent_drives_weighting(self):
        """Same count split (1 vs 1), but strategic logged 9x more time —
        time-weighted ratio is 0.9, count-weighted is 0.5."""
        c = make_connector()
        stub_search(c, [
            alloc_issue(timespent=9 * 3600),         # strategic, 9h
            alloc_issue("KILO", timespent=1 * 3600), # non-strategic, 1h
        ])
        r = c.compute_strategic_allocation("DELIVERY", lookback_days=90)
        assert r["strategic_seconds"] == 9 * 3600
        assert r["non_strategic_seconds"] == 1 * 3600
        assert r["total_seconds"] == 10 * 3600
        assert r["ratio"] == 0.9
        assert r["ratio_by_count"] == 0.5
        assert r["weight_sources"]["timespent"] == 2

    def test_date_span_used_when_timespent_absent(self):
        """Tier-2 fallback: 5-day span = 5*86400 seconds (inclusive)."""
        c = make_connector()
        stub_search(c, [
            alloc_issue(start="2026-04-01", end="2026-04-05"),
        ])
        r = c.compute_strategic_allocation(
            "DELIVERY", lookback_days=90, start_date_field=START_DATE_FIELD,
        )
        assert r["strategic_seconds"] == 5 * 86400
        assert r["weight_sources"]["date_span"] == 1
        assert r["ratio"] == 1.0

    def test_timespent_preferred_over_date_span(self):
        """When both signals are present, logged work wins."""
        c = make_connector()
        stub_search(c, [
            alloc_issue(timespent=2 * 3600, start="2026-04-01", end="2026-04-10"),
        ])
        r = c.compute_strategic_allocation(
            "DELIVERY", lookback_days=90, start_date_field=START_DATE_FIELD,
        )
        assert r["strategic_seconds"] == 2 * 3600  # not 10 days
        assert r["weight_sources"]["timespent"] == 1
        assert r["weight_sources"]["date_span"] == 0

    def test_date_span_skipped_when_start_field_not_configured(self):
        """Tier 2 is opt-in via start_date_field; without it, drop to no_data."""
        c = make_connector()
        stub_search(c, [
            alloc_issue(start="2026-04-01", end="2026-04-10"),
        ])
        r = c.compute_strategic_allocation("DELIVERY", lookback_days=90)
        assert r["weight_sources"]["no_data"] == 1
        assert r["weight_sources"]["date_span"] == 0
        assert r["total_seconds"] == 0

    def test_date_span_handles_iso_datetime_strings(self):
        """Jira sometimes returns ISO datetime — strip to date for the math."""
        c = make_connector()
        stub_search(c, [
            alloc_issue(
                start="2026-04-01T09:00:00.000-0400",
                end="2026-04-03T17:00:00.000-0400",
            ),
        ])
        r = c.compute_strategic_allocation(
            "DELIVERY", lookback_days=90, start_date_field=START_DATE_FIELD,
        )
        assert r["strategic_seconds"] == 3 * 86400  # Apr 1, 2, 3 inclusive

    def test_zero_timespent_falls_through_to_date_span(self):
        """timespent=0 isn't a valid weight — should use the next tier."""
        c = make_connector()
        stub_search(c, [
            alloc_issue(timespent=0, start="2026-04-01", end="2026-04-02"),
        ])
        r = c.compute_strategic_allocation(
            "DELIVERY", lookback_days=90, start_date_field=START_DATE_FIELD,
        )
        assert r["weight_sources"]["timespent"] == 0
        assert r["weight_sources"]["date_span"] == 1
        assert r["strategic_seconds"] == 2 * 86400

    def test_mixed_population_partial_time_data(self):
        """Some issues have time data, others don't — time-weighted ratio
        only reflects the issues with weights."""
        c = make_connector()
        stub_search(c, [
            alloc_issue(timespent=8 * 3600),          # strategic, weighted
            alloc_issue("KILO", timespent=2 * 3600),  # non-strategic, weighted
            alloc_issue(),                            # strategic, no data
            alloc_issue("KILO"),                      # non-strategic, no data
        ])
        r = c.compute_strategic_allocation("DELIVERY", lookback_days=90)
        assert r["strategic"] == 2
        assert r["non_strategic"] == 2
        assert r["ratio_by_count"] == 0.5
        assert r["strategic_seconds"] == 8 * 3600
        assert r["non_strategic_seconds"] == 2 * 3600
        assert r["ratio"] == 0.8
        assert r["weight_sources"] == {
            "timespent": 2, "date_span": 0, "no_data": 2,
        }

    def test_jql_includes_time_fields(self):
        c = make_connector()
        captured = stub_search(c, [])
        c.compute_strategic_allocation(
            "DELIVERY", lookback_days=30, start_date_field=START_DATE_FIELD,
        )
        assert "timespent" in captured["fields"]
        assert "customfield_10892" in captured["fields"]
        assert START_DATE_FIELD in captured["fields"]

    def test_start_date_field_omitted_from_query_when_unset(self):
        c = make_connector()
        captured = stub_search(c, [])
        c.compute_strategic_allocation("DELIVERY", lookback_days=30)
        assert START_DATE_FIELD not in captured["fields"]
        # End Date and timespent are always fetched.
        assert "timespent" in captured["fields"]
        assert "customfield_10892" in captured["fields"]


# ── compute_strategic_allocation_by_quarter ────────────────────────────────


class TestStrategicAllocationByQuarter:

    def test_returns_n_quarters_oldest_first(self):
        c = make_connector()
        stub_search(c, [])
        out = c.compute_strategic_allocation_by_quarter(
            "DELIVERY", num_quarters=4, reference=date(2026, 4, 28),
        )
        assert [q["quarter"] for q in out] == [
            "Q3 2025", "Q4 2025", "Q1 2026", "Q2 2026",
        ]

    def test_current_quarter_capped_at_reference(self):
        c = make_connector()
        stub_search(c, [])
        out = c.compute_strategic_allocation_by_quarter(
            "DELIVERY", num_quarters=1, reference=date(2026, 4, 28),
        )
        assert out[0]["window_end"] == "2026-04-28"
        assert out[0]["window_start"] == "2026-04-01"

    def test_jql_uses_resolved_window_per_quarter(self):
        c = make_connector()
        captured = stub_search(c, [])
        c.compute_strategic_allocation_by_quarter(
            "DELIVERY", num_quarters=1, reference=date(2026, 4, 28),
        )
        # Last call's JQL should be the most recent quarter
        assert 'resolved >= "2026-04-01"' in captured["jql"]
        assert 'resolved <= "2026-04-28"' in captured["jql"]

    def test_propagates_start_date_field(self):
        c = make_connector()
        captured = stub_search(c, [])
        c.compute_strategic_allocation_by_quarter(
            "DELIVERY", num_quarters=1, reference=date(2026, 4, 28),
            start_date_field=START_DATE_FIELD,
        )
        assert START_DATE_FIELD in captured["fields"]


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
