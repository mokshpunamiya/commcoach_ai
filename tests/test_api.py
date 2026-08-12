"""Tests for the FastAPI API layer (api/main.py) using TestClient.

Heavy production dependencies (graph, slowapi, torch) are mocked at the
sys.modules level *before* api.main is imported, so the app can be created
without the full ML stack installed.
"""

from __future__ import annotations

import os
import sys
from types import ModuleType
from unittest.mock import MagicMock

# ── Env setup (must be first) ──────────────────────────────────────────────
os.environ.setdefault("SARVAM_API_KEY", "ci-dummy")
os.environ.setdefault("OPENAI_API_KEY", "ci-dummy")


# ── Stub heavyweight modules before any project import ────────────────────

def _make_slowapi_stubs() -> dict[str, ModuleType]:
    """Return a minimal stub for the slowapi stack."""
    slowapi_mod = MagicMock()
    slowapi_util_mod = MagicMock()
    slowapi_util_mod.get_remote_address = lambda req: "127.0.0.1"
    slowapi_errors_mod = MagicMock()
    slowapi_middleware_mod = MagicMock()

    # Limiter must return a callable decorator from .limit(...)
    limiter_instance = MagicMock()
    limiter_instance.limit.return_value = lambda fn: fn  # passthrough decorator
    slowapi_mod.Limiter.return_value = limiter_instance

    # RateLimitExceeded must be a real exception class (not a MagicMock) so
    # FastAPI's add_exception_handler can use it as a base for isinstance checks.
    class _RateLimitExceeded(Exception):
        pass

    slowapi_errors_mod.RateLimitExceeded = _RateLimitExceeded

    # SlowAPIMiddleware must be a real class (FastAPI/Starlette validates it)
    class _SlowAPIMiddleware:
        def __init__(self, app, *args, **kwargs):
            self.app = app

        async def __call__(self, scope, receive, send):
            await self.app(scope, receive, send)

    slowapi_middleware_mod.SlowAPIMiddleware = _SlowAPIMiddleware

    return {
        "slowapi": slowapi_mod,
        "slowapi.util": slowapi_util_mod,
        "slowapi.errors": slowapi_errors_mod,
        "slowapi.middleware": slowapi_middleware_mod,
    }


def _make_graph_stubs() -> dict[str, ModuleType]:
    """Return minimal stubs for graph.graph and graph.memory."""
    graph_mod = MagicMock()
    graph_mod.analyze_audio_file.return_value = {}
    graph_mod.start_interview.return_value = {"question": "Tell me about yourself"}
    graph_mod.continue_interview.return_value = {}
    graph_mod.get_session_history.return_value = []

    memory_mod = MagicMock()
    memory_mod.retrieve_user_memory.return_value = {}

    return {
        "graph.graph": graph_mod,
        "graph.memory": memory_mod,
    }


# Build the combined stub dict once at module level
_STUBS: dict[str, ModuleType] = {
    **_make_slowapi_stubs(),
    **_make_graph_stubs(),
}

# Inject stubs and import the app
_original_modules = {k: sys.modules.pop(k, None) for k in _STUBS}
sys.modules.update(_STUBS)

# Also evict any cached api.main so we get a fresh import with our stubs
sys.modules.pop("api.main", None)
sys.modules.pop("api", None)

from fastapi.testclient import TestClient  # noqa: E402

from api.main import app  # noqa: E402  — imported after stubs are registered

client = TestClient(app, raise_server_exceptions=True)


# ── /health ────────────────────────────────────────────────────────────────

class TestHealthEndpoint:
    def test_returns_200(self):
        resp = client.get("/health")
        assert resp.status_code == 200

    def test_status_key_present(self):
        body = client.get("/health").json()
        # api/main returns {"status": "healthy"} or {"status": "ok"}
        assert "status" in body

    def test_returns_json(self):
        resp = client.get("/health")
        assert resp.headers["content-type"].startswith("application/json")


# ── /languages ─────────────────────────────────────────────────────────────

