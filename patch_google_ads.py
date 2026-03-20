"""
Quick patch: removes campaign.start_date and campaign.end_date
from fetch_campaigns() in agents/data_connector/google_ads.py
"""
from pathlib import Path

path = Path("agents/data_connector/google_ads.py")
content = path.read_text(encoding="utf-8")

# Remove the two deprecated field lines from the SELECT query
content = content.replace("                campaign.start_date,\n", "")
content = content.replace("                campaign.end_date,\n", "")

# Remove them from the return dict
content = content.replace('                "start_date": r["campaign"].get("startDate"),\n', "")
content = content.replace('                "end_date": r["campaign"].get("endDate"),\n', "")

path.write_text(content, encoding="utf-8")
print("✅ Patched google_ads.py — removed campaign.start_date and campaign.end_date")

# Verify
if "start_date" not in path.read_text() and "end_date" not in path.read_text():
    print("✅ Verified — neither field appears in the file")
else:
    print("⚠️  One or both fields may still be present — check manually")
