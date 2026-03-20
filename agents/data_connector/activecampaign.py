"""
ActiveCampaign API Connector Agent
Handles authentication, data fetching, and caching for ActiveCampaign
"""

import requests
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import json


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
    
    def _make_request(self, endpoint: str, params: Optional[Dict] = None) -> Dict:
        """
        Make authenticated request to ActiveCampaign API
        
        Args:
            endpoint: API endpoint (e.g., '/api/3/contacts')
            params: Query parameters
            
        Returns:
            JSON response as dictionary
        """
        url = f"{self.api_url}{endpoint}"
        
        try:
            response = requests.get(url, headers=self.headers, params=params)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"Error fetching from ActiveCampaign: {e}")
            raise

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

    def fetch_contacts(self, limit: int = 1000, offset: int = 0) -> List[Dict]:
        """
        Fetch contacts from ActiveCampaign
        
        Args:
            limit: Number of contacts to fetch
            offset: Pagination offset
            
        Returns:
            List of contact dictionaries
        """
        endpoint = '/api/3/contacts'
        params = {'limit': limit, 'offset': offset}
        
        response = self._make_request(endpoint, params)
        return response.get('contacts', [])
    
    def fetch_deals(self, limit: int = 1000, offset: int = 0) -> List[Dict]:
        """
        Fetch deals from ActiveCampaign.

        Values are converted from cents to dollars automatically.

        Args:
            limit: Number of deals to fetch
            offset: Pagination offset

        Returns:
            List of deal dictionaries (value in dollars)
        """
        endpoint = '/api/3/deals'
        params = {'limit': limit, 'offset': offset}

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
        params = {
            'limit': limit,
            'offset': offset,
            'filters[group]': pipeline_id,
        }

        response = self._make_request(endpoint, params)
        return [self._normalize_deal(d) for d in response.get('deals', [])]
    
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
        # Client-side filter as backup (some AC versions ignore the param)
        if pipeline_id is not None and stages:
            stages = [s for s in stages if str(s.get("group")) == str(pipeline_id)]
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
            params: Dict = {"limit": batch_size, "offset": offset}
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

        Args:
            start_date: ISO date string (e.g. '2026-01-01')
            end_date: ISO date string (e.g. '2026-03-31')
            limit: Number of contacts to fetch
            offset: Pagination offset

        Returns:
            List of contact dictionaries created in the range
        """
        endpoint = '/api/3/contacts'
        params = {
            'limit': limit,
            'offset': offset,
            'filters[created_after]': start_date,
            'filters[created_before]': end_date,
        }

        response = self._make_request(endpoint, params)
        return response.get('contacts', [])

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
        except Exception:
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
                params: Dict = {
                    "limit": batch_size,
                    "offset": offset,
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
            print(f"Error fetching deals for range: {e}")
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
        except Exception:
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
            print(f"Error fetching deal stage history for {deal_id}: {e}")
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
                    resp = self._make_request("/api/3/deals", {
                        "limit": 100,
                        "offset": deal_offset,
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
                offset = 0
                while True:
                    resp = self._make_request("/api/3/fieldValues", {
                        "filters[field]": field_id,
                        "limit": 100,
                        "offset": offset,
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
            print(f"Error fetching contacts with UTM: {e}")
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
            print(f"Error fetching deals by owner: {e}")
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
            print(f"Error fetching pipeline health: {e}")
            return empty_result

    def fetch_cohort_data(self, months: int = 12) -> List[Dict]:
        """Build cohort data from deals — no per-month contact fetching.

        Groups deals by the month they were created, then computes
        conversion metrics per cohort. Uses a single bulk deal fetch
        instead of per-month + per-contact API calls.

        Returns:
            List of per-month cohort dicts.
        """
        try:
            now = datetime.now()

            # Fetch all deals from last N months in one call
            end = now.strftime("%Y-%m-%d")
            start = (now - timedelta(days=months * 31)).strftime("%Y-%m-%d")

            all_deals = self.fetch_deals_for_range(start, end)

            # Build cohort map: month -> {created, won, value, days_list}
            cohorts: Dict[str, Dict] = {}

            for deal in all_deals:
                created_str = deal.get("created_date", "")
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

                if deal.get("status") == 1:  # won
                    cohorts[cohort_month]["converted_to_hiro"] += 1
                    cohorts[cohort_month]["total_value_won"] += deal.get("value", 0.0)

                    # Days to convert: created to updated (close approximation)
                    updated_str = deal.get("updated_date", "")
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
            print(f"Error fetching cohort data: {e}")
            return []

    def fetch_stage_velocity(
        self,
        pipeline_id: Optional[int] = None,
        days: int = 90,
    ) -> List[Dict]:
        """Calculate average time deals spend in each stage.

        Uses deal created_date and updated_date only — no per-deal API
        calls. Estimates days in current stage from updated_date to now.

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
                stage_id = str(deal.get("stage_id", ""))
                if not stage_id:
                    continue

                # Estimate days in stage from updated_date to now
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
            print(f"Error fetching stage velocity: {e}")
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
            print(f"Error fetching period comparison: {e}")
            return empty

    def test_connection(self) -> bool:
        """
        Test if API connection is working

        Returns:
            True if connection successful, False otherwise
        """
        try:
            self.fetch_contacts(limit=1)
            return True
        except Exception as e:
            print(f"Connection test failed: {e}")
            return False


if __name__ == "__main__":
    # Example usage
    import yaml
    
    # Load credentials
    with open('config/credentials.yaml', 'r') as f:        config = yaml.safe_load(f)
    
    # Initialize connector
    ac = ActiveCampaignConnector(
        api_url=config['activecampaign']['api_url'],
        api_key=config['activecampaign']['api_key']
    )
    
    # Test connection
    if ac.test_connection():
        print("✅ ActiveCampaign connection successful!")
        
        # Fetch sample data
        contacts = ac.fetch_contacts(limit=5)
        print(f"\n📊 Fetched {len(contacts)} contacts")
        
        deals = ac.fetch_deals(limit=5)
        print(f"📊 Fetched {len(deals)} deals")
        
        pipelines = ac.get_pipelines()
        print(f"📊 Found {len(pipelines)} pipelines")
    else:
        print("❌ ActiveCampaign connection failed")
