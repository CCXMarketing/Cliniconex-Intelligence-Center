import requests
import yaml
from agents.data_connector.google_ads import from_config

c = from_config()
token = c._ensure_access_token()

resp = requests.post(
    f'https://googleads.googleapis.com/v23/customers/{c.customer_id}/googleAds:searchStream',
    headers={
        'Authorization': f'Bearer {token}',
        'developer-token': c.developer_token,
        'login-customer-id': c.login_customer_id,
        'Content-Type': 'application/json',
    },
    json={'query': 'SELECT customer.id FROM customer LIMIT 1'}
)

print(f"Status: {resp.status_code}")
print(f"Response: {resp.text}")
