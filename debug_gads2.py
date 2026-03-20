import requests
from agents.data_connector.google_ads import from_config

c = from_config()
token = c._ensure_access_token()

# List all customers accessible to this token
resp = requests.get(
    'https://googleads.googleapis.com/v23/customers:listAccessibleCustomers',
    headers={
        'Authorization': f'Bearer {token}',
        'developer-token': c.developer_token,
    }
)

print(f"Status: {resp.status_code}")
print(f"Accessible customers: {resp.text}")
