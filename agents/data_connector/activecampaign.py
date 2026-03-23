"""
ActiveCampaign API Connector Agent
Handles authentication, data fetching, and caching for ActiveCampaign
"""

import requests
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import json


class ConnectionResult(dict):
    """Dict subclass that is truthy when connected, falsy when not.

    Allows ``if ac.test_connection():`` to keep working while also
    providing structured diagnostic data via dict access.
    """

    def __bool__(self):
        return bool(self.get("connected", False))


class ActiveCampaignConnector:
    """Connector for ActiveCampaign API"""

    def __init__(self, api_url: str, api_key: str):
        """
        Initialize ActiveCampaign connector

        Args:
            api_url: Base API URL (e.g., https://yourcompany.api-us1.com)
            api_key: API key for authentication
        """
        self.api_url = api_url.rstrip('/')
        self.api_key = api_key
        self.headers = {
            'Api-Token': self.api_key,
            'Content-Type': 'application/json'
        }

    def _make_request(
        self,
        endpoint: str,
        params: Optional[Dict] = None,
        max_retries: int = 4,
    ) -> Dict:
        """
        Make authenticated request to ActiveCampaign API v3.

        Handles AC-specific error codes with differentiated responses:
          402 — Payment issue: halt immediately, do not retry
          403 — Auth failure or no Deals permission: halt, do not retry
          422 — Bad param or race condition: log + retry once after 1s
          429 — Rate limited: respect Retry-After header, then retry
          503 — AC sometimes returns this instead of 429: treat as 429

        Args:
            endpoint: API endpoint path (e.g. '/api/3/contacts')
            params: Optional query parameters dict
            max_retries: Maximum retry attempts for retryable errors

        Returns:
            Parsed JSON response dict

        Raises:
            RuntimeError: For non-retryable errors (402, 403)
            Exception: For exhausted retries
        """
        url = f"{self.api_url}{endpoint}"
        attempt = 0

        while attempt <= max_retries:
            try:
                response = requests.get(
                    url,
                    headers=self.headers,
                    params=params,
                    timeout=30,
                )

                # Non-retryable: halt immediately
                if response.status_code == 402:
                    raise RuntimeError(
                        f"[ActiveCampaign] Account payment issue (402). "
                        f"Endpoint: {endpoint}. Check your AC subscription."
                    )

                if response.status_code == 403:
                    raise RuntimeError(
                        f"[ActiveCampaign] Authentication failed or insufficient "
                        f"permissions (403). Endpoint: {endpoint}. "
                        f"Verify Api-Token header and that your API user has "
                        f"Deals permission enabled in their user group."
                    )

                # Rate limited: respect Retry-After header
                if response.status_code in (429, 503):
                    retry_after = int(response.headers.get('Retry-After', 2))
                    print(
                        f"[ActiveCampaign] Rate limited ({response.status_code}) "
                        f"on {endpoint}. Waiting {retry_after}s before retry "
                        f"(attempt {attempt + 1}/{max_retries})."
                    )
                    time.sleep(retry_after)
                    attempt += 1
                    continue

                # Unprocessable: log full request, retry once (AC race condition)
                if response.status_code == 422:
                    print(
                        f"[ActiveCampaign] 422 Unprocessable on {endpoint}. "
                        f"Params: {params}. Response: {response.text[:500]}. "
                        f"Retrying once after 1s (AC race condition possible)."
                    )
                    if attempt < 1:
                        time.sleep(1)
                        attempt += 1
                        continue
                    else:
                        response.raise_for_status()

                # All other errors
                response.raise_for_status()
                return response.json()

            except RuntimeError:
                raise  # Never swallow 402/403
            except requests.exceptions.Timeout:
                print(f"[ActiveCampaign] Timeout on {endpoint} (attempt {attempt + 1})")
                attempt += 1
                time.sleep(2 ** attempt)
            except requests.exceptions.RequestException as e:
                if attempt < max_retries:
                    delay = 2 ** attempt
                    print(
                        f"[ActiveCampaign] Request error on {endpoint}: {e}. "
                        f"Retrying in {delay}s (attempt {attempt + 1}/{max_retries})."
                    )
                    time.sleep(delay)
                    attempt += 1
                else:
                    print(f"[ActiveCampaign] All retries exhausted for {endpoint}: {e}")
                    raise

        raise Exception(
            f"[ActiveCampaign] {endpoint} failed after {max_retries} retries."
        )

    @staticmethod
    def _normalize_deal(deal: Dict) -> Dict:
        """Normalize an AC deal — convert value from cents to dollars, ensure currency.

        ActiveCampaign stores deal values in **cents** (integer).
        A $1,200 deal is stored as ``120000``.
        """
        raw_value = int(float(deal.get("value", 0)))
        deal["value_cents"] = raw_value
        deal["value"] = raw_value / 100  # cents → dollars
        deal["currency"] = deal.get("currency", "usd").lower()
        deal["ac_url"] = f"https://cliniconexmarketing.activehosted.com/deals/{deal['id']}"
        return deal

    def _validate_pipeline_filter(
        self,
        deals: List[Dict],
        pipeline_id: int,
        method_name: str,
    ) -> List[Dict]:
        """
        Validate that pipeline filtering actually worked.

        AC silently ignores invalid filter keys and returns unfiltered
        results. This detects that by confirming all returned deals
        belong to the expected pipeline. Applies client-side filter
        as a safety net and logs a warning if the API filter failed.

        Args:
            deals: The list of deals returned from AC API
            pipeline_id: The pipeline ID that was requested
            method_name: Caller name for logging

        Returns:
            Filtered list of deals confirmed to be in pipeline_id.
        """
        if not deals:
            return deals

        confirmed = [
            d for d in deals
            if str(d.get("group", "")) == str(pipeline_id)
        ]

        if len(confirmed) < len(deals):
            discarded = len(deals) - len(confirmed)
            print(
                f"[ActiveCampaign] WARNING in {method_name}: "
                f"filters[group]={pipeline_id} may have partially failed. "
                f"Got {len(deals)} deals, {discarded} were from other pipelines. "
                f"Client-side filter applied."
            )

        return confirmed

    def fetch_contacts(self, limit: int = 1000, offset: int = 0) -> List[Dict]:
        """
        Fetch contacts from ActiveCampaign using cursor-based pagination.

        Uses id_greater for reliable pagination (AC-recommended for contacts).

        Args:
            limit: Number of contacts to fetch
            offset: Ignored (kept for backward compatibility)

        Returns:
            List of contact dictionaries
        """
        endpoint = '/api/3/contacts'
        all_contacts: List[Dict] = []
        last_seen_id = 0
        batch_size = min(limit, 100)

        while len(all_contacts) < limit:
            params = {
                'limit': batch_size,
                'orders[id]': 'ASC',
                'id_greater': last_seen_id,
            }

            response = self._make_request(endpoint, params)
            batch = response.get('contacts', [])

            if not batch:
                break

            all_contacts.extend(batch)
            last_seen_id = batch[-1].get('id', last_seen_id)

            if len(batch) < batch_size:
                break

        return all_contacts[:limit]

    def fetch_deals(self, limit: int = 1000, offset: int = 0) -> List[Dict]:
        """
        Fetch deals from ActiveCampaign.

        Values are converted from cents to dollars automatically.
        Note: Deals endpoint uses offset pagination with orders[id]=ASC
        for stability (id_greater not supported on /api/3/deals).

        Args:
            limit: Number of deals to fetch
            offset: Pagination offset

        Returns:
            List of deal dictionaries (value in dollars)
        """
        endpoint = '/api/3/deals'
        # Deals endpoint: offset pagination with stable ordering
        params = {'limit': limit, 'offset': offset, 'orders[id]': 'ASC'}

        response = self._make_request(endpoint, params)
        return [self._normalize_deal(d) for d in response.get('deals', [])]

    def fetch_deals_by_pipeline(
        self, pipeline_id: int, limit: int = 1000, offset: int = 0
    ) -> List[Dict]:
        """
        Fetch deals filtered to a specific pipeline.

        Values are converted from cents to dollars automatically.

        Args:
            pipeline_id: ActiveCampaign pipeline (dealGroup) ID
            limit: Number of deals to fetch
            offset: Pagination offset

        Returns:
            List of deal dictionaries belonging to that pipeline (value in dollars)
        """
        endpoint = '/api/3/deals'
        # Deals endpoint: offset pagination with stable ordering
        params = {
            'limit': limit,
            'offset': offset,
            'orders[id]': 'ASC',
            'filters[group]': pipeline_id,
        }

        response = self._make_request(endpoint, params)
        deals = [self._normalize_deal(d) for d in response.get('deals', [])]
        return self._validate_pipeline_filter(deals, pipeline_id, 'fetch_deals_by_pipeline')

    def get_pipeline_stages(self, pipeline_id: Optional[int] = None) -> List[Dict]:
        """
        Get pipeline stages, optionally filtered to a single pipeline.

        Args:
            pipeline_id: If provided, only return stages for this pipeline.

        Returns:
            List of pipeline stage dictionaries
        """
        endpoint = '/api/3/dealStages'
        params = {}
        if pipeline_id is not None:
            params['filters[d_groupid]'] = pipeline_id

        response = self._make_request(endpoint, params)
        stages = response.get('dealStages', [])

        if pipeline_id is not None and stages:
            filtered = [s for s in stages if str(s.get("group")) == str(pipeline_id)]
            if len(filtered) < len(stages):
                print(
                    f"[ActiveCampaign] NOTE: get_pipeline_stages API filter returned "
                    f"{len(stages)} stages total, client filter kept {len(filtered)} "
                    f"for pipeline {pipeline_id}. API filter silently ignored."
                )
            return filtered

        return stages

    def get_pipelines(self) -> List[Dict]:
        """
        Get all pipelines

        Returns:
            List of pipeline dictionaries
        """
        endpoint = '/api/3/dealGroups'
        response = self._make_request(endpoint)
        return response.get('dealGroups', [])

    def fetch_all_pipelines(self) -> List[Dict]:
        """
        Fetch all deal pipelines with basic metadata.

        Returns:
            List of dicts: {id, title, deal_count}
        """
        endpoint = '/api/3/dealGroups'
        response = self._make_request(endpoint)
        pipelines = response.get('dealGroups', [])
        return [
            {
                "id": int(p.get("id", 0)),
                "title": p.get("title", "Unknown Pipeline"),
                "deal_count": int(p.get("dcount", p.get("dealCount", 0))),
            }
            for p in pipelines
        ]

    def fetch_contacts_with_deals(
        self, pipeline_id: Optional[int] = None, limit: int = 5000
    ) -> List[Dict]:
        """
        Fetch contacts that have at least one associated deal.

        If pipeline_id is provided, only contacts with deals in that
        pipeline are returned.  This replaces fetch_contacts_by_date()
        for funnel analysis — we want contacts active in the pipeline,
        NOT contacts created in a date range.

        Returns:
            List of minimal contact dicts: {id}
        """
        contact_ids: set = set()
        offset = 0
        batch_size = 100  # AC API max per page

        while len(contact_ids) < limit:
            # Deals endpoint: offset pagination with stable ordering
            params: Dict = {
                "limit": batch_size,
                "offset": offset,
                "orders[id]": "ASC",
            }
            if pipeline_id is not None:
                params["filters[group]"] = pipeline_id

            response = self._make_request("/api/3/deals", params)
            deals = response.get("deals", [])

            if not deals:
                break

            for deal in deals:
                cid = deal.get("contact")
                if cid:
                    contact_ids.add(str(cid))

            if len(deals) < batch_size:
                break
            offset += batch_size

        return [{"id": cid} for cid in list(contact_ids)[:limit]]

    def fetch_contacts_by_date(
        self,
        start_date: str,
        end_date: str,
        limit: int = 1000,
        offset: int = 0,
    ) -> List[Dict]:
        """
        Fetch contacts created within a date range.

        Uses id_greater cursor pagination for reliable results.

        Args:
            start_date: ISO date string (e.g. '2026-01-01')
            end_date: ISO date string (e.g. '2026-03-31')
            limit: Number of contacts to fetch
            offset: Ignored (kept for backward compatibility)

        Returns:
            List of contact dictionaries created in the range
        """
        endpoint = '/api/3/contacts'
        all_contacts: List[Dict] = []
        last_seen_id = 0
        batch_size = min(limit, 100)

        while len(all_contacts) < limit:
            params = {
                'limit': batch_size,
                'orders[id]': 'ASC',
                'id_greater': last_seen_id,
                'filters[created_after]': start_date,
                'filters[created_before]': end_date,
            }

            response = self._make_request(endpoint, params)
            batch = response.get('contacts', [])

            if not batch:
                break

            all_contacts.extend(batch)
            last_seen_id = batch[-1].get('id', last_seen_id)

            if len(batch) < batch_size:
                break

        return all_contacts[:limit]

    def fetch_contact_by_email(self, email: str) -> Optional[Dict]:
        """
        Fetch a specific contact by email

        Args:
            email: Contact email address

        Returns:
            Contact dictionary or None if not found
        """
        endpoint = '/api/3/contacts'
        params = {'email': email}

        response = self._make_request(endpoint, params)
        contacts = response.get('contacts', [])

        return contacts[0] if contacts else None

    def get_deal_custom_fields(self) -> List[Dict]:
        """
        Get all custom deal fields

        Returns:
            List of custom field definitions
        """
        endpoint = '/api/3/dealCustomFieldMeta'
        response = self._make_request(endpoint)
        return response.get('dealCustomFieldMeta', [])

    def fetch_deals_with_stages(
        self, limit: int = 1000, pipeline_id: Optional[int] = None
    ) -> tuple:
        """
        Fetch deals and enrich each with its pipeline stage name/order.

        Args:
            limit: Number of deals to fetch.
            pipeline_id: If provided, only fetch deals from this pipeline.

        Returns:
            (deals, pipeline_stages) — deals have extra keys
            ``_stage_title`` and ``_stage_order``.
        """
        if pipeline_id is not None:
            deals = self.fetch_deals_by_pipeline(pipeline_id, limit=limit)
            stages = self.get_pipeline_stages(pipeline_id)
        else:
            deals = self.fetch_deals(limit=limit)
            stages = self.get_pipeline_stages()

        stage_map = {s["id"]: s for s in stages}

        for deal in deals:
            stage_id = deal.get("stage")
            info = stage_map.get(stage_id, {})
            deal["_stage_title"] = info.get("title", "Unknown")
            deal["_stage_order"] = int(info.get("order", 0))

        return deals, stages

    # ------------------------------------------------------------------
    # Historical / Analytics Methods
    # ------------------------------------------------------------------

    def _get_owner_info(self, owner_id: str) -> Dict:
        """Fetch user info by ID with caching."""
        if not hasattr(self, '_owner_cache'):
            self._owner_cache: Dict[str, Dict] = {}

        if not owner_id or owner_id == "0":
            return {"owner_id": owner_id, "owner_email": "", "owner_name": ""}

        if owner_id in self._owner_cache:
            return self._owner_cache[owner_id]

        try:
            resp = self._make_request(f"/api/3/users/{owner_id}")
            user = resp.get("user", {})
            info = {
                "owner_id": owner_id,
                "owner_email": user.get("email", ""),
                "owner_name": f"{user.get('firstName', '')} {user.get('lastName', '')}".strip(),
            }
        except Exception as e:
            print(f"[ActiveCampaign] _get_owner_info: Could not fetch user {owner_id}: {e}")
            info = {"owner_id": owner_id, "owner_email": "", "owner_name": ""}

        self._owner_cache[owner_id] = info
        return info

    def fetch_deals_for_range(
        self,
        start_date: str,
        end_date: str,
        pipeline_id: Optional[int] = None,
    ) -> List[Dict]:
        """Fetch all deals created or updated within a date range.

        Args:
            start_date: YYYY-MM-DD
            end_date:   YYYY-MM-DD
            pipeline_id: Restrict to this pipeline (optional)

        Returns:
            List of normalized deal dicts.
        """
        try:
            deals: List[Dict] = []
            offset = 0
            batch_size = 100

            while True:
                # Deals endpoint: offset pagination with stable ordering
                params: Dict = {
                    "limit": batch_size,
                    "offset": offset,
                    "orders[id]": "ASC",
                    "filters[created_after]": start_date,
                    "filters[created_before]": end_date,
                }
                if pipeline_id is not None:
                    params["filters[group]"] = pipeline_id

                response = self._make_request("/api/3/deals", params)
                batch = response.get("deals", [])
                if not batch:
                    break

                for deal in batch:
                    normalized = self._normalize_deal(deal)

                    # Validate pipeline filter if applicable
                    if pipeline_id is not None and str(normalized.get("group", "")) != str(pipeline_id):
                        continue

                    owner_id = str(normalized.get("owner", ""))
                    owner_info = self._get_owner_info(owner_id)
                    deals.append({
                        "id": str(normalized.get("id", "")),
                        "title": normalized.get("title", ""),
                        "value": float(normalized.get("value", 0)),
                        "currency": normalized.get("currency", "usd"),
                        "status": int(normalized.get("status", 0)),
                        "stage_id": str(normalized.get("stage", "")),
                        "pipeline_id": str(normalized.get("group", "")),
                        "owner_id": owner_id,
                        "owner_email": owner_info["owner_email"],
                        "owner_name": owner_info["owner_name"],
                        "contact_id": str(normalized.get("contact", "")),
                        "created_date": normalized.get("cdate", ""),
                        "updated_date": normalized.get("mdate", ""),
                        "close_date": normalized.get("nextdate") or None,
                        "ac_url": normalized.get("ac_url", ""),
                    })

                if len(batch) < batch_size:
                    break
                offset += batch_size

            return deals
        except Exception as e:
            print(f"[ActiveCampaign] fetch_deals_for_range: {e}")
            return []

    def fetch_deal_stage_history(self, deal_id: str) -> List[Dict]:
        """Fetch stage-change history for a single deal.

        Tries the dealActivities endpoint first; falls back to computing a
        single-entry history from the deal's current stage.

        Returns:
            List of dicts with stage_id, entered_date, exited_date,
            days_in_stage.
        """
        try:
            # Attempt activity-based history
            response = self._make_request(
                f"/api/3/deals/{deal_id}/dealActivities",
                {"limit": 100},
            )
            activities = response.get("dealActivities", [])

            # Filter to stage-change activities
            stage_changes = [
                a for a in activities
                if a.get("type") == "stage" or "stage" in (a.get("info") or "").lower()
            ]

            if stage_changes:
                history: List[Dict] = []
                stage_changes.sort(key=lambda a: a.get("cdate", ""))
                for i, act in enumerate(stage_changes):
                    entered = act.get("cdate", "")
                    exited = (
                        stage_changes[i + 1].get("cdate", "")
                        if i + 1 < len(stage_changes)
                        else None
                    )
                    days = 0
                    if entered:
                        entered_dt = datetime.fromisoformat(entered.replace("Z", "+00:00"))
                        if exited:
                            exited_dt = datetime.fromisoformat(exited.replace("Z", "+00:00"))
                        else:
                            exited_dt = datetime.now(entered_dt.tzinfo) if entered_dt.tzinfo else datetime.now()
                        days = max(0, (exited_dt - entered_dt).days)

                    history.append({
                        "deal_id": str(deal_id),
                        "stage_id": str(act.get("stageid", act.get("stage_id", ""))),
                        "entered_date": entered,
                        "exited_date": exited,
                        "days_in_stage": days,
                    })
                return history
        except Exception as e:
            print(f"[ActiveCampaign] fetch_deal_stage_history: activities fetch failed for deal {deal_id}: {e}")
            pass  # fall through to fallback

        # Fallback: use current deal data
        try:
            response = self._make_request(f"/api/3/deals/{deal_id}")
            deal = response.get("deal", {})
            updated = deal.get("mdate", "")
            days = 0
            if updated:
                try:
                    updated_dt = datetime.fromisoformat(updated.replace("Z", "+00:00"))
                    now = datetime.now(updated_dt.tzinfo) if updated_dt.tzinfo else datetime.now()
                    days = max(0, (now - updated_dt).days)
                except ValueError:
                    pass

            return [{
                "deal_id": str(deal_id),
                "stage_id": str(deal.get("stage", "")),
                "entered_date": updated,
                "exited_date": None,
                "days_in_stage": days,
            }]
        except Exception as e:
            print(f"[ActiveCampaign] fetch_deal_stage_history: fallback failed for deal {deal_id}: {e}")
            return []

    def fetch_contacts_with_utm(
        self,
        pipeline_id: Optional[int] = None,
        limit: int = 5000,
    ) -> List[Dict]:
        """Fetch contacts with UTM data using bulk field value lookup.

        Instead of fetching field values per contact (N+1 queries), this:
        1. Discovers UTM field IDs once (1 call)
        2. Bulk-fetches all values per UTM field (max 5 paginated calls)
        3. Optionally filters to pipeline contacts

        Returns:
            List of contact dicts with utm_source … utm_content fields.
        """
        try:
            # Step 1: Discover UTM custom field IDs (cached on instance)
            if not hasattr(self, '_utm_field_cache'):
                self._utm_field_cache: Dict[str, str] = {}
                fields_offset = 0
                while True:
                    resp = self._make_request(
                        "/api/3/fields",
                        {"limit": 100, "offset": fields_offset},
                    )
                    fields = resp.get("fields", [])
                    if not fields:
                        break
                    for f in fields:
                        title_lower = (f.get("title") or "").lower()
                        if "utm" in title_lower:
                            for key in ("utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"):
                                if key.replace("_", "") in title_lower.replace("_", "").replace(" ", ""):
                                    self._utm_field_cache[str(f["id"])] = key
                                    break
                            else:
                                self._utm_field_cache[str(f["id"])] = title_lower.replace(" ", "_")
                    if len(fields) < 100:
                        break
                    fields_offset += 100

            if not self._utm_field_cache:
                return []

            # Step 2: If pipeline_id given, get contact IDs from deals
            pipeline_contact_ids: Optional[set] = None
            if pipeline_id is not None:
                pipeline_contact_ids = set()
                deal_offset = 0
                while True:
                    # Deals endpoint: offset pagination with stable ordering
                    resp = self._make_request("/api/3/deals", {
                        "limit": 100,
                        "offset": deal_offset,
                        "orders[id]": "ASC",
                        "filters[group]": pipeline_id,
                    })
                    deals = resp.get("deals", [])
                    if not deals:
                        break
                    for d in deals:
                        cid = d.get("contact")
                        if cid:
                            pipeline_contact_ids.add(str(cid))
                    if len(deals) < 100:
                        break
                    deal_offset += 100

            # Step 3: Bulk fetch field values per UTM field
            contact_utm_map: Dict[str, Dict[str, Optional[str]]] = {}

            for field_id, utm_key in self._utm_field_cache.items():
                # fieldValues endpoint: offset pagination with stable ordering
                offset = 0
                while True:
                    resp = self._make_request("/api/3/fieldValues", {
                        "filters[field]": field_id,
                        "limit": 100,
                        "offset": offset,
                        "orders[id]": "ASC",
                    })
                    values = resp.get("fieldValues", [])
                    if not values:
                        break
                    for fv in values:
                        contact_id = str(fv.get("contact", ""))
                        val = fv.get("value", "")
                        if val and contact_id:
                            # Skip if filtering by pipeline and contact not in it
                            if pipeline_contact_ids is not None and contact_id not in pipeline_contact_ids:
                                continue
                            if contact_id not in contact_utm_map:
                                contact_utm_map[contact_id] = {}
                            contact_utm_map[contact_id][utm_key] = val
                    if len(values) < 100:
                        break
                    offset += 100

            # Step 4: Build result — only contacts with at least one UTM value
            results: List[Dict] = []
            for contact_id, utm_data in contact_utm_map.items():
                results.append({
                    "id": contact_id,
                    "email": "",
                    "utm_source": utm_data.get("utm_source"),
                    "utm_medium": utm_data.get("utm_medium"),
                    "utm_campaign": utm_data.get("utm_campaign"),
                    "utm_term": utm_data.get("utm_term"),
                    "utm_content": utm_data.get("utm_content"),
                    "created_date": None,
                    "pipeline_id": str(pipeline_id) if pipeline_id else "",
                })

            return results[:limit]
        except Exception as e:
            print(f"[ActiveCampaign] fetch_contacts_with_utm: {e}")
            return []

    def fetch_deals_by_owner(
        self,
        pipeline_id: Optional[int] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
    ) -> List[Dict]:
        """Fetch deals grouped by owner for rep performance analysis.

        Returns:
            List of per-owner summary dicts.
        """
        try:
            # Gather deals
            if start_date and end_date:
                deals = self.fetch_deals_for_range(start_date, end_date, pipeline_id)
            elif pipeline_id is not None:
                raw = self.fetch_deals_by_pipeline(pipeline_id, limit=1000)
                deals = []
                for d in raw:
                    deals.append({
                        "id": str(d.get("id", "")),
                        "title": d.get("title", ""),
                        "value": float(d.get("value", 0)),
                        "currency": d.get("currency", "usd"),
                        "status": int(d.get("status", 0)),
                        "stage_id": str(d.get("stage", "")),
                        "pipeline_id": str(d.get("group", "")),
                        "owner_id": str(d.get("owner", "")),
                        "owner_email": (d.get("owner_info") or {}).get("email", ""),
                        "contact_id": str(d.get("contact", "")),
                        "created_date": d.get("cdate", ""),
                        "updated_date": d.get("mdate", ""),
                        "close_date": d.get("nextdate") or None,
                        "ac_url": d.get("ac_url", ""),
                    })
            else:
                raw = self.fetch_deals(limit=1000)
                deals = []
                for d in raw:
                    deals.append({
                        "id": str(d.get("id", "")),
                        "title": d.get("title", ""),
                        "value": float(d.get("value", 0)),
                        "currency": d.get("currency", "usd"),
                        "status": int(d.get("status", 0)),
                        "stage_id": str(d.get("stage", "")),
                        "pipeline_id": str(d.get("group", "")),
                        "owner_id": str(d.get("owner", "")),
                        "owner_email": (d.get("owner_info") or {}).get("email", ""),
                        "contact_id": str(d.get("contact", "")),
                        "created_date": d.get("cdate", ""),
                        "updated_date": d.get("mdate", ""),
                        "close_date": d.get("nextdate") or None,
                        "ac_url": d.get("ac_url", ""),
                    })

            # Group by owner
            owners: Dict[str, List[Dict]] = {}
            for deal in deals:
                oid = deal.get("owner_id", "")
                owners.setdefault(oid, []).append(deal)

            results: List[Dict] = []
            for owner_id, owner_deals in owners.items():
                open_deals = [d for d in owner_deals if d["status"] == 0]
                won_deals = [d for d in owner_deals if d["status"] == 1]
                lost_deals = [d for d in owner_deals if d["status"] == 2]
                pipeline_value = sum(d["value"] for d in open_deals)
                won_value = sum(d["value"] for d in won_deals)
                closed = len(won_deals) + len(lost_deals)
                win_rate = len(won_deals) / closed if closed > 0 else 0.0
                all_values = [d["value"] for d in owner_deals if d["value"] > 0]
                avg_deal_size = sum(all_values) / len(all_values) if all_values else 0.0

                currency_breakdown = {"usd": 0.0, "cad": 0.0}
                for d in owner_deals:
                    cur = d.get("currency", "usd")
                    if cur in currency_breakdown:
                        currency_breakdown[cur] += d["value"]

                # Resolve owner name/email via cached lookup
                owner_info = self._get_owner_info(owner_id)

                results.append({
                    "owner_id": owner_id,
                    "owner_email": owner_info["owner_email"],
                    "owner_name": owner_info["owner_name"],
                    "total_deals": len(owner_deals),
                    "open_deals": len(open_deals),
                    "won_deals": len(won_deals),
                    "lost_deals": len(lost_deals),
                    "pipeline_value": pipeline_value,
                    "won_value": won_value,
                    "win_rate": round(win_rate, 4),
                    "avg_deal_size": round(avg_deal_size, 2),
                    "currency_breakdown": currency_breakdown,
                })

            return results
        except Exception as e:
            print(f"[ActiveCampaign] fetch_deals_by_owner: {e}")
            return []

    def fetch_pipeline_health(
        self,
        pipeline_id: Optional[int] = None,
        stall_threshold_days: int = 14,
    ) -> Dict:
        """Identify deals at risk: stalled, overdue, or healthy.

        Returns:
            Summary dict with healthy/stalled/overdue lists and a health_score.
        """
        empty_result: Dict = {
            "total_open_deals": 0,
            "total_open_value": 0.0,
            "healthy_deals": [],
            "stalled_deals": [],
            "overdue_deals": [],
            "health_score": 0.0,
            "by_stage": [],
        }
        try:
            # Fetch deals + stages
            deals, stages = self.fetch_deals_with_stages(
                limit=1000, pipeline_id=pipeline_id,
            )
            stage_map = {str(s["id"]): s for s in stages}

            open_deals = [d for d in deals if int(d.get("status", 0)) == 0]
            now = datetime.now()

            healthy: List[Dict] = []
            stalled: List[Dict] = []
            overdue: List[Dict] = []

            stage_stats: Dict[str, Dict] = {}

            for deal in open_deals:
                deal_info = {
                    "id": str(deal.get("id", "")),
                    "title": deal.get("title", ""),
                    "value": float(deal.get("value", 0)),
                    "currency": deal.get("currency", "usd"),
                    "stage_id": str(deal.get("stage", "")),
                    "stage_name": deal.get("_stage_title", "Unknown"),
                    "owner_id": str(deal.get("owner", "")),
                    "created_date": deal.get("cdate", ""),
                    "updated_date": deal.get("mdate", ""),
                    "close_date": deal.get("nextdate") or None,
                    "ac_url": deal.get("ac_url", ""),
                }

                # Track stage stats
                sid = deal_info["stage_id"]
                if sid not in stage_stats:
                    s_info = stage_map.get(sid, {})
                    stage_stats[sid] = {
                        "stage_id": sid,
                        "stage_name": s_info.get("title", deal_info["stage_name"]),
                        "deal_count": 0,
                        "total_value": 0.0,
                        "stalled_count": 0,
                    }
                stage_stats[sid]["deal_count"] += 1
                stage_stats[sid]["total_value"] += deal_info["value"]

                # Determine health
                is_stalled = False
                is_overdue = False

                updated = deal.get("mdate", "")
                if updated:
                    try:
                        updated_dt = datetime.fromisoformat(updated.replace("Z", "+00:00")).replace(tzinfo=None)
                        days_since = (now - updated_dt).days
                        if days_since > stall_threshold_days:
                            is_stalled = True
                            deal_info["days_stalled"] = days_since
                    except ValueError:
                        pass

                close = deal.get("nextdate") or ""
                if close and close.strip():
                    try:
                        close_dt = datetime.fromisoformat(close.replace("Z", "+00:00")).replace(tzinfo=None)
                        if close_dt < now:
                            is_overdue = True
                            deal_info["days_overdue"] = (now - close_dt).days
                    except ValueError:
                        pass

                if is_stalled:
                    stalled.append(deal_info)
                    stage_stats[sid]["stalled_count"] += 1
                if is_overdue:
                    overdue.append(deal_info)
                if not is_stalled and not is_overdue:
                    healthy.append(deal_info)

            total = len(open_deals)
            return {
                "total_open_deals": total,
                "total_open_value": sum(float(d.get("value", 0)) for d in open_deals),
                "healthy_deals": healthy,
                "stalled_deals": stalled,
                "overdue_deals": overdue,
                "health_score": round(len(healthy) / total, 4) if total > 0 else 0.0,
                "by_stage": list(stage_stats.values()),
            }
        except Exception as e:
            print(f"[ActiveCampaign] fetch_pipeline_health: {e}")
            return empty_result

    def fetch_cohort_data(
        self, months: int = 12, pipeline_id: Optional[int] = None,
    ) -> List[Dict]:
        """Build cohort data from deals — no per-month contact fetching.

        Groups deals by the month they were created, then computes
        conversion metrics per cohort. Uses a single bulk deal fetch
        instead of per-month + per-contact API calls.

        Args:
            months: Number of months to look back.
            pipeline_id: If provided, restrict to this pipeline only.

        Returns:
            List of per-month cohort dicts.
        """
        try:
            now = datetime.now()

            # Fetch all deals from last N months in one call
            end = now.strftime("%Y-%m-%d")
            start = (now - timedelta(days=months * 31)).strftime("%Y-%m-%d")

            all_deals = self.fetch_deals_for_range(start, end, pipeline_id=pipeline_id)

            # Build cohort map: month -> {created, won, value, days_list}
            cohorts: Dict[str, Dict] = {}

            for deal in all_deals:
                created_str = deal.get("cdate") or deal.get("created_date") or ""
                if not created_str:
                    continue
                try:
                    created = datetime.fromisoformat(
                        created_str.replace("Z", "+00:00")
                    ).replace(tzinfo=None)
                    cohort_month = created.strftime("%Y-%m")
                except Exception:
                    continue

                if cohort_month not in cohorts:
                    cohorts[cohort_month] = {
                        "contacts_created": 0,
                        "converted_to_hiro": 0,
                        "total_value_won": 0.0,
                        "days_list": [],
                    }

                cohorts[cohort_month]["contacts_created"] += 1

                # status may be int or string "1"
                if str(deal.get("status", "")) == "1":  # won
                    cohorts[cohort_month]["converted_to_hiro"] += 1
                    try:
                        val = float(deal.get("value", 0) or 0)
                    except (ValueError, TypeError):
                        val = 0.0
                    cohorts[cohort_month]["total_value_won"] += val

                    # Days to convert: created to updated (close approximation)
                    updated_str = deal.get("mdate") or deal.get("updated_date") or ""
                    if updated_str:
                        try:
                            updated = datetime.fromisoformat(
                                updated_str.replace("Z", "+00:00")
                            ).replace(tzinfo=None)
                            days = max((updated - created).days, 0)
                            cohorts[cohort_month]["days_list"].append(days)
                        except Exception:
                            pass

            # Build result sorted by month, last N months only
            results: List[Dict] = []
            for month_key in sorted(cohorts.keys()):
                data = cohorts[month_key]
                total = data["contacts_created"]
                won = data["converted_to_hiro"]
                days_list = data["days_list"]
                results.append({
                    "cohort_month": month_key,
                    "contacts_created": total,
                    "converted_to_hiro": won,
                    "conversion_rate": round(won / total, 4) if total else 0.0,
                    "avg_days_to_convert": (
                        round(sum(days_list) / len(days_list), 1)
                        if days_list else None
                    ),
                    "total_value_won": round(data["total_value_won"], 2),
                })

            return results[-months:]
        except Exception as e:
            print(f"[ActiveCampaign] fetch_cohort_data: {e}")
            return []

    def fetch_stage_velocity(
        self,
        pipeline_id: Optional[int] = None,
        days: int = 90,
        use_real_history: bool = True,
    ) -> List[Dict]:
        """Calculate average time deals spend in each stage.

        When use_real_history=True, calls fetch_deal_stage_history() per deal
        for accurate stage timing via the dealActivities endpoint.
        When False, uses the mdate-based estimate (faster but less accurate).

        Args:
            pipeline_id: Pipeline to analyze (optional)
            days: Lookback period in days
            use_real_history: Use activity-based history (True) or mdate estimate (False)

        Returns:
            List of per-stage velocity dicts.
        """
        try:
            end = datetime.now().strftime("%Y-%m-%d")
            start = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")

            deals = self.fetch_deals_for_range(start, end, pipeline_id)

            # Load stage metadata
            pipeline_stages = self.get_pipeline_stages(pipeline_id)
            stage_map = {str(s["id"]): s for s in pipeline_stages}

            # Collect durations per stage
            stages: Dict[str, Dict] = {}
            now = datetime.now()

            for deal in deals:
                deal_id = str(deal.get("id", ""))

                if use_real_history and deal_id:
                    # Use real activity-based history
                    try:
                        history = self.fetch_deal_stage_history(deal_id)
                        for entry in history:
                            sid = str(entry.get("stage_id", ""))
                            if not sid:
                                continue
                            if sid not in stages:
                                stage_info = stage_map.get(sid, {})
                                stages[sid] = {
                                    "stage_id": sid,
                                    "stage_name": stage_info.get("title", f"Stage {sid}"),
                                    "stage_order": int(stage_info.get("order", 0)),
                                    "days_list": [],
                                    "deal_count": 0,
                                }
                            stages[sid]["days_list"].append(entry.get("days_in_stage", 0))
                            stages[sid]["deal_count"] += 1
                        continue  # Skip the mdate fallback below
                    except Exception as e:
                        print(f"[ActiveCampaign] fetch_stage_velocity: history failed for deal {deal_id}, using mdate: {e}")
                        # Fall through to mdate estimate

                # mdate-based estimate (fallback or when use_real_history=False)
                stage_id = str(deal.get("stage_id", ""))
                if not stage_id:
                    continue

                updated_str = deal.get("updated_date", "")
                days_in_stage = 0
                if updated_str:
                    try:
                        updated = datetime.fromisoformat(
                            updated_str.replace("Z", "+00:00")
                        ).replace(tzinfo=None)
                        days_in_stage = max((now - updated).days, 0)
                    except Exception:
                        pass

                if stage_id not in stages:
                    stage_info = stage_map.get(stage_id, {})
                    stages[stage_id] = {
                        "stage_id": stage_id,
                        "stage_name": stage_info.get("title", f"Stage {stage_id}"),
                        "stage_order": int(stage_info.get("order", 0)),
                        "days_list": [],
                        "deal_count": 0,
                    }

                stages[stage_id]["days_list"].append(days_in_stage)
                stages[stage_id]["deal_count"] += 1

            results: List[Dict] = []
            for s in stages.values():
                days_list = s["days_list"]
                if not days_list:
                    continue
                sorted_days = sorted(days_list)
                mid = len(sorted_days) // 2
                if len(sorted_days) % 2 != 0:
                    median = sorted_days[mid]
                else:
                    median = (sorted_days[mid - 1] + sorted_days[mid]) / 2
                results.append({
                    "stage_id": s["stage_id"],
                    "stage_name": s["stage_name"],
                    "stage_order": s["stage_order"],
                    "avg_days_in_stage": round(sum(days_list) / len(days_list), 1),
                    "median_days_in_stage": round(median, 1),
                    "min_days": min(days_list),
                    "max_days": max(days_list),
                    "deal_count": s["deal_count"],
                })

            return sorted(results, key=lambda x: x["stage_order"])
        except Exception as e:
            print(f"[ActiveCampaign] fetch_stage_velocity: {e}")
            return []

    def fetch_period_comparison(
        self,
        pipeline_id: Optional[int],
        period_a_start: str,
        period_a_end: str,
        period_b_start: str,
        period_b_end: str,
    ) -> Dict:
        """Compare deal metrics across two time periods (MoM, QoQ, YoY).

        Returns:
            Dict with period_a, period_b summaries and deltas.
        """
        empty_period: Dict = {
            "start": "",
            "end": "",
            "total_deals": 0,
            "pipeline_value": 0.0,
            "won_value": 0.0,
            "new_contacts": 0,
            "win_rate": 0.0,
            "avg_deal_size": 0.0,
            "currency_breakdown": {"usd": 0.0, "cad": 0.0},
        }
        empty: Dict = {
            "period_a": dict(empty_period),
            "period_b": dict(empty_period),
            "deltas": {},
        }
        try:
            deals_a = self.fetch_deals_for_range(period_a_start, period_a_end, pipeline_id)
            deals_b = self.fetch_deals_for_range(period_b_start, period_b_end, pipeline_id)

            def _summarize(deals: List[Dict], start: str, end: str) -> Dict:
                open_val = sum(d["value"] for d in deals if d["status"] == 0)
                won = [d for d in deals if d["status"] == 1]
                lost = [d for d in deals if d["status"] == 2]
                won_val = sum(d["value"] for d in won)
                closed = len(won) + len(lost)
                win_rate = len(won) / closed if closed > 0 else 0.0
                values = [d["value"] for d in deals if d["value"] > 0]
                avg_size = sum(values) / len(values) if values else 0.0
                contact_ids = {d["contact_id"] for d in deals if d.get("contact_id")}

                cur_breakdown = {"usd": 0.0, "cad": 0.0}
                for d in deals:
                    cur = d.get("currency", "usd")
                    if cur in cur_breakdown:
                        cur_breakdown[cur] += d["value"]

                return {
                    "start": start,
                    "end": end,
                    "total_deals": len(deals),
                    "pipeline_value": round(open_val, 2),
                    "won_value": round(won_val, 2),
                    "new_contacts": len(contact_ids),
                    "win_rate": round(win_rate, 4),
                    "avg_deal_size": round(avg_size, 2),
                    "currency_breakdown": cur_breakdown,
                }

            summary_a = _summarize(deals_a, period_a_start, period_a_end)
            summary_b = _summarize(deals_b, period_b_start, period_b_end)

            def _delta(key: str) -> Dict:
                a_val = summary_a[key]
                b_val = summary_b[key]
                diff = b_val - a_val
                if a_val != 0:
                    pct = round((diff / abs(a_val)) * 100, 2)
                else:
                    pct = 0.0 if diff == 0 else 100.0

                if diff > 0:
                    direction = "up"
                elif diff < 0:
                    direction = "down"
                else:
                    direction = "flat"

                return {
                    "value": round(diff, 2) if isinstance(diff, float) else diff,
                    "pct": pct,
                    "direction": direction,
                }

            deltas = {
                "total_deals": _delta("total_deals"),
                "pipeline_value": _delta("pipeline_value"),
                "won_value": _delta("won_value"),
                "win_rate": _delta("win_rate"),
                "avg_deal_size": _delta("avg_deal_size"),
            }

            return {
                "period_a": summary_a,
                "period_b": summary_b,
                "deltas": deltas,
            }
        except Exception as e:
            print(f"[ActiveCampaign] fetch_period_comparison: {e}")
            return empty

    # ------------------------------------------------------------------
    # New Methods — Value Additions
    # ------------------------------------------------------------------

    def fetch_deals_with_sideloading(
        self,
        pipeline_id: Optional[int] = None,
        include: str = "contact,stage",
        limit: int = 100,
    ) -> List[Dict]:
        """
        Fetch deals with related resources sideloaded in one API call.

        Uses AC's ?include= parameter to retrieve related data alongside
        deals, reducing API calls significantly.

        Args:
            pipeline_id: Filter to this pipeline (optional)
            include: Comma-separated relationships to sideload.
            limit: Page size (max 100 per AC API)

        Returns:
            List of normalised deal dicts with sideloaded data.
        """
        all_deals: List[Dict] = []
        offset = 0

        while True:
            # Deals endpoint: offset pagination with stable ordering
            params: Dict = {
                "limit": limit,
                "orders[id]": "ASC",
                "offset": offset,
                "include": include,
            }
            if pipeline_id is not None:
                params["filters[group]"] = pipeline_id

            response = self._make_request("/api/3/deals", params)
            batch = response.get("deals", [])

            if not batch:
                break

            # Build lookup maps for sideloaded resources
            contacts_map = {
                str(c.get("id", "")): c
                for c in response.get("contacts", [])
            }
            stages_map = {
                str(s.get("id", "")): s
                for s in response.get("dealStages", [])
            }

            for deal in batch:
                normalized = self._normalize_deal(deal)

                # Merge sideloaded contact
                contact_id = str(normalized.get("contact", ""))
                if contact_id in contacts_map:
                    normalized["_contact"] = contacts_map[contact_id]

                # Merge sideloaded stage
                stage_id = str(normalized.get("stage", ""))
                if stage_id in stages_map:
                    normalized["_stage_title"] = stages_map[stage_id].get("title", "")
                    normalized["_stage_order"] = int(
                        stages_map[stage_id].get("order", 0)
                    )

                all_deals.append(normalized)

            if len(batch) < limit:
                break
            offset += limit

        return all_deals

    def fetch_contact_scores(
        self,
        contact_ids: List[str],
    ) -> Dict[str, Optional[float]]:
        """
        Fetch AC lead score values for a list of contact IDs.

        Args:
            contact_ids: List of AC contact ID strings to score

        Returns:
            Dict mapping contact_id -> highest score value (float),
            or None if no score exists for that contact.
        """
        scores: Dict[str, Optional[float]] = {}

        for contact_id in contact_ids:
            try:
                resp = self._make_request(
                    f"/api/3/contacts/{contact_id}/scoreValues"
                )
                score_values = resp.get("scoreValues", [])
                if score_values:
                    scores[contact_id] = max(
                        float(sv.get("score", 0)) for sv in score_values
                    )
                else:
                    scores[contact_id] = None
            except Exception as e:
                print(
                    f"[ActiveCampaign] fetch_contact_scores: "
                    f"Could not fetch score for contact {contact_id}: {e}"
                )
                scores[contact_id] = None

        return scores

    def fetch_contact_activities(
        self,
        contact_id: str,
        limit: int = 50,
    ) -> List[Dict]:
        """
        Fetch behavioral activity log for a contact.

        Returns email opens, link clicks, site visits, form submissions,
        and other engagement events.

        Args:
            contact_id: AC contact ID string
            limit: Max activities to return (newest first)

        Returns:
            List of activity dicts.
        """
        try:
            resp = self._make_request(
                f"/api/3/contacts/{contact_id}/activities",
                {"limit": limit},
            )
            activities = resp.get("activities", [])
            return [
                {
                    "contact_id": contact_id,
                    "type": a.get("type", ""),
                    "timestamp": a.get("tstamp", ""),
                    "campaign_id": str(a.get("campaignid", "")),
                    "campaign_name": (
                        a.get("campaign", {}).get("name", "")
                        if isinstance(a.get("campaign"), dict) else ""
                    ),
                    "link_url": (
                        a.get("link", {}).get("link", "")
                        if isinstance(a.get("link"), dict) else ""
                    ),
                }
                for a in activities
            ]
        except Exception as e:
            print(
                f"[ActiveCampaign] fetch_contact_activities: "
                f"Could not fetch activities for contact {contact_id}: {e}"
            )
            return []

    def fetch_pipeline_summary(
        self,
        pipeline_id: int = 1,
        stall_threshold_days: int = 14,
    ) -> Dict:
        """
        Fetch enriched summary of a pipeline's current health.

        The single most important method for the MIC dashboard. Returns
        all key metrics needed by the executive summary view, revenue
        calculator, and Slack alerting system in one structured dict.

        Args:
            pipeline_id: Pipeline to summarise (default: 1)
            stall_threshold_days: Days without update = stalled

        Returns:
            Dict with pipeline metrics including stages, HIRO stats, stall info.
        """
        try:
            deals, stages = self.fetch_deals_with_stages(
                limit=1000, pipeline_id=pipeline_id
            )

            open_deals = [d for d in deals if int(d.get("status", 0)) == 0]
            won_deals  = [d for d in deals if int(d.get("status", 0)) == 1]
            lost_deals = [d for d in deals if int(d.get("status", 0)) == 2]

            usd_value = sum(
                float(d.get("value", 0)) for d in open_deals
                if d.get("currency", "usd") == "usd"
            )
            cad_value = sum(
                float(d.get("value", 0)) for d in open_deals
                if d.get("currency", "") == "cad"
            )

            # Stage breakdown ordered by stage position
            stage_order = sorted(stages, key=lambda s: int(s.get("order", 0)))
            stage_summary: List[Dict] = []
            for s in stage_order:
                sid = str(s.get("id", ""))
                stage_deals = [
                    d for d in open_deals
                    if str(d.get("stage", "")) == sid
                ]
                stage_summary.append({
                    "stage_id": sid,
                    "stage_name": s.get("title", ""),
                    "stage_order": int(s.get("order", 0)),
                    "deal_count": len(stage_deals),
                    "total_value": round(
                        sum(float(d.get("value", 0)) for d in stage_deals), 2
                    ),
                })

            # HIRO = last stage by order
            hiro_stage = stage_order[-1] if stage_order else {}
            hiro_stage_id = str(hiro_stage.get("id", ""))
            hiro_deals = [
                d for d in open_deals
                if str(d.get("stage", "")) == hiro_stage_id
            ]
            hiro_rate = (
                round(len(hiro_deals) / len(open_deals), 4)
                if open_deals else 0.0
            )

            # Stall detection
            now = datetime.now()
            stalled = []
            for d in open_deals:
                updated = d.get("mdate", "")
                if updated:
                    try:
                        updated_dt = datetime.fromisoformat(
                            updated.replace("Z", "+00:00")
                        ).replace(tzinfo=None)
                        if (now - updated_dt).days > stall_threshold_days:
                            stalled.append(d)
                    except Exception:
                        pass

            # Resolve pipeline name
            pipeline_name = "Pipeline " + str(pipeline_id)
            try:
                pipelines = self.fetch_all_pipelines()
                for p in pipelines:
                    if p.get("id") == pipeline_id or str(p.get("id")) == str(pipeline_id):
                        pipeline_name = p.get("title", pipeline_name)
                        break
            except Exception:
                pass

            return {
                "pipeline_id": pipeline_id,
                "pipeline_name": pipeline_name,
                "total_deals": len(deals),
                "open_deals": len(open_deals),
                "won_deals": len(won_deals),
                "lost_deals": len(lost_deals),
                "total_value_usd": round(usd_value, 2),
                "total_value_cad": round(cad_value, 2),
                "stages": stage_summary,
                "hiro_stage_id": hiro_stage_id,
                "hiro_stage_name": hiro_stage.get("title", "HIRO"),
                "hiro_deal_count": len(hiro_deals),
                "hiro_rate": hiro_rate,
                "hiro_rate_pct": round(hiro_rate * 100, 1),
                "hiro_target_met": hiro_rate >= 0.25,
                "stalled_count": len(stalled),
                "stalled_value": round(
                    sum(float(d.get("value", 0)) for d in stalled), 2
                ),
                "as_of": datetime.now().isoformat(),
            }

        except Exception as e:
            print(f"[ActiveCampaign] fetch_pipeline_summary: {e}")
            return {}

    def test_connection(self) -> Dict:
        """
        Test API connectivity and permissions comprehensively.

        Tests contacts access, deals access, and Pipeline 1 accessibility.
        Returns a structured diagnostic dict instead of a bare bool.

        Returns:
            Dict with keys: connected, api_version, contacts_ok, deals_ok,
            pipeline_ok, pipeline_deal_count, errors
        """
        result = ConnectionResult({
            "connected": False,
            "api_version": "v3",
            "contacts_ok": False,
            "deals_ok": False,
            "pipeline_ok": False,
            "pipeline_deal_count": 0,
            "errors": [],
        })

        # Test 1: Contacts (confirms Api-Token is valid)
        try:
            resp = self._make_request("/api/3/contacts", {"limit": 1})
            result["contacts_ok"] = "contacts" in resp
        except RuntimeError as e:
            result["errors"].append(str(e))
            return result  # 402/403 — no point continuing
        except Exception as e:
            result["errors"].append(f"Contacts: {e}")

        # Test 2: Deals permission (separate from contacts in AC user groups)
        try:
            resp = self._make_request("/api/3/deals", {"limit": 1})
            result["deals_ok"] = "deals" in resp
        except RuntimeError as e:
            result["errors"].append(
                "Deals (403): API user may lack Deals permission. "
                "Check Settings > Users > Groups in AC."
            )
        except Exception as e:
            result["errors"].append(f"Deals: {e}")

        # Test 3: Primary pipeline (Pipeline 1)
        try:
            resp = self._make_request(
                "/api/3/deals",
                {"limit": 1, "filters[group]": 1},
            )
            deals = resp.get("deals", [])
            total = int(resp.get("meta", {}).get("total", 0))
            result["pipeline_ok"] = True
            result["pipeline_deal_count"] = total

            # Validate filter worked
            if deals and str(deals[0].get("group", "")) != "1":
                result["errors"].append(
                    "WARNING: Pipeline 1 filter may have silently failed."
                )
        except Exception as e:
            result["errors"].append(f"Pipeline 1: {e}")

        result["connected"] = result["contacts_ok"] and result["deals_ok"]
        return result


