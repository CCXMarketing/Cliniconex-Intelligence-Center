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
from datetime import date, datetime, timezone
from typing import Dict, Optional

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

    def _get(self, path: str, params: Optional[Dict] = None, max_retries: int = 3) -> Dict:
        """GET a JIRA endpoint with retry/backoff on 429.

        Raises RuntimeError on auth failures (401/403) so they don't get
        silently swallowed into retries.
        """
        url = f"{self.site_url}{path}"
        attempt = 0
        while attempt <= max_retries:
            try:
                resp = requests.get(
                    url, auth=self.auth, headers=self.headers, params=params, timeout=30
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
        end_date_field = "customfield_10892"
        jql = (
            f'project = "{project_key}" '
            f"AND issuetype != Epic "
            f"AND duedate >= -{lookback_days}d "
            f"AND duedate <= now()"
        )
        issues = self.search(
            jql,
            fields=["duedate", "resolutiondate", "status", end_date_field],
        )

        on_time = resolved_late = overdue_open = 0
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
            elif completion <= due:
                on_time += 1
            else:
                resolved_late += 1

        late = resolved_late + overdue_open
        total = on_time + late
        ratio = (on_time / total) if total else None

        return {
            "ratio": ratio,
            "on_time": on_time,
            "resolved_late": resolved_late,
            "overdue_open": overdue_open,
            "late": late,
            "total": total,
            "period_days": lookback_days,
            "project_key": project_key,
        }

    # ── KPI: strategic allocation ───────────────────────────────────────────

    NON_STRATEGIC_LABELS = frozenset({"KILO", "KTLO"})

    def compute_strategic_allocation(
        self, project_key: str, lookback_days: int = 90
    ) -> Dict:
        """
        Fraction of resolved work that was strategic (by issue count).

        Population: non-Epic issues in `project_key` resolved in the last
        `lookback_days`. An issue counts as non-strategic if it carries
        the `KILO` or `KTLO` label (case-insensitive); everything else
        counts as strategic.

        Until KILO/KTLO start being applied to DELIVERY issues this will
        report 100% strategic by construction.

        Returns:
          {
            "ratio": float | None,
            "strategic": int,
            "non_strategic": int,
            "total": int,
            "period_days": int,
            "project_key": str,
          }
        """
        jql = (
            f'project = "{project_key}" '
            f"AND issuetype != Epic "
            f"AND resolved >= -{lookback_days}d"
        )
        issues = self.search(jql, fields=["labels"])

        non_strategic_upper = {s.upper() for s in self.NON_STRATEGIC_LABELS}
        strategic = non_strategic = 0
        for issue in issues:
            labels = (issue.get("fields") or {}).get("labels") or []
            if any(lbl.upper() in non_strategic_upper for lbl in labels):
                non_strategic += 1
            else:
                strategic += 1

        total = strategic + non_strategic
        ratio = (strategic / total) if total else None

        return {
            "ratio": ratio,
            "strategic": strategic,
            "non_strategic": non_strategic,
            "total": total,
            "period_days": lookback_days,
            "project_key": project_key,
        }

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
