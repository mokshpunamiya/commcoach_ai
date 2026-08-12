"""SQLite database for session history (supplements LangGraph's checkpointer)."""

from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import UTC, datetime

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
            goal TEXT,                    -- user career goal at time of session
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

        CREATE TABLE IF NOT EXISTS user_profiles (
            user_id TEXT PRIMARY KEY,
            goal TEXT NOT NULL DEFAULT 'SDE',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_turns_session ON turns(session_id);

        -- Migration: add goal column to sessions if it doesn't exist yet
        -- (safe no-op if column already present)
    """)

    # Safe column migration for existing DBs
    try:
        conn.execute("SELECT goal FROM sessions LIMIT 1")
    except sqlite3.OperationalError:
        conn.execute("ALTER TABLE sessions ADD COLUMN goal TEXT")

    conn.commit()
    conn.close()


def get_user_goal(user_id: str) -> str:
    """Return the stored career goal for a user, defaulting to 'SDE'."""
    conn = get_conn()
    row = conn.execute(
        "SELECT goal FROM user_profiles WHERE user_id = ?", (user_id,)
    ).fetchone()
    conn.close()
    return row["goal"] if row else "SDE"


def set_user_goal(user_id: str, goal: str) -> None:
    """Upsert the career goal for a user."""
    now = datetime.now(UTC).isoformat()
    conn = get_conn()
    conn.execute(
        """INSERT INTO user_profiles (user_id, goal, created_at, updated_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET goal=excluded.goal, updated_at=excluded.updated_at""",
        (user_id, goal, now, now),
    )
    conn.commit()
    conn.close()


def create_session(
    user_id: str,
    session_type: str,
    topic: str | None = None,
    goal: str | None = None,
) -> str:
    """Create a new session record and return its ID."""
    session_id = str(uuid.uuid4())
    now = datetime.now(UTC).isoformat()
    effective_goal = goal or get_user_goal(user_id)
    conn = get_conn()
    conn.execute(
        "INSERT INTO sessions (id, user_id, type, topic, goal, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (session_id, user_id, session_type, topic, effective_goal, now, now),
    )
    conn.commit()
    conn.close()
    return session_id


def save_turn(
    session_id: str,
    turn_number: int,
    question: str | None = None,
    transcript: str | None = None,
    session_report: dict | None = None,
    feedback: str | None = None,
) -> str:
    """Save a single Q&A turn."""
    turn_id = str(uuid.uuid4())
    now = datetime.now(UTC).isoformat()
    conn = get_conn()
    conn.execute(
        """INSERT INTO turns (id, session_id, turn_number, question, transcript, session_report, feedback, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            turn_id,
            session_id,
            turn_number,
            question,
            transcript,
            json.dumps(session_report) if session_report else None,
            feedback,
            now,
        ),
    )
    conn.execute("UPDATE sessions SET updated_at = ? WHERE id = ?", (now, session_id))
    conn.commit()
    conn.close()
    return turn_id


def get_sessions(user_id: str, limit: int = 30) -> list[dict]:
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


def get_full_session(session_id: str) -> dict | None:
    """Get a session with all its turns (for the history detail view)."""
    conn = get_conn()
    row = conn.execute(
        "SELECT * FROM sessions WHERE id = ?", (session_id,)
    ).fetchone()
    conn.close()
    if not row:
        return None
    session = dict(row)
    session["turns"] = get_session_turns(session_id)
    return session


def reset_user_sessions(user_id: str) -> int:
    """Delete all sessions and turns for a user. Returns the number of sessions deleted."""
    conn = get_conn()
    count = conn.execute("SELECT COUNT(*) FROM sessions WHERE user_id = ?", (user_id,)).fetchone()[
        0
    ]
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
