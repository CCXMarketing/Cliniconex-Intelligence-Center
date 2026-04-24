"""
Google Sheets connector for manual KPI entry persistence.

Uses a service account to read/write a shared Google Sheet.
The sheet is pre-populated with KPI rows from kpis.yaml.
Department owners fill in monthly values; the dashboard reads them.
"""

import logging
from datetime import datetime
from pathlib import Path

logger = logging.getLogger(__name__)

CONFIG_DIR = Path(__file__).resolve().parent.parent.parent / "config"


def _get_credentials(creds_config: dict):
    """Build Google credentials from service account JSON path or dict."""
    from google.oauth2.service_account import Credentials

    SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

    sa_path = creds_config.get("service_account_file", "")
    if sa_path:
        path = Path(sa_path)
        if not path.is_absolute():
            path = CONFIG_DIR / path
        if path.exists():
            return Credentials.from_service_account_file(str(path), scopes=SCOPES)

    sa_info = creds_config.get("service_account_info")
    if sa_info and isinstance(sa_info, dict):
        return Credentials.from_service_account_info(sa_info, scopes=SCOPES)

    raise ValueError("No valid Google service account credentials found")


class GoogleSheetsConnector:
    HEADER_ROW = [
        "kpi_id", "kpi_name", "department", "period",
        "value", "target", "status", "updated_by", "updated_at", "notes"
    ]

    def __init__(self, spreadsheet_id: str, creds_config: dict):
        self.spreadsheet_id = spreadsheet_id
        self._creds = _get_credentials(creds_config)
        self._service = None

    @property
    def service(self):
        if self._service is None:
            from googleapiclient.discovery import build
            self._service = build("sheets", "v4", credentials=self._creds)
        return self._service

    @property
    def sheets(self):
        return self.service.spreadsheets()

    def read_entries(self, department: str = None, period: str = None) -> list[dict]:
        """Read manual entries, optionally filtered by department and period."""
        result = self.sheets.values().get(
            spreadsheetId=self.spreadsheet_id,
            range="ManualEntries!A:J"
        ).execute()

        rows = result.get("values", [])
        if len(rows) < 2:
            return []

        headers = rows[0]
        entries = []
        for row in rows[1:]:
            entry = {}
            for i, h in enumerate(headers):
                entry[h] = row[i] if i < len(row) else ""
            if department and entry.get("department", "").lower() != department.lower():
                continue
            if period and entry.get("period") != period:
                continue
            entries.append(entry)

        return entries

    def write_entry(self, kpi_id: str, kpi_name: str, department: str,
                    period: str, value, target=None, updated_by: str = "",
                    notes: str = "") -> bool:
        """Write or update a single KPI entry for a period."""
        result = self.sheets.values().get(
            spreadsheetId=self.spreadsheet_id,
            range="ManualEntries!A:J"
        ).execute()

        rows = result.get("values", [])
        headers = rows[0] if rows else self.HEADER_ROW

        existing_row = None
        for i, row in enumerate(rows[1:], start=2):
            row_id = row[0] if row else ""
            row_period = row[3] if len(row) > 3 else ""
            if row_id == kpi_id and row_period == period:
                existing_row = i
                break

        now = datetime.utcnow().isoformat() + "Z"
        new_row = [
            kpi_id, kpi_name, department, period,
            str(value), str(target) if target is not None else "",
            "", updated_by, now, notes
        ]

        if existing_row:
            self.sheets.values().update(
                spreadsheetId=self.spreadsheet_id,
                range=f"ManualEntries!A{existing_row}:J{existing_row}",
                valueInputOption="RAW",
                body={"values": [new_row]}
            ).execute()
        else:
            self.sheets.values().append(
                spreadsheetId=self.spreadsheet_id,
                range="ManualEntries!A:J",
                valueInputOption="RAW",
                insertDataOption="INSERT_ROWS",
                body={"values": [new_row]}
            ).execute()

        return True

    def write_entries_batch(self, entries: list[dict]) -> int:
        """Write multiple entries at once. Each entry dict must have
        kpi_id, kpi_name, department, period, value. Optional: target,
        updated_by, notes."""
        count = 0
        for entry in entries:
            self.write_entry(
                kpi_id=entry["kpi_id"],
                kpi_name=entry.get("kpi_name", ""),
                department=entry.get("department", ""),
                period=entry["period"],
                value=entry["value"],
                target=entry.get("target"),
                updated_by=entry.get("updated_by", ""),
                notes=entry.get("notes", ""),
            )
            count += 1
        return count

    def initialize_sheet(self, kpis_yaml_path: str = None) -> bool:
        """Create the ManualEntries sheet and pre-populate with KPI rows
        for the current month if the sheet is empty."""
        import yaml

        path = Path(kpis_yaml_path) if kpis_yaml_path else CONFIG_DIR / "kpis.yaml"
        if not path.exists():
            logger.error("kpis.yaml not found at %s", path)
            return False

        with open(path) as f:
            catalog = yaml.safe_load(f)

        try:
            self.sheets.values().get(
                spreadsheetId=self.spreadsheet_id,
                range="ManualEntries!A1"
            ).execute()
        except Exception:
            self.sheets.batchUpdate(
                spreadsheetId=self.spreadsheet_id,
                body={"requests": [{"addSheet": {"properties": {"title": "ManualEntries"}}}]}
            ).execute()

        result = self.sheets.values().get(
            spreadsheetId=self.spreadsheet_id,
            range="ManualEntries!A:A"
        ).execute()
        existing = result.get("values", [])

        if len(existing) > 1:
            logger.info("Sheet already has %d rows, skipping initialization", len(existing))
            return True

        now = datetime.utcnow().strftime("%Y-%m")
        rows = [self.HEADER_ROW]

        for dept in catalog.get("departments", []):
            for kpi in dept.get("kpis", []):
                rows.append([
                    kpi["id"], kpi["name"], dept["name"], now,
                    "", "", "", "", "", ""
                ])

        self.sheets.values().update(
            spreadsheetId=self.spreadsheet_id,
            range="ManualEntries!A1",
            valueInputOption="RAW",
            body={"values": rows}
        ).execute()

        logger.info("Initialized ManualEntries sheet with %d KPI rows", len(rows) - 1)
        return True
