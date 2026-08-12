"""
Production Entry Point for CommCoach AI.

Execution is fast without pre-run CI/CD checks.

Usage:
    uv run prod          or    python prod.py
"""

import logging
import uvicorn
from config import API_HOST, API_PORT

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("prod")


def main() -> None:
    logger.info("Starting CommCoach AI in Production mode on %s:%d...", API_HOST, API_PORT)
    uvicorn.run("api.main:app", host=API_HOST, port=API_PORT, reload=False)


if __name__ == "__main__":
    main()