if __name__ == "__main__":
    # Example usage
    import yaml

    # Load credentials
    with open('config/credentials.yaml', 'r') as f:
        config = yaml.safe_load(f)

    # Initialize connector
    ac = ActiveCampaignConnector(
        api_url=config['activecampaign']['api_url'],
        api_key=config['activecampaign']['api_key']
    )

    # Test connection
    diag = ac.test_connection()
    if diag["connected"]:
        print("✅ ActiveCampaign connection successful!")
        print(f"   Contacts: {'✅' if diag['contacts_ok'] else '❌'}")
        print(f"   Deals: {'✅' if diag['deals_ok'] else '❌'}")
        print(f"   Pipeline 1: {'✅' if diag['pipeline_ok'] else '❌'} ({diag['pipeline_deal_count']} deals)")
        if diag["errors"]:
            print(f"   Warnings: {diag['errors']}")

        # Fetch sample data
        contacts = ac.fetch_contacts(limit=5)
        print(f"\n📊 Fetched {len(contacts)} contacts")

        deals = ac.fetch_deals(limit=5)
        print(f"📊 Fetched {len(deals)} deals")

        pipelines = ac.get_pipelines()
        print(f"📊 Found {len(pipelines)} pipelines")
    else:
        print("❌ ActiveCampaign connection failed")
        for err in diag["errors"]:
            print(f"   {err}")
