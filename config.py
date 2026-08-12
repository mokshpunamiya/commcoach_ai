"""Central configuration for CommCoach AI."""

import json
import os
from pathlib import Path

# Load .env file before any os.getenv() calls.
# python-dotenv is already installed (dotenv package in .venv).
try:
    from dotenv import load_dotenv

    load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env", override=False)
except ImportError:
    pass  # dotenv not installed — fall back to plain environment variables

# ─── Paths ──────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)
DB_PATH = BASE_DIR / "commcoach.db"
CHECKPOINT_DB_PATH = BASE_DIR / "checkpoints.db"

# ─── Sarvam AI ──────────────────────────────────────────
SARVAM_API_KEY = os.getenv("SARVAM_API_KEY", "")
SARVAM_MODEL = os.getenv(
    "SARVAM_MODEL", "sarvam-105b"
)  # Chat model (sarvam-105b or sarvam-105b-conversations)
SARVAM_STT_MODEL = os.getenv(
    "SARVAM_STT_MODEL", "saaras:v3"
)  # STT model (v3/v4/saarika:v2.5/saarika:flash)

# ─── LLM (kept for backward compatibility) ──────────────
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "sarvam")  # "sarvam" | "openai"
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", None)  # set if using a proxy

# ─── Whisper (kept as fallback) ─────────────────────────
WHISPER_MODEL_SIZE = os.getenv("WHISPER_MODEL_SIZE", "base")  # tiny|base|small|medium
WHISPER_DEVICE = os.getenv("WHISPER_DEVICE", "cpu")  # cpu|cuda
WHISPER_COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8")

# ─── Analysis thresholds ────────────────────────────────
IDEAL_WPM_MIN = 120
IDEAL_WPM_MAX = 160
PAUSE_THRESHOLD_SEC = 0.5  # silences longer than this count as pauses
LONG_PAUSE_THRESHOLD_SEC = 1.5  # silences longer than this are "long pauses"

# ─── Language + filler-word registry (single source of truth) ───────
_LANG_REGISTRY_PATH = BASE_DIR / "languages.json"
with open(_LANG_REGISTRY_PATH, encoding="utf-8") as _f:
    _LANG_REGISTRY: list[dict] = json.load(_f)["languages"]

# Ordered list of display labels for the UI (e.g. ["English", "Hindi", …])
SUPPORTED_LANGUAGES: list[str] = [lang["label"] for lang in _LANG_REGISTRY]

# Map from display label → BCP-47 code for the Sarvam STT API
LANGUAGE_CODES: dict[str, str] = {lang["label"]: lang["code"] for lang in _LANG_REGISTRY}

# Union of ALL filler words across every language — used when language is unknown
FILLER_WORDS: set[str] = {filler for lang in _LANG_REGISTRY for filler in lang["fillers"]}

# Per-language filler sets — use when the transcript language is known
FILLER_WORDS_BY_LANGUAGE: dict[str, set[str]] = {
    lang["label"]: set(lang["fillers"]) for lang in _LANG_REGISTRY
}

# ─── Server ─────────────────────────────────────────────
API_HOST = os.getenv("API_HOST", "127.0.0.1")
API_PORT = int(os.getenv("API_PORT", "8000"))
