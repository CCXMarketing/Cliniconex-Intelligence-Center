"""
Google Ads API v17 Connector Agent
Handles OAuth, data fetching, and caching for Google Ads via the REST API.
"""

import time
import requests
from datetime import datetime
from typing import Any, Dict, List, Optional

from agents.data_connector.base_connector import BaseConnector

# Google Ads REST API v17 base URL
_BASE_URL = "https://googleads.googleapis.com/v17"
_TOKEN_URL = "https://oauth2.googleapis.com/token"


class GoogleAdsConnector(BaseConnector):
    """Connector for the Google Ads REST API (v17)."""

    def __init__(
        self,
        developer_token: str,
        client_id: str,
        client_secret: str,
        refresh_token: str,
        customer_id: str,
        login_customer_id: str,
        cache_ttl: int = 300,
    ):
        super().__init__(connector_name="google_ads", cache_ttl=cache_ttl)
        self.developer_token = developer_token
        self.client_id = client_id
        self.client_secret = client_secret
        self.refresh_token = refresh_token
        # Store IDs without hyphens — the API expects plain digits.
        self.customer_id = customer_id.replace("-", "")
        self.login_customer_id = login_customer_id.replace("-", "")
        self._access_token: Optional[str] = None
        self._token_expiry: float = 0
        self._last_sync: Optional[str] = None

    # ── OAuth ───────────────────────────────────────────────────────────

    def _ensure_access_token(self) -> str:
        """Refresh the OAuth2 access token if it has expired."""
        if self._access_token and time.time() < self._token_expiry:
            return self._access_token

        payload = {
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "refresh_token": self.refresh_token,
            "grant_type": "refresh_token",
        }
        resp = requests.post(_TOKEN_URL, data=payload, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        self._access_token = data["access_token"]
        # Expire a little early to avoid race conditions.
        self._token_expiry = time.time() + data.get("expires_in", 3600) - 60
        return self._access_token

    # ── low-level request helpers ───────────────────────────────────────

    def _headers(self) -> Dict[str, str]:
        token = self._ensure_access_token()
        return {
            "Authorization": f"Bearer {token}",
            "developer-token": self.developer_token,
            "login-customer-id": self.login_customer_id,
            "Content-Type": "application/json",
        }

    def _search(self, query: str) -> List[Dict]:
        """
        Execute a GAQL query via the searchStream endpoint and return
        the flattened list of result rows.
        """
        url = f"{_BASE_URL}/customers/{self.customer_id}/googleAds:searchStream"
        body = {"query": query}

        try:
            resp = requests.post(
                url, headers=self._headers(), json=body, timeout=60
            )
            resp.raise_for_status()
        except requests.exceptions.RequestException as e:
            print(f"Error querying Google Ads: {e}")
            raise

        rows: List[Dict] = []
        for batch in resp.json():
            rows.extend(batch.get("results", []))
        return rows

    def _search_cached(self, query: str) -> List[Dict]:
        """_search with a cache layer to respect rate limits."""
        key = self._cache_key("search", query)
        cached = self._get_cached(key)
        if cached is not None:
            return cached
        result = self._search(query)
        self._set_cached(key, result)
        return result

    # ── helper: date formatting ─────────────────────────────────────────

    @staticmethod
    def _fmt(d: str | datetime) -> str:
        """Accept a date string (YYYY-MM-DD) or datetime and return YYYY-MM-DD."""
        if isinstance(d, datetime):
            return d.strftime("%Y-%m-%d")
        return d

    # ── public data methods ─────────────────────────────────────────────

    def fetch_campaigns(
        self, start_date: str | datetime, end_date: str | datetime
    ) -> List[Dict]:
        """
        Fetch campaigns with high-level metrics for a date range.

        Returns a list of dicts with keys:
            id, name, status, start_date, end_date,
            impressions, clicks, cost, conversions
        """
        sd, ed = self._fmt(start_date), self._fmt(end_date)
        query = f"""
            SELECT
                campaign.id,
                campaign.name,
                campaign.status,
                campaign.start_date,
                campaign.end_date,
                metrics.impressions,
                metrics.clicks,
                metrics.cost_micros,
                metrics.conversions
            FROM campaign
            WHERE segments.date BETWEEN '{sd}' AND '{ed}'
            ORDER BY campaign.name
        """
        rows = self._search_cached(query)
        return [
            {
                "id": str(r["campaign"]["id"]),
                "name": r["campaign"]["name"],
                "status": r["campaign"]["status"],
                "start_date": r["campaign"].get("startDate"),
                "end_date": r["campaign"].get("endDate"),
                "impressions": int(r["metrics"]["impressions"]),
                "clicks": int(r["metrics"]["clicks"]),
                "cost": int(r["metrics"]["costMicros"]) / 1_000_000,
                "conversions": float(r["metrics"]["conversions"]),
            }
            for r in rows
        ]

    def fetch_ad_groups(self, campaign_id: str) -> List[Dict]:
        """
        Fetch ad groups for a specific campaign.

        Returns a list of dicts with keys:
            id, name, status, campaign_id, type
        """
        query = f"""
            SELECT
                ad_group.id,
                ad_group.name,
                ad_group.status,
                ad_group.campaign,
                ad_group.type
            FROM ad_group
            WHERE campaign.id = {campaign_id}
            ORDER BY ad_group.name
        """
        rows = self._search_cached(query)
        return [
            {
                "id": str(r["adGroup"]["id"]),
                "name": r["adGroup"]["name"],
                "status": r["adGroup"]["status"],
                "campaign_id": str(campaign_id),
                "type": r["adGroup"]["type"],
            }
            for r in rows
        ]

    def fetch_search_terms(
        self, start_date: str | datetime, end_date: str | datetime
    ) -> List[Dict]:
        """
        Fetch search-term report for a date range.

        Returns a list of dicts with keys:
            search_term, campaign_id, campaign_name, ad_group_id,
            impressions, clicks, cost, conversions
        """
        sd, ed = self._fmt(start_date), self._fmt(end_date)
        query = f"""
            SELECT
                search_term_view.search_term,
                campaign.id,
                campaign.name,
                ad_group.id,
                metrics.impressions,
                metrics.clicks,
                metrics.cost_micros,
                metrics.conversions
            FROM search_term_view
            WHERE segments.date BETWEEN '{sd}' AND '{ed}'
            ORDER BY metrics.impressions DESC
        """
        rows = self._search_cached(query)
        return [
            {
                "search_term": r["searchTermView"]["searchTerm"],
                "campaign_id": str(r["campaign"]["id"]),
                "campaign_name": r["campaign"]["name"],
                "ad_group_id": str(r["adGroup"]["id"]),
                "impressions": int(r["metrics"]["impressions"]),
                "clicks": int(r["metrics"]["clicks"]),
                "cost": int(r["metrics"]["costMicros"]) / 1_000_000,
                "conversions": float(r["metrics"]["conversions"]),
            }
            for r in rows
        ]

    def fetch_performance_metrics(
        self, start_date: str | datetime, end_date: str | datetime
    ) -> Dict:
        """
        Fetch aggregate account-level performance for a date range.

        Returns a dict with keys:
            impressions, clicks, cost, conversions, ctr, avg_cpc,
            conversion_rate, cost_per_conversion, date_range
        """
        sd, ed = self._fmt(start_date), self._fmt(end_date)
        query = f"""
            SELECT
                metrics.impressions,
                metrics.clicks,
                metrics.cost_micros,
                metrics.conversions,
                metrics.ctr,
                metrics.average_cpc,
                metrics.cost_per_conversion
            FROM customer
            WHERE segments.date BETWEEN '{sd}' AND '{ed}'
        """
        rows = self._search_cached(query)

        totals: Dict[str, Any] = {
            "impressions": 0,
            "clicks": 0,
            "cost": 0.0,
            "conversions": 0.0,
        }
        for r in rows:
            m = r["metrics"]
            totals["impressions"] += int(m["impressions"])
            totals["clicks"] += int(m["clicks"])
            totals["cost"] += int(m["costMicros"]) / 1_000_000
            totals["conversions"] += float(m["conversions"])

        impressions = totals["impressions"]
        clicks = totals["clicks"]
        cost = totals["cost"]
        conversions = totals["conversions"]

        return {
            "impressions": impressions,
            "clicks": clicks,
            "cost": round(cost, 2),
            "conversions": conversions,
            "ctr": round(clicks / impressions, 4) if impressions else 0,
            "avg_cpc": round(cost / clicks, 2) if clicks else 0,
            "conversion_rate": round(conversions / clicks, 4) if clicks else 0,
            "cost_per_conversion": (
                round(cost / conversions, 2) if conversions else 0
            ),
            "date_range": {"start": sd, "end": ed},
        }

    # ── abstract interface implementations ─────────────────────────────

    def fetch_data(
        self, start_date: datetime, end_date: datetime, limit: int = 100
    ) -> List[Dict]:
        """Fetch campaign performance data for the given date range."""
        campaigns = self.fetch_campaigns(start_date, end_date)
        self._last_sync = datetime.utcnow().isoformat()
        return campaigns[:limit]

    def get_metadata(self) -> Dict:
        """Return metadata about this Google Ads data source."""
        return {
            "source": "google_ads",
            "connected": self.test_connection(),
            "last_sync": self._last_sync,
            "customer_id": self.customer_id,
            "api_version": "v17",
        }

    # ── connection test ─────────────────────────────────────────────────

    def test_connection(self) -> bool:
        """Return True if we can authenticate and reach the account."""
        try:
            query = "SELECT customer.id FROM customer LIMIT 1"
            self._search(query)
            return True
        except Exception as e:
            print(f"Google Ads connection test failed: {e}")
            return False


# ── convenience factory ─────────────────────────────────────────────────

def from_config(config_path: str = "config/credentials.yaml") -> GoogleAdsConnector:
    """Create a GoogleAdsConnector from a YAML config file."""
    import yaml

    with open(config_path, "r") as f:
        cfg = yaml.safe_load(f)["google_ads"]

    return GoogleAdsConnector(
        developer_token=cfg["developer_token"],
        client_id=cfg["client_id"],
        client_secret=cfg["client_secret"],
        refresh_token=cfg["refresh_token"],
        customer_id=cfg["customer_id"],
        login_customer_id=cfg["login_customer_id"],
    )


if __name__ == "__main__":
    connector = from_config()

    if connector.test_connection():
        print("Google Ads connection successful!")

        campaigns = connector.fetch_campaigns("2024-01-01", "2024-01-31")
        print(f"\nFetched {len(campaigns)} campaigns")
        for c in campaigns[:3]:
            print(f"  - {c['name']}: {c['clicks']} clicks, ${c['cost']:.2f}")

        metrics = connector.fetch_performance_metrics("2024-01-01", "2024-01-31")
        print(f"\nAccount metrics: {metrics['clicks']} clicks, "
              f"${metrics['cost']:.2f} spend, CTR {metrics['ctr']:.2%}")
    else:
        print("Google Ads connection failed")
