"""
Memory setup for LangGraph.

Two layers:
  1. Checkpointer (SqliteSaver) — persists full graph state per thread.
     Each thread_id = one interview session.
     This gives us automatic multi-turn conversation memory.

  2. Store (SqliteProfileStore) — cross-session long-term user memory,
     backed by a SQLite table in commcoach.db so profiles survive server
     restarts.
     Namespace: ("user_profile", user_id)
     Stores: past scores, improvement areas, coaching notes, question history.
     This lets the coach remember the user across sessions.
"""

from __future__ import annotations
import json
import logging
import sqlite3
import threading
from datetime import datetime, timezone
from langgraph.checkpoint.sqlite import SqliteSaver
from config import CHECKPOINT_DB_PATH, DB_PATH

logger = logging.getLogger(__name__)

# ─── Checkpointer: thread-level memory ──────────────────
# SqliteSaver persists state to disk so sessions survive restarts.
# We open the sqlite3 connection directly (not via the context-manager
# helper from_conn_string) so the connection stays open for the lifetime
# of the process and LangGraph can call get_next_version on it.
_checkpointer: SqliteSaver | None = None
_conn: sqlite3.Connection | None = None


def get_checkpointer() -> SqliteSaver:
    global _checkpointer, _conn
    if _checkpointer is None:
        _conn = sqlite3.connect(str(CHECKPOINT_DB_PATH), check_same_thread=False)
        _checkpointer = SqliteSaver(_conn)
        logger.info("SqliteSaver checkpointer initialised at %s", CHECKPOINT_DB_PATH)
    return _checkpointer


# ─── SQLite-backed profile store ────────────────────────

class SqliteProfileStore:
    """
    Minimal key-value store for long-term user profiles backed by SQLite.

    The interface mirrors the parts of langgraph.store.memory.InMemoryStore
    that the codebase uses (get / put).  Profiles are stored as JSON blobs in
    a *profiles* table inside commcoach.db so they survive server restarts.
    """

    def __init__(self, db_path: str) -> None:
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._lock = threading.Lock()
        self._conn.execute(
            """
            CREATE TABLE IF NOT EXISTS profiles (
                namespace TEXT NOT NULL,
                key       TEXT NOT NULL,
                value     TEXT NOT NULL,
                PRIMARY KEY (namespace, key)
            )
            """
        )
        self._conn.commit()
        logger.info("SqliteProfileStore initialised at %s", db_path)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def get(self, namespace: tuple, key: str):
        """Return a item-like object with a .value attribute, or None."""
        ns = str(namespace)
        with self._lock:
            row = self._conn.execute(
                "SELECT value FROM profiles WHERE namespace = ? AND key = ?",
                (ns, key),
            ).fetchone()
        if row is None:
            return None

        class _Item:
            value = json.loads(row[0])

        return _Item()

    def put(self, namespace: tuple, key: str, value: dict) -> None:
        """Upsert a profile value."""
        ns = str(namespace)
        with self._lock:
            self._conn.execute(
                "INSERT OR REPLACE INTO profiles (namespace, key, value) VALUES (?, ?, ?)",
                (ns, key, json.dumps(value, default=str)),
            )
            self._conn.commit()


# ─── Store: long-term cross-session memory ──────────────
_store: SqliteProfileStore | None = None


def get_store() -> SqliteProfileStore:
    global _store
    if _store is None:
        _store = SqliteProfileStore(str(DB_PATH))
        logger.info("SqliteProfileStore initialised for long-term user memory.")
    return _store


# ─── Helper functions for long-term memory ──────────────

def _user_namespace(user_id: str) -> tuple[str, str]:
    return ("user_profile", user_id)


def retrieve_user_memory(user_id: str) -> dict:
    """Retrieve the user's long-term coaching profile from the store."""
    store = get_store()
    ns = _user_namespace(user_id)
    item = store.get(ns, "profile")
    if item is None:
        return _default_profile()
    return item.value


def update_user_memory(user_id: str, session_report: dict, feedback: str) -> dict:
    """
    Update the user's long-term profile with data from the latest session.

    Tracks:
      - score history (last 20 sessions)
      - identified weak areas
      - total sessions
      - last seen timestamp
    """
    store = get_store()
    ns = _user_namespace(user_id)
    item = store.get(ns, "profile")
    profile = item.value if item else _default_profile()

    # Append score history
    score_entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "overall_score": session_report.get("overall_score", 0),
        "fluency_score": session_report.get("fluency_score", 0),
        "grammar_score": session_report.get("grammar_score", 0),
        "pace_score": session_report.get("pace_score", 0),
        "filler_score": session_report.get("filler_score", 0),
    }
    profile["score_history"].append(score_entry)
    # Keep only the last 20
    profile["score_history"] = profile["score_history"][-20:]

    # Update weak areas
    weak = set(profile.get("weak_areas", []))
    if session_report.get("fluency_score", 100) < 70:
        weak.add("fluency")
    if session_report.get("grammar_score", 100) < 70:
        weak.add("grammar")
    if session_report.get("pace_score", 100) < 70:
        weak.add("pace")
    if session_report.get("filler_score", 100) < 70:
        weak.add("filler_words")
    profile["weak_areas"] = sorted(weak)

    # Update counts and timestamps
    profile["total_sessions"] = profile.get("total_sessions", 0) + 1
    profile["last_session"] = datetime.now(timezone.utc).isoformat()
    profile["latest_feedback"] = feedback[:500] if feedback else ""

    # Compute trend
    if len(profile["score_history"]) >= 2:
        recent = profile["score_history"][-5:]
        avg_recent = sum(s["overall_score"] for s in recent) / len(recent)
        older = profile["score_history"][:-5] if len(profile["score_history"]) > 5 else profile["score_history"][:-1]
        avg_older = sum(s["overall_score"] for s in older) / len(older) if older else avg_recent
        if avg_recent > avg_older + 2:
            profile["trend"] = "improving"
        elif avg_recent < avg_older - 2:
            profile["trend"] = "declining"
        else:
            profile["trend"] = "stable"

    store.put(ns, "profile", profile)
    logger.info("Updated long-term memory for user '%s' (session #%d)", user_id, profile["total_sessions"])
    return profile


def _default_profile() -> dict:
    return {
        "score_history": [],
        "weak_areas": [],
        "total_sessions": 0,
        "first_session": datetime.now(timezone.utc).isoformat(),
        "last_session": None,
        "trend": "new",
        "latest_feedback": "",
        "notes": "",
    }
