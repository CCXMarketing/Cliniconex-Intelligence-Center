import requests
from agents.data_connector.google_ads import from_config
from datetime import datetime, timedelta

c = from_config()
token = c._ensure_access_token()

start = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
end = datetime.now().strftime("%Y-%m-%d")

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
    WHERE segments.date BETWEEN '{start}' AND '{end}'
    ORDER BY campaign.name
"""

resp = requests.post(
    f'https://googleads.googleapis.com/v23/customers/{c.customer_id}/googleAds:searchStream',
    headers={
        'Authorization': f'Bearer {token}',
        'developer-token': c.developer_token,
        'login-customer-id': c.login_customer_id,
        'Content-Type': 'application/json',
    },
    json={'query': query}
)

print(f"Status: {resp.status_code}")
print(f"Response: {resp.text[:2000]}")
