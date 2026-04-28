"""KPI snapshot store backed by SQLite (WAL mode).

Two tables:
  kpi_snapshot — one row per (source, kpi_key, scope), upserted with the
                 most recent value. Used by the read-fallback path in
                 routes when an upstream API is slow or down.
  kpi_history  — append-only time series. Used by trend chart routes
                 added in Phase 4.

Concurrency: gunicorn workers + the snapshot runner cron all touch the
same file. WAL mode permits concurrent readers + a single writer; lock
duration is microseconds for our row-at-a-time writes.

Connections: opened per call. Per-call overhead is single-digit ms,
matches Flask's per-request lifecycle, and avoids stale-connection
issues when workers are recycled.
"""

import json
import logging
import sqlite3
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

logger = logging.getLogger(__name__)


_SCHEMA = [
    """
    CREATE TABLE IF NOT EXISTS kpi_snapshot (
        source     TEXT NOT NULL,
        kpi_key    TEXT NOT NULL,
        scope      TEXT NOT NULL DEFAULT '',
        payload    TEXT NOT NULL,
        fetched_at TEXT NOT NULL,
        PRIMARY KEY (source, kpi_key, scope)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS kpi_history (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        source     TEXT NOT NULL,
        kpi_key    TEXT NOT NULL,
        scope      TEXT NOT NULL DEFAULT '',
        payload    TEXT NOT NULL,
        fetched_at TEXT NOT NULL
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_history_lookup
    ON kpi_history(source, kpi_key, scope, fetched_at DESC)
    """,
]


class SnapshotStore:
    """Thin SQLite wrapper for KPI snapshots + history."""

    def __init__(self, db_path: Union[str, Path]):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_schema()

    # ── Internal ────────────────────────────────────────────────────────────

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path), timeout=10)
        conn.row_factory = sqlite3.Row
        # WAL is persisted in the file once set, but cheap to re-issue.
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        return conn

    def _init_schema(self) -> None:
        conn = self._connect()
        try:
            with conn:
                for stmt in _SCHEMA:
                    conn.execute(stmt)
        finally:
            conn.close()

    @staticmethod
    def _now_iso() -> str:
        return datetime.now(timezone.utc).isoformat()

    # ── Public API ──────────────────────────────────────────────────────────

    def write(
        self,
        source: str,
        kpi_key: str,
        scope: str,
        payload: Dict[str, Any],
    ) -> str:
        """Upsert into kpi_snapshot AND append to kpi_history. Returns the
        ISO timestamp the row was stamped with."""
        ts = self._now_iso()
        body = json.dumps(payload, default=str)
        conn = self._connect()
        try:
            with conn:
                conn.execute(
                    "INSERT INTO kpi_snapshot (source, kpi_key, scope, payload, fetched_at) "
                    "VALUES (?, ?, ?, ?, ?) "
                    "ON CONFLICT(source, kpi_key, scope) DO UPDATE SET "
                    "payload=excluded.payload, fetched_at=excluded.fetched_at",
                    (source, kpi_key, scope, body, ts),
                )
                conn.execute(
                    "INSERT INTO kpi_history (source, kpi_key, scope, payload, fetched_at) "
                    "VALUES (?, ?, ?, ?, ?)",
                    (source, kpi_key, scope, body, ts),
                )
        finally:
            conn.close()
        return ts

    def latest(
        self, source: str, kpi_key: str, scope: str = ""
    ) -> Optional[Dict[str, Any]]:
        """Return {"payload": dict, "fetched_at": iso} or None if missing."""
        conn = self._connect()
        try:
            row = conn.execute(
                "SELECT payload, fetched_at FROM kpi_snapshot "
                "WHERE source=? AND kpi_key=? AND scope=?",
                (source, kpi_key, scope),
            ).fetchone()
        finally:
            conn.close()
        if not row:
            return None
        return {
            "payload": json.loads(row["payload"]),
            "fetched_at": row["fetched_at"],
        }

    def history(
        self,
        source: str,
        kpi_key: str,
        scope: str = "",
        since: Optional[Union[date, datetime, str]] = None,
    ) -> List[Dict[str, Any]]:
        """Return chronologically-ordered list of {payload, fetched_at}."""
        sql = (
            "SELECT payload, fetched_at FROM kpi_history "
            "WHERE source=? AND kpi_key=? AND scope=?"
        )
        args: List[Any] = [source, kpi_key, scope]
        if since is not None:
            since_str = since.isoformat() if hasattr(since, "isoformat") else str(since)
            sql += " AND fetched_at >= ?"
            args.append(since_str)
        sql += " ORDER BY fetched_at ASC"

        conn = self._connect()
        try:
            rows = conn.execute(sql, args).fetchall()
        finally:
            conn.close()
        return [
            {"payload": json.loads(r["payload"]), "fetched_at": r["fetched_at"]}
            for r in rows
        ]

    def prune(self, days: int = 365) -> int:
        """Drop kpi_history rows older than `days`. Returns rows deleted.

        kpi_snapshot is never pruned — it always reflects the latest value.
        """
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        conn = self._connect()
        try:
            with conn:
                cur = conn.execute(
                    "DELETE FROM kpi_history WHERE fetched_at < ?", (cutoff,)
                )
                deleted = cur.rowcount
        finally:
            conn.close()
        return deleted


def safe_write(
    store: Optional[SnapshotStore],
    source: str,
    kpi_key: str,
    scope: str,
    payload: Dict[str, Any],
) -> None:
    """Write-through helper that swallows DB errors so a snapshot failure
    can never break the live response. Logs a warning instead.

    Routes call this on every successful upstream fetch so the store
    builds up over time without changing user-facing behaviour.
    """
    if store is None:
        return
    try:
        store.write(source, kpi_key, scope, payload)
    except Exception as e:
        logger.warning(
            "snapshot write failed for %s/%s (%s): %s",
            source, kpi_key, scope, e,
        )
