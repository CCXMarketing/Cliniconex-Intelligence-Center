"""Unit tests for SnapshotStore.

Uses a temp file per-test (via pytest's tmp_path fixture) so each case
gets a fresh DB without leaking state.
"""

import json
import sqlite3
import time
from datetime import date, datetime, timedelta, timezone

import pytest

from agents.data_connector.snapshot_store import SnapshotStore, safe_write


@pytest.fixture
def store(tmp_path):
    return SnapshotStore(tmp_path / "test.db")


# ── Basic write + latest ────────────────────────────────────────────────────


def test_init_creates_file_and_schema(tmp_path):
    db = tmp_path / "fresh.db"
    assert not db.exists()
    SnapshotStore(db)
    assert db.exists()
    # Schema is in place — a query against either table should succeed
    conn = sqlite3.connect(str(db))
    try:
        tables = [
            r[0] for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
            ).fetchall()
        ]
    finally:
        conn.close()
    assert "kpi_snapshot" in tables
    assert "kpi_history" in tables


def test_init_creates_parent_directory(tmp_path):
    nested = tmp_path / "deep" / "deeper" / "snapshots.db"
    SnapshotStore(nested)
    assert nested.exists()


def test_write_then_latest_roundtrips_payload(store):
    store.write("jira", "say_do_ratio", "project=DELIVERY,days=90",
                {"ratio": 0.63, "on_time": 46, "total": 73})
    got = store.latest("jira", "say_do_ratio", "project=DELIVERY,days=90")
    assert got is not None
    assert got["payload"] == {"ratio": 0.63, "on_time": 46, "total": 73}
    # fetched_at is an ISO timestamp
    assert "T" in got["fetched_at"]


def test_latest_returns_none_for_unknown_key(store):
    assert store.latest("jira", "nonexistent") is None


def test_latest_returns_most_recent_after_overwrite(store):
    store.write("jira", "say_do_ratio", "", {"ratio": 0.5})
    time.sleep(0.005)  # ensure fetched_at differs
    store.write("jira", "say_do_ratio", "", {"ratio": 0.7})
    got = store.latest("jira", "say_do_ratio")
    assert got["payload"] == {"ratio": 0.7}


# ── History ────────────────────────────────────────────────────────────────


def test_history_returns_all_writes_in_order(store):
    for ratio in [0.50, 0.60, 0.70]:
        store.write("jira", "say_do_ratio", "", {"ratio": ratio})
        time.sleep(0.002)
    rows = store.history("jira", "say_do_ratio")
    assert len(rows) == 3
    assert [r["payload"]["ratio"] for r in rows] == [0.50, 0.60, 0.70]


def test_history_with_since_filter(store):
    store.write("jira", "say_do_ratio", "", {"ratio": 0.5})
    cutoff = datetime.now(timezone.utc).isoformat()
    time.sleep(0.005)
    store.write("jira", "say_do_ratio", "", {"ratio": 0.6})
    rows = store.history("jira", "say_do_ratio", since=cutoff)
    assert len(rows) == 1
    assert rows[0]["payload"]["ratio"] == 0.6


def test_history_accepts_date_object_for_since(store):
    store.write("jira", "say_do_ratio", "", {"ratio": 0.5})
    rows = store.history(
        "jira", "say_do_ratio",
        since=date.today() - timedelta(days=7),
    )
    assert len(rows) == 1


# ── Scope isolation ────────────────────────────────────────────────────────


def test_different_scopes_do_not_collide(store):
    store.write("jira", "say_do_ratio", "project=DELIVERY,days=90", {"ratio": 0.6})
    store.write("jira", "say_do_ratio", "project=DELIVERY,days=30", {"ratio": 0.8})

    deliv_90 = store.latest("jira", "say_do_ratio", "project=DELIVERY,days=90")
    deliv_30 = store.latest("jira", "say_do_ratio", "project=DELIVERY,days=30")
    assert deliv_90["payload"]["ratio"] == 0.6
    assert deliv_30["payload"]["ratio"] == 0.8


def test_different_sources_do_not_collide(store):
    store.write("jira", "x", "", {"v": 1})
    store.write("salesforce", "x", "", {"v": 2})
    assert store.latest("jira", "x")["payload"]["v"] == 1
    assert store.latest("salesforce", "x")["payload"]["v"] == 2


# ── Snapshot vs history semantics ──────────────────────────────────────────


def test_write_appends_to_history_but_upserts_snapshot(store):
    for v in range(5):
        store.write("jira", "k", "", {"v": v})
        time.sleep(0.002)
    # snapshot has 1 row (the last one)
    assert store.latest("jira", "k")["payload"]["v"] == 4
    # history has all 5
    rows = store.history("jira", "k")
    assert [r["payload"]["v"] for r in rows] == [0, 1, 2, 3, 4]


# ── Prune ──────────────────────────────────────────────────────────────────


def test_prune_drops_old_history_keeps_snapshot(store):
    # Insert a fake-old history row by writing then patching fetched_at
    store.write("jira", "k", "", {"v": 1})
    old_ts = (datetime.now(timezone.utc) - timedelta(days=400)).isoformat()
    conn = sqlite3.connect(str(store.db_path))
    try:
        conn.execute("UPDATE kpi_history SET fetched_at = ?", (old_ts,))
        conn.commit()
    finally:
        conn.close()

    # Add a recent row
    store.write("jira", "k", "", {"v": 2})

    deleted = store.prune(days=365)
    assert deleted == 1

    # snapshot still present
    assert store.latest("jira", "k") is not None
    # history has only the recent row
    rows = store.history("jira", "k")
    assert len(rows) == 1
    assert rows[0]["payload"]["v"] == 2


# ── JSON edge cases ────────────────────────────────────────────────────────


def test_payload_with_nested_structures(store):
    payload = {
        "quarters": [
            {"quarter": "Q1 2026", "ratio": 0.44, "total": 9},
            {"quarter": "Q2 2026", "ratio": None, "total": 0},
        ],
        "project_key": "DELIVERY",
    }
    store.write("jira", "by_quarter", "", payload)
    assert store.latest("jira", "by_quarter")["payload"] == payload


def test_payload_with_date_uses_default_str(store):
    """Dates aren't JSON-serializable by default; SnapshotStore uses
    `default=str` so it handles them gracefully."""
    payload = {"window_start": date(2026, 4, 1), "window_end": date(2026, 4, 30)}
    store.write("jira", "x", "", payload)
    got = store.latest("jira", "x")["payload"]
    assert got == {"window_start": "2026-04-01", "window_end": "2026-04-30"}


# ── safe_write helper ─────────────────────────────────────────────────────


def test_safe_write_swallows_db_errors(store, monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("disk full")
    monkeypatch.setattr(store, "write", boom)
    # Should not raise
    safe_write(store, "jira", "x", "", {"v": 1})


def test_safe_write_no_op_when_store_is_none():
    # Should not raise
    safe_write(None, "jira", "x", "", {"v": 1})


def test_safe_write_writes_through_on_success(store):
    safe_write(store, "jira", "y", "", {"v": 42})
    assert store.latest("jira", "y")["payload"] == {"v": 42}
