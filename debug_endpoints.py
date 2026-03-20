"""
Tests all failing endpoints and prints the actual error messages.
Run while the Flask server is running on port 8080.
"""
import requests

BASE = "http://localhost:8080"
PARAMS = "start_date=2026-01-01&end_date=2026-03-31&pipeline_id=1"

endpoints = [
    f"/api/campaigns",
    f"/api/pipeline-health?{PARAMS}",
    f"/api/velocity?{PARAMS}",
    f"/api/acquisition?{PARAMS}",
    f"/api/rep-performance?{PARAMS}",
    f"/api/forecast-weighted?{PARAMS}",
    f"/api/cohorts?months=12",
]

for ep in endpoints:
    try:
        r = requests.get(BASE + ep, timeout=15)
        print(f"\n{'='*60}")
        print(f"Endpoint: {ep.split('?')[0]}")
        print(f"Status:   {r.status_code}")
        print(f"Response: {r.text[:500]}")
    except Exception as e:
        print(f"\n{ep}: EXCEPTION — {e}")
