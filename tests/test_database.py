"""Tests for database.db module using an in-memory/temp SQLite database."""

from __future__ import annotations

import uuid

import pytest


@pytest.fixture(autouse=True)
def _patch_db_path(tmp_path, monkeypatch):
    """Each test gets its own fresh SQLite database."""
    db_file = tmp_path / "test_commcoach.db"
    monkeypatch.setattr("database.db.DB_PATH", db_file)
    # Re-init so the tables exist in the fresh DB
    import database.db as db_module
    monkeypatch.setattr(db_module, "DB_PATH", db_file)
    db_module.init_db()
    yield


import database.db as db  # noqa: E402

# ── init_db ───────────────────────────────────────────────────────────────

class TestInitDb:
    def test_tables_created(self, tmp_path, monkeypatch):
        """init_db should create 'sessions' and 'turns' tables."""
        import database.db as db_module

        db_file = tmp_path / "fresh.db"
        monkeypatch.setattr(db_module, "DB_PATH", db_file)
        db_module.init_db()

        conn = db_module.get_conn()
        tables = {
            row[0]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }
        conn.close()
        assert "sessions" in tables
        assert "turns" in tables

    def test_idempotent(self, tmp_path, monkeypatch):
        """Calling init_db twice should not raise."""
        import database.db as db_module

        db_file = tmp_path / "idem.db"
        monkeypatch.setattr(db_module, "DB_PATH", db_file)
        db_module.init_db()
        db_module.init_db()  # second call — must not raise


# ── create_session ────────────────────────────────────────────────────────

class TestCreateSession:
    def test_returns_uuid_string(self):
        session_id = db.create_session("user1", "analyze")
        # Should be a valid UUID
        uuid.UUID(session_id)

    def test_session_persisted(self):
        session_id = db.create_session("user2", "interview", topic="Python")
        sessions = db.get_sessions("user2")
        assert len(sessions) == 1
        assert sessions[0]["id"] == session_id
        assert sessions[0]["type"] == "interview"
        assert sessions[0]["topic"] == "Python"

    def test_multiple_sessions_per_user(self):
        for _ in range(3):
            db.create_session("user3", "analyze")
        sessions = db.get_sessions("user3")
        assert len(sessions) == 3

    def test_topic_optional(self):
        db.create_session("user4", "analyze")
        sessions = db.get_sessions("user4")
        assert sessions[0]["topic"] is None


# ── save_turn ─────────────────────────────────────────────────────────────

class TestSaveTurn:
    def test_save_basic_turn(self):
        session_id = db.create_session("user5", "analyze")
        turn_id = db.save_turn(session_id, 1, transcript="Hello world")
        uuid.UUID(turn_id)

    def test_save_turn_with_all_fields(self):
        session_id = db.create_session("user6", "interview")
        report = {"overall_score": 82.5, "grammar_score": 90.0}
        db.save_turn(
            session_id,
            turn_number=1,
            question="Tell me about yourself",
            transcript="I am a software engineer",
            session_report=report,
            feedback="Great answer!",
        )
        turns = db.get_session_turns(session_id)
        assert len(turns) == 1
        assert turns[0]["question"] == "Tell me about yourself"
        assert turns[0]["session_report"]["overall_score"] == 82.5
        assert turns[0]["feedback"] == "Great answer!"

    def test_session_report_round_trips_as_dict(self):
        session_id = db.create_session("user7", "analyze")
        report = {"fluency_score": 75.0, "pace_score": 88.0, "nested": {"x": 1}}
        db.save_turn(session_id, 1, session_report=report)
        turns = db.get_session_turns(session_id)
        assert turns[0]["session_report"]["nested"]["x"] == 1

    def test_multiple_turns_ordered(self):
        session_id = db.create_session("user8", "interview")
        db.save_turn(session_id, 1, transcript="First answer")
        db.save_turn(session_id, 2, transcript="Second answer")
        db.save_turn(session_id, 3, transcript="Third answer")
        turns = db.get_session_turns(session_id)
        assert [t["turn_number"] for t in turns] == [1, 2, 3]


# ── get_sessions ──────────────────────────────────────────────────────────

class TestGetSessions:
    def test_empty_for_unknown_user(self):
        sessions = db.get_sessions("ghost_user")
        assert sessions == []

    def test_limit_respected(self):
        for _ in range(5):
            db.create_session("user9", "analyze")
        sessions = db.get_sessions("user9", limit=3)
        assert len(sessions) == 3

    def test_returns_only_own_sessions(self):
        db.create_session("user_a", "analyze")
        db.create_session("user_b", "analyze")
        assert len(db.get_sessions("user_a")) == 1
        assert len(db.get_sessions("user_b")) == 1


# ── reset_user_sessions ───────────────────────────────────────────────────

class TestResetUserSessions:
    def test_deletes_sessions_and_returns_count(self):
        for _ in range(3):
            db.create_session("user_reset", "analyze")
        count = db.reset_user_sessions("user_reset")
        assert count == 3
        assert db.get_sessions("user_reset") == []

    def test_cascades_to_turns(self):
        session_id = db.create_session("user_cascade", "interview")
        db.save_turn(session_id, 1, transcript="Hello")
        db.reset_user_sessions("user_cascade")
        turns = db.get_session_turns(session_id)
        assert turns == []

    def test_reset_nonexistent_user_returns_zero(self):
        count = db.reset_user_sessions("nobody")
        assert count == 0

    def test_does_not_affect_other_users(self):
        db.create_session("user_keep", "analyze")
        db.create_session("user_gone", "analyze")
        db.reset_user_sessions("user_gone")
        assert len(db.get_sessions("user_keep")) == 1
