"""
Development Entry Point for CommCoach AI.

Runs CI/CD checks (formatting, linting, type checking, security scan, tests) before
starting the development server with live reload.

Usage:
    uv run dev           or    python dev.py
"""

import logging
import subprocess
import sys
from pathlib import Path

# Ensure the project root (where config.py lives) is on sys.path when this
# entry-point is executed as an installed script from src/asignment_project/.
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import uvicorn

from config import API_HOST, API_PORT

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("dev")


def run_check(cmd: list[str], description: str) -> bool:
    logger.info("Running CI/CD step: %s...", description)
    res = subprocess.run(cmd)
    if res.returncode != 0:
        logger.error("CI/CD step failed: %s (exit code %d)", description, res.returncode)
        return False
    return True


def run_cicd() -> bool:
    logger.info("=== Running CI/CD Pipeline ===")
    py = sys.executable

    checks = [
        ([py, "-m", "ruff", "format", "."], "Ruff Format"),
        ([py, "-m", "ruff", "check", "--fix", "."], "Ruff Lint Fix"),
        (
            [
                py,
                "-m",
                "mypy",
                "schema.py",
                "config.py",
                "analysis/",
                "database/",
                "graph/state.py",
                "--ignore-missing-imports",
                "--no-error-summary",
            ],
            "Mypy Type Check",
        ),
        (
            [
                py,
                "-m",
                "bandit",
                "-r",
                ".",
                "--exclude",
                "./.venv,./tests,./frontend",
                "-lll",
                "-iii",
            ],
            "Bandit Security Scan",
        ),
        ([py, "-m", "pytest", "tests/", "--tb=short", "-q"], "Pytest Test Suite"),
    ]

    for cmd, desc in checks:
        if not run_check(cmd, desc):
            return False

    logger.info("=== All CI/CD checks passed successfully! ===")
    return True


def main() -> None:
    if not run_cicd():
        logger.error("CI/CD pipeline failed. Aborting dev server startup.")
        sys.exit(1)

    logger.info("Starting CommCoach AI in Dev mode (reload=True) on %s:%d...", API_HOST, API_PORT)
    uvicorn.run("api.main:app", host=API_HOST, port=API_PORT, reload=True)


if __name__ == "__main__":
    main()