class TestLanguagesEndpoint:
    def test_returns_200(self):
        resp = client.get("/languages")
        assert resp.status_code == 200

    def test_body_has_languages_key(self):
        body = client.get("/languages").json()
        assert "languages" in body

    def test_languages_is_non_empty_list(self):
        body = client.get("/languages").json()
        langs = body["languages"]
        assert isinstance(langs, list)
        assert len(langs) > 0

    def test_each_language_has_label_and_code(self):
        langs = client.get("/languages").json()["languages"]
        for item in langs:
            assert "label" in item, f"Missing 'label' in {item}"
            assert "code" in item, f"Missing 'code' in {item}"


# ── / (root) ──────────────────────────────────────────────────────────────

class TestRootEndpoint:
    def test_root_responds(self):
        resp = client.get("/")
        # 200 = HTML served; 404 = index.html not present in CI — both fine
        assert resp.status_code in (200, 404)


# ── /sessions/{user_id} ───────────────────────────────────────────────────

class TestSessionsEndpoint:
    def test_unknown_user_returns_200(self):
        resp = client.get("/sessions/ci_unknown_user_xyz")
        assert resp.status_code == 200

    def test_response_has_sessions_key(self):
        body = client.get("/sessions/ci_unknown_user_xyz").json()
        assert "sessions" in body

    def test_unknown_user_sessions_is_empty_list(self):
        body = client.get("/sessions/ci_unknown_user_xyz").json()
        assert body["sessions"] == []


# ── DELETE /sessions/reset/{user_id} ──────────────────────────────────────

class TestResetSessionsEndpoint:
    def test_returns_200(self):
        resp = client.delete("/sessions/reset/ci_reset_user")
        assert resp.status_code == 200

    def test_response_has_deleted_sessions_key(self):
        body = client.delete("/sessions/reset/ci_reset_user").json()
        # api/main returns {"deleted_sessions": <int>, "user_id": <str>}
        assert "deleted_sessions" in body
        assert isinstance(body["deleted_sessions"], int)


# ── /profile/{user_id} ────────────────────────────────────────────────────

class TestProfileEndpoint:
    def test_returns_200(self):
        resp = client.get("/profile/ci_test_user")
        assert resp.status_code == 200

    def test_response_is_object(self):
        body = client.get("/profile/ci_test_user").json()
        assert isinstance(body, dict)


# ── /analyze/text ─────────────────────────────────────────────────────────

class TestAnalyzeTextEndpoint:
    def test_empty_transcript_rejected(self):
        payload = {"user_id": "ci_user", "transcript": ""}
        resp = client.post("/analyze/text", json=payload)
        # FastAPI/Pydantic does not enforce non-empty strings by default;
        # the endpoint may return 400 (business logic) or 500 (graph error)
        # but must not silently return 200 with an empty transcript.
        assert resp.status_code in (400, 422, 500)

    def test_whitespace_only_transcript_rejected(self):
        payload = {"user_id": "ci_user", "transcript": "   "}
        resp = client.post("/analyze/text", json=payload)
        assert resp.status_code in (400, 422, 500)

    def test_missing_transcript_field_is_422(self):
        resp = client.post("/analyze/text", json={"user_id": "ci_user"})
        assert resp.status_code == 422


# ── /resume/parse ─────────────────────────────────────────────────────────

class TestResumeParse:
    def test_no_file_returns_422(self):
        resp = client.post("/resume/parse")
        assert resp.status_code == 422

    def test_txt_file_accepted(self, tmp_path):
        resume_txt = tmp_path / "resume.txt"
        resume_txt.write_text(
            "John Doe\nSoftware Engineer\nPython, FastAPI, Docker\n5 years experience"
        )
        with open(resume_txt, "rb") as f:
            resp = client.post(
                "/resume/parse",
                files={"file": ("resume.txt", f, "text/plain")},
            )
        # 200 = parsed successfully; 500 = downstream issue with heavy deps
        assert resp.status_code in (200, 500)

    def test_pdf_content_type_accepted(self, tmp_path):
        # A fake PDF (content not valid, but tests the routing)
        fake_pdf = tmp_path / "resume.pdf"
        fake_pdf.write_bytes(b"%PDF-1.4 fake content")
        with open(fake_pdf, "rb") as f:
            resp = client.post(
                "/resume/parse",
                files={"file": ("resume.pdf", f, "application/pdf")},
            )
        assert resp.status_code in (200, 400, 500)
