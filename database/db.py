"""SQLite database for session history (supplements LangGraph's checkpointer)."""

from __future__ import annotations
import sqlite3
import json
import uuid
from datetime import datetime, timezone
from typing import Optional
from config import DB_PATH


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Create tables if they don't exist."""
    conn = get_conn()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            type TEXT NOT NULL,           -- 'analyze' | 'interview'
            topic TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS turns (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            turn_number INTEGER NOT NULL,
            question TEXT,
            transcript TEXT,
            session_report TEXT,          -- JSON
            feedback TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (session_id) REFERENCES sessions(id)
        );

        CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_turns_session ON turns(session_id);
    """)
    conn.commit()
    conn.close()


def create_session(user_id: str, session_type: str, topic: Optional[str] = None) -> str:
    """Create a new session record and return its ID."""
    session_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    conn = get_conn()
    conn.execute(
        "INSERT INTO sessions (id, user_id, type, topic, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        (session_id, user_id, session_type, topic, now, now),
    )
    conn.commit()
    conn.close()
    return session_id


def save_turn(
    session_id: str,
    turn_number: int,
    question: Optional[str] = None,
    transcript: Optional[str] = None,
    session_report: Optional[dict] = None,
    feedback: Optional[str] = None,
) -> str:
    """Save a single Q&A turn."""
    turn_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    conn = get_conn()
    conn.execute(
        """INSERT INTO turns (id, session_id, turn_number, question, transcript, session_report, feedback, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            turn_id, session_id, turn_number, question, transcript,
            json.dumps(session_report) if session_report else None,
            feedback, now,
        ),
    )
    conn.execute("UPDATE sessions SET updated_at = ? WHERE id = ?", (now, session_id))
    conn.commit()
    conn.close()
    return turn_id


def get_sessions(user_id: str, limit: int = 20) -> list[dict]:
    """Get recent sessions for a user."""
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM sessions WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?",
        (user_id, limit),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_session_turns(session_id: str) -> list[dict]:
    """Get all turns for a session."""
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM turns WHERE session_id = ? ORDER BY turn_number ASC",
        (session_id,),
    ).fetchall()
    conn.close()
    turns = []
    for r in rows:
        t = dict(r)
        if t.get("session_report"):
            try:
                t["session_report"] = json.loads(t["session_report"])
            except (json.JSONDecodeError, TypeError):
                t["session_report"] = {}
        turns.append(t)
    return turns


def reset_user_sessions(user_id: str) -> int:
    """Delete all sessions and turns for a user. Returns the number of sessions deleted."""
    conn = get_conn()
    # Count first so we can report back
    count = conn.execute(
        "SELECT COUNT(*) FROM sessions WHERE user_id = ?", (user_id,)
    ).fetchone()[0]
    # Cascade-delete turns for every session owned by this user
    conn.execute(
        "DELETE FROM turns WHERE session_id IN (SELECT id FROM sessions WHERE user_id = ?)",
        (user_id,),
    )
    conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
    conn.commit()
    conn.close()
    return count


# Initialise on import
init_db()