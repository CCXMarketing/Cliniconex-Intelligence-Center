"""
JIRA Cloud API connector.

Mirrors the ActiveCampaignConnector pattern: basic auth, retry/backoff,
structured connection test. Targets JIRA Cloud (not Server/Data Center).

The Product tab's `say_do_ratio` KPI is the first live KPI served from
JIRA. Definition: of issues resolved in the lookback window that had a
Due Date set, what fraction were resolved on or before the Due Date.

Other Product KPIs (strategic_allocation, bug_reduction, ai_products_launched,
ai_skills_pilots) are blocked on JIRA-side tagging — see
`describe_tagging_requirements`.
"""

import logging
import time
from datetime import date, datetime, timedelta, timezone
from typing import Dict, List, Optional

import requests
from requests.auth import HTTPBasicAuth

logger = logging.getLogger(__name__)


class ConnectionResult(dict):
    """Dict subclass that is truthy when connected."""

    def __bool__(self):
        return bool(self.get("connected", False))


class JiraConnector:
    """Connector for JIRA Cloud REST API."""

    def __init__(self, site_url: str, email: str, api_token: str):
        """
        Args:
            site_url: JIRA site URL (e.g. https://cliniconex.atlassian.net)
            email: Atlassian account email
            api_token: API token from id.atlassian.com/manage-profile/security/api-tokens
        """
        self.site_url = site_url.rstrip("/")
        self.auth = HTTPBasicAuth(email, api_token)
        self.headers = {"Accept": "application/json"}

    # ── Low-level request helper ────────────────────────────────────────────

    # (connect, read) — connect kept short so the cold-start TLS/DNS
    # hang fails fast and the retry hits the warm connection. With
    # max_retries=1 the worst-case budget is ~31s (15+1+15), comfortably
    # under gunicorn's 45s worker timeout so the route's exception
    # handler always runs (Phase 3 fallback to the snapshot).
    _REQUEST_TIMEOUT = (5, 15)

    def _get(self, path: str, params: Optional[Dict] = None, max_retries: int = 1) -> Dict:
        """GET a JIRA endpoint with retry/backoff on 429.

        Raises RuntimeError on auth failures (401/403) so they don't get
        silently swallowed into retries.
        """
        url = f"{self.site_url}{path}"
        attempt = 0
        while attempt <= max_retries:
            try:
                resp = requests.get(
                    url, auth=self.auth, headers=self.headers,
                    params=params, timeout=self._REQUEST_TIMEOUT,
                )

                if resp.status_code in (401, 403):
                    raise RuntimeError(
                        f"[JIRA] Auth failed ({resp.status_code}) on {path}. "
                        f"Check email + API token, and that this account has "
                        f"access to the requested project."
                    )

                if resp.status_code == 429:
                    retry_after = int(resp.headers.get("Retry-After", 2))
                    logger.warning(
                        "[JIRA] Rate limited on %s. Waiting %ds (attempt %d/%d).",
                        path, retry_after, attempt + 1, max_retries,
                    )
                    time.sleep(retry_after)
                    attempt += 1
                    continue

                resp.raise_for_status()
                return resp.json()

            except RuntimeError:
                raise
            except requests.exceptions.RequestException as e:
                if attempt < max_retries:
                    delay = 2 ** attempt
                    logger.warning("[JIRA] %s failed: %s — retrying in %ds.", path, e, delay)
                    time.sleep(delay)
                    attempt += 1
                else:
                    raise

        raise Exception(f"[JIRA] {path} failed after {max_retries} retries.")

    # ── Introspection ───────────────────────────────────────────────────────

    def test_connection(self) -> ConnectionResult:
        """Verify credentials work and we can reach the instance."""
        try:
            me = self._get("/rest/api/3/myself")
            return ConnectionResult(
                connected=True,
                account_id=me.get("accountId"),
                display_name=me.get("displayName"),
                email=me.get("emailAddress"),
            )
        except Exception as e:
            return ConnectionResult(connected=False, error=str(e))

    # ── Search helper ───────────────────────────────────────────────────────

    def search(self, jql: str, fields: list[str], page_size: int = 100) -> list[Dict]:
        """Run a JQL search and return all matching issues.

        Uses /rest/api/3/search/jql (the replacement for the deprecated
        /search endpoint, which returns 410 Gone as of 2025). Pagination
        uses nextPageToken rather than startAt/maxResults.
        """
        issues: list[Dict] = []
        next_token: Optional[str] = None
        while True:
            params: Dict = {
                "jql": jql,
                "fields": ",".join(fields),
                "maxResults": page_size,
            }
            if next_token:
                params["nextPageToken"] = next_token
            page = self._get("/rest/api/3/search/jql", params=params)
            issues.extend(page.get("issues", []))
            next_token = page.get("nextPageToken")
            if not next_token:
                break
        return issues

    # ── KPI: say/do ratio (on-time delivery) ────────────────────────────────

    def compute_say_do_ratio(
        self, project_key: str, lookback_days: int = 90
    ) -> Dict:
        """
        On-time delivery ratio, including currently-overdue-and-open as late.

        Population: non-Epic issues in `project_key` with a Due Date in
        the last `lookback_days` up to and including today. Epics are
        excluded because their Due Date is typically an aspirational
        target rather than a delivery commitment.

        Completion signal, in order of precedence (a Done-category
        status is required either way):
          1. End Date custom field (customfield_10892) — the source of
             truth the team maintains. Some DELIVERY workflows close
             issues without setting resolutiondate, so this field is
             more reliable.
          2. resolutiondate — fallback for issues closed via workflows
             that do set it.

          on_time        = Done, completion date <= duedate
          resolved_late  = Done, completion date > duedate
          overdue_open   = not Done (or Done with no completion date)
          ratio          = on_time / (on_time + resolved_late + overdue_open)

        Returns:
          {
            "ratio": float | None,
            "on_time": int,
            "resolved_late": int,
            "overdue_open": int,
            "late": int,
            "total": int,
            "period_days": int,
            "project_key": str,
          }
        """
        today = date.today()
        start = today - timedelta(days=lookback_days)
        result = self._compute_say_do_window(project_key, start, today)
        result["period_days"] = lookback_days
        return result

    def _compute_say_do_window(
        self, project_key: str, start: date, end: date
    ) -> Dict:
        """Run the say/do logic over an absolute duedate window [start, end].

        Computes the strict ratio (completion <= duedate) and a 1-day grace
        ratio (completion <= duedate + 1 day) in a single pass. Issues that
        are still open never count as on-time at any grace level.
        """
        end_date_field = "customfield_10892"
        jql = (
            f'project = "{project_key}" '
            f"AND issuetype != Epic "
            f'AND duedate >= "{start.isoformat()}" '
            f'AND duedate <= "{end.isoformat()}"'
        )
        issues = self.search(
            jql,
            fields=["duedate", "resolutiondate", "status", end_date_field],
        )

        on_time = resolved_late = overdue_open = 0
        on_time_grace_1d = resolved_late_grace_1d = 0
        for issue in issues:
            f = issue.get("fields", {})
            due_raw = f.get("duedate")
            if not due_raw:
                continue
            try:
                due = date.fromisoformat(due_raw)
            except ValueError:
                continue

            is_done = (
                (f.get("status") or {}).get("statusCategory", {}).get("key")
                == "done"
            )
            completion: Optional[date] = None
            if is_done:
                end_raw = f.get(end_date_field)
                if end_raw:
                    try:
                        completion = date.fromisoformat(end_raw)
                    except ValueError:
                        pass
                if completion is None:
                    resolved_raw = f.get("resolutiondate")
                    if resolved_raw:
                        try:
                            completion = (
                                datetime.fromisoformat(
                                    resolved_raw.replace("Z", "+00:00")
                                )
                                .astimezone(timezone.utc)
                                .date()
                            )
                        except ValueError:
                            pass

            if completion is None:
                overdue_open += 1
                continue

            if completion <= due:
                on_time += 1
                on_time_grace_1d += 1
            else:
                resolved_late += 1
                if completion <= due + timedelta(days=1):
                    on_time_grace_1d += 1
                else:
                    resolved_late_grace_1d += 1

        late = resolved_late + overdue_open
        total = on_time + late
        ratio = (on_time / total) if total else None

        late_grace_1d = resolved_late_grace_1d + overdue_open
        ratio_grace_1d = (on_time_grace_1d / total) if total else None

        return {
            "ratio": ratio,
            "on_time": on_time,
            "resolved_late": resolved_late,
            "overdue_open": overdue_open,
            "late": late,
            "total": total,
            "ratio_grace_1d": ratio_grace_1d,
            "on_time_grace_1d": on_time_grace_1d,
            "resolved_late_grace_1d": resolved_late_grace_1d,
            "late_grace_1d": late_grace_1d,
            "project_key": project_key,
            "window_start": start.isoformat(),
            "window_end": end.isoformat(),
        }

    def compute_say_do_ratio_by_quarter(
        self, project_key: str, num_quarters: int = 4,
        reference: Optional[date] = None,
    ) -> List[Dict]:
        """Say/do ratio per calendar quarter, most recent last.

        The current quarter's window ends at `reference` (defaults to
        today) — future-dated issues aren't included because we can't
        yet say if they'll ship on time.
        """
        today = reference or date.today()
        cur_q = (today.month - 1) // 3 + 1
        cur_y = today.year

        quarters: List[Dict] = []
        for i in range(num_quarters):
            qi, yi = cur_q - i, cur_y
            while qi < 1:
                qi += 4
                yi -= 1
            start_month = (qi - 1) * 3 + 1
            q_start = date(yi, start_month, 1)
            q_end = (
                date(yi + 1, 1, 1) if qi == 4
                else date(yi, start_month + 3, 1)
            ) - timedelta(days=1)
            win_end = min(q_end, today)

            result = self._compute_say_do_window(project_key, q_start, win_end)
            result["quarter"] = f"Q{qi} {yi}"
            quarters.append(result)

        quarters.reverse()
        return quarters

    # ── KPI: strategic allocation ───────────────────────────────────────────

    NON_STRATEGIC_LABELS = frozenset({"KILO", "KTLO"})
    END_DATE_FIELD = "customfield_10892"

    @staticmethod
    def _issue_weight_seconds(
        fields: Dict,
        end_date_field: str,
        start_date_field: Optional[str],
    ):
        """Time spent on an issue, in seconds, with provenance tag.

        Tier 1: Jira's `timespent` (logged work) when > 0.
        Tier 2: (End Date - Start Date), inclusive, when both fields are
                set. Calendar duration — overestimates active work
                relative to logged time, but consistently within tier 2.
        Tier 3: None — issue is dropped from the time-weighted total.

        Returns (seconds: int|None, source: str). Source is one of
        "timespent", "date_span", "no_data".
        """
        timespent = fields.get("timespent")
        if isinstance(timespent, (int, float)) and timespent > 0:
            return int(timespent), "timespent"

        if start_date_field:
            start_raw = fields.get(start_date_field)
            end_raw = fields.get(end_date_field)
            if start_raw and end_raw:
                try:
                    start = date.fromisoformat(start_raw[:10])
                    end = date.fromisoformat(end_raw[:10])
                except ValueError:
                    return None, "no_data"
                if end >= start:
                    days = (end - start).days + 1
                    return days * 86400, "date_span"

        return None, "no_data"

    def compute_strategic_allocation(
        self,
        project_key: str,
        lookback_days: int = 90,
        start_date_field: Optional[str] = None,
    ) -> Dict:
        """
        Fraction of resolved work that was strategic, weighted by time spent.

        Population: non-Epic issues in `project_key` resolved in the last
        `lookback_days`. An issue counts as non-strategic if it carries
        the `KILO` or `KTLO` label (case-insensitive); everything else
        counts as strategic.

        Each issue's contribution is weighted by `_issue_weight_seconds`:
        Jira `timespent` if logged, else (End Date - Start Date) when
        `start_date_field` is provided and both dates are set, else
        dropped. The count-weighted ratio is also returned for fallback
        and diagnostic purposes.

        Until KILO/KTLO start being applied to DELIVERY issues this will
        report 100% strategic by construction.

        Returns:
          {
            "ratio": float | None,           # time-weighted (primary)
            "ratio_by_count": float | None,  # legacy / fallback
            "strategic_seconds": int,
            "non_strategic_seconds": int,
            "total_seconds": int,
            "strategic": int,                # issue counts
            "non_strategic": int,
            "total": int,
            "weight_sources": {"timespent": int, "date_span": int, "no_data": int},
            "period_days": int,
            "project_key": str,
            "start_date_field": str | None,
          }
        """
        today = date.today()
        start = today - timedelta(days=lookback_days)
        result = self._compute_allocation_window(
            project_key, start, today, start_date_field=start_date_field,
        )
        result["period_days"] = lookback_days
        return result

    def _compute_allocation_window(
        self,
        project_key: str,
        start: date,
        end: date,
        start_date_field: Optional[str] = None,
    ) -> Dict:
        """Run the strategic-allocation logic over a resolved-date window."""
        jql = (
            f'project = "{project_key}" '
            f"AND issuetype != Epic "
            f'AND resolved >= "{start.isoformat()}" '
            f'AND resolved <= "{end.isoformat()}"'
        )
        fields_to_fetch = ["labels", "timespent", self.END_DATE_FIELD]
        if start_date_field:
            fields_to_fetch.append(start_date_field)
        issues = self.search(jql, fields=fields_to_fetch)

        non_strategic_upper = {s.upper() for s in self.NON_STRATEGIC_LABELS}
        strategic = non_strategic = 0
        strategic_seconds = non_strategic_seconds = 0
        weight_sources = {"timespent": 0, "date_span": 0, "no_data": 0}

        for issue in issues:
            f = issue.get("fields") or {}
            labels = f.get("labels") or []
            is_non_strategic = any(
                lbl.upper() in non_strategic_upper for lbl in labels
            )

            seconds, source = self._issue_weight_seconds(
                f, self.END_DATE_FIELD, start_date_field,
            )
            weight_sources[source] += 1

            if is_non_strategic:
                non_strategic += 1
                if seconds is not None:
                    non_strategic_seconds += seconds
            else:
                strategic += 1
                if seconds is not None:
                    strategic_seconds += seconds

        total = strategic + non_strategic
        ratio_by_count = (strategic / total) if total else None

        total_seconds = strategic_seconds + non_strategic_seconds
        ratio = (
            (strategic_seconds / total_seconds) if total_seconds else None
        )

        return {
            "ratio": ratio,
            "ratio_by_count": ratio_by_count,
            "strategic_seconds": strategic_seconds,
            "non_strategic_seconds": non_strategic_seconds,
            "total_seconds": total_seconds,
            "strategic": strategic,
            "non_strategic": non_strategic,
            "total": total,
            "weight_sources": weight_sources,
            "project_key": project_key,
            "start_date_field": start_date_field,
            "window_start": start.isoformat(),
            "window_end": end.isoformat(),
        }

    def compute_strategic_allocation_by_quarter(
        self,
        project_key: str,
        num_quarters: int = 4,
        start_date_field: Optional[str] = None,
        reference: Optional[date] = None,
    ) -> List[Dict]:
        """Time-weighted strategic allocation per calendar quarter, oldest first.

        Bucketed by resolution date — issues that span multiple quarters
        attribute all of their time to the quarter they resolved in. The
        current quarter's window ends at `reference` (defaults to today).
        """
        today = reference or date.today()
        cur_q = (today.month - 1) // 3 + 1
        cur_y = today.year

        quarters: List[Dict] = []
        for i in range(num_quarters):
            qi, yi = cur_q - i, cur_y
            while qi < 1:
                qi += 4
                yi -= 1
            start_month = (qi - 1) * 3 + 1
            q_start = date(yi, start_month, 1)
            q_end = (
                date(yi + 1, 1, 1) if qi == 4
                else date(yi, start_month + 3, 1)
            ) - timedelta(days=1)
            win_end = min(q_end, today)

            result = self._compute_allocation_window(
                project_key, q_start, win_end,
                start_date_field=start_date_field,
            )
            result["quarter"] = f"Q{qi} {yi}"
            quarters.append(result)

        quarters.reverse()
        return quarters

    def list_custom_fields(self, contains: Optional[str] = None) -> List[Dict]:
        """List custom fields on this Jira site, optionally filtered by name.

        Helper for finding the right `customfield_XXXXX` ID for fields
        like Start Date. Returns [{id, name, schema_type}] sorted by id.
        """
        all_fields = self._get("/rest/api/3/field")
        custom = [
            {
                "id": fld.get("id", ""),
                "name": fld.get("name", ""),
                "schema_type": (fld.get("schema") or {}).get("type"),
            }
            for fld in all_fields
            if isinstance(fld, dict) and fld.get("custom") is True
        ]
        if contains:
            needle = contains.lower()
            custom = [c for c in custom if needle in c["name"].lower()]
        custom.sort(key=lambda c: c["id"])
        return custom

    # ── Documentation ───────────────────────────────────────────────────────

    @staticmethod
    def describe_tagging_requirements() -> Dict[str, str]:
        """Labels/fields JIRA needs before additional KPIs can be computed.

        Hand this to whoever owns the DELIVERY project's issue schema.
        The connector will populate these KPIs automatically once the
        tagging is in place.
        """
        return {
            "strategic_allocation": (
                "Apply labels 'KILO' or 'KTLO' to non-strategic work "
                "(keep-the-lights-on, maintenance). Everything without "
                "those labels counts as strategic. KPI = strategic issues "
                "/ total resolved issues (by count)."
            ),
            "bug_reduction": (
                "Add a 'customer-facing' label to bug-type issues reported by "
                "or visible to customers. KPI = count of customer-facing bugs "
                "resolved in period vs prior period."
            ),
            "ai_products_launched": (
                "Tag release epics with label 'ai-product' and mark an epic as "
                "'launched' via a specific status (e.g. Released). KPI = count "
                "of ai-product epics transitioned to launched in period."
            ),
            "ai_skills_pilots": (
                "Tag pilot epics with label 'ai-skill-pilot'. KPI = count of "
                "such epics reaching a Completed/Validated state in period."
            ),
        }
