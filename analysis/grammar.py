"""Grammar and pronunciation scoring.

LanguageTool requires Java which is not always available. When it is missing
we fall back to an LLM-based scorer that asks Sarvam to rate the transcript.
"""

from __future__ import annotations

import concurrent.futures
import logging
import re
import threading
import time

from prompts import GRAMMAR_SCORE, RELEVANCY_SCORE
from schema import GrammarIssue

logger = logging.getLogger(__name__)


def _llm_call_with_retry(client, messages: list, model: str, temperature: float, call_label: str) -> str:
    """
    Execute a Sarvam LLM chat call with timeout (LLM_TIMEOUT_SECONDS) and
    exponential-backoff retry (up to LLM_MAX_RETRIES attempts).

    Returns the raw response content string.
    Raises RuntimeError when all retries are exhausted.
    """
    from config import LLM_MAX_RETRIES, LLM_RETRY_BASE_DELAY, LLM_TIMEOUT_SECONDS

    def _call():
        return client.chat.completions(
            messages=messages,
            model=model,
            temperature=temperature,
        )

    last_exc: Exception | None = None
    for attempt in range(1, LLM_MAX_RETRIES + 1):
        t0 = time.monotonic()
        try:
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
                future = ex.submit(_call)
                response = future.result(timeout=LLM_TIMEOUT_SECONDS)
            elapsed = round(time.monotonic() - t0, 2)
            logger.info(
                "[LLM_SUCCESS] label=%s attempt=%d elapsed=%.2fs",
                call_label, attempt, elapsed,
            )
            return response.choices[0].message.content or ""
        except concurrent.futures.TimeoutError as exc:
            elapsed = round(time.monotonic() - t0, 2)
            last_exc = RuntimeError(f"Sarvam LLM timed out after {LLM_TIMEOUT_SECONDS}s")
            logger.warning(
                "[LLM_RETRY] label=%s attempt=%d/%d reason=timeout elapsed=%.2fs",
                call_label, attempt, LLM_MAX_RETRIES, elapsed,
            )
        except Exception as exc:
            elapsed = round(time.monotonic() - t0, 2)
            last_exc = exc
            logger.warning(
                "[LLM_RETRY] label=%s attempt=%d/%d reason=%s elapsed=%.2fs",
                call_label, attempt, LLM_MAX_RETRIES, exc, elapsed,
            )
        if attempt < LLM_MAX_RETRIES:
            delay = LLM_RETRY_BASE_DELAY * (2 ** (attempt - 1))
            logger.info("[LLM_RETRY] Waiting %.1fs before attempt %d…", delay, attempt + 1)
            time.sleep(delay)

    raise RuntimeError(
        f"Sarvam LLM ({call_label}) failed after {LLM_MAX_RETRIES} attempts: {last_exc}"
    ) from last_exc

# ─── LanguageTool (Java-based, optional) ────────────────
_tool = None
_tool_unavailable = False
_tool_lock = threading.Lock()


def _get_tool():
    global _tool, _tool_unavailable
    # Fast path — no lock needed for reads after initialisation.
    if _tool_unavailable:
        return None
    if _tool is not None:
        return _tool
    # Slow path — acquire lock so only one thread starts the Java process.
    with _tool_lock:
        if _tool is None and not _tool_unavailable:
            try:
                import language_tool_python

                _tool = language_tool_python.LanguageTool("en-US")
                logger.info("LanguageTool initialised.")
            except Exception as e:
                logger.warning("LanguageTool unavailable (%s) — using LLM-based grammar scorer.", e)
                _tool_unavailable = True
    return _tool


def check_grammar(text: str) -> list[GrammarIssue]:
    """
    Return a list of grammar issues found in *text*.

    Uses LanguageTool when Java is available; otherwise returns an empty list
    (scores are then computed via score_grammar_llm instead).
    """
    if not text.strip():
        return []
    tool = _get_tool()
    if tool is None:
        return []
    try:
        matches = tool.check(text)
    except Exception as e:
        logger.warning("Grammar check failed: %s", e)
        return []
    issues: list[GrammarIssue] = []
    for m in matches:
        suggestion = m.replacements[0] if m.replacements else None
        issues.append(
            GrammarIssue(
                message=m.message,
                category=m.category,
                offset=m.offset,
                length=m.errorLength,
                suggestion=suggestion,
            )
        )
    return issues


def grammar_score(issue_count: int, word_count: int) -> float:
    """
    Score 0-100 based on issue density.
    Only used when LanguageTool is available and returns real issue counts.

    Answers shorter than 10 words are penalised: there is simply not enough
    content for LanguageTool to flag anything meaningful, so a 0-issue result
    on a 3-word answer would otherwise produce a misleadingly perfect 100.
    """
    if word_count == 0:
        return 0.0
    # Short-answer penalty: scale max achievable score by word count / 10,
    # so a 5-word answer can score at most 50, a 10+ word answer is uncapped.
    short_penalty = min(1.0, word_count / 10.0)
    rate = issue_count / word_count
    # 0 issues/word → short_penalty*100, 0.05 → ~50*sp, 0.1+ → near 0
    score = max(0.0, 100.0 * short_penalty * (1.0 - rate * 8.0))
    return round(score, 1)


# ─── LLM-based grammar + pronunciation scorer ───────────


def score_grammar_llm(transcript: str) -> dict:
    """
    Use the Sarvam LLM to score grammar and pronunciation from the transcript text.

    Returns:
        {"grammar": int, "pronunciation": int, "grammar_issues": [str, ...]}

    Falls back to {"grammar": 75, "pronunciation": 75, "grammar_issues": []} on any error.
    """
    words = len(transcript.strip().split()) if transcript else 0
    # Scale fallback score by word count: fewer words → lower fallback.
    # A 3-word "answer" should not receive a 75 grammar score by default.
    fallback_grammar = min(75, max(10, words * 5))
    FALLBACK = {
        "grammar": fallback_grammar,
        "pronunciation": fallback_grammar,
        "grammar_issues": [],
    }

    if not transcript or len(transcript.strip()) < 5:
        return FALLBACK

    try:
        from config import SARVAM_API_KEY, SARVAM_MODEL

        if not SARVAM_API_KEY:
            return FALLBACK

        from sarvamai import SarvamAI
        import json

        client = SarvamAI(api_subscription_key=SARVAM_API_KEY)
        truncated = transcript[:1500]
        messages = [{"role": "user", "content": GRAMMAR_SCORE.render(transcript=truncated)}]

        raw = _llm_call_with_retry(client, messages, SARVAM_MODEL, 0.1, "grammar_score")

        m = re.search(r"\{.*\}", raw, re.DOTALL)
        if not m:
            logger.warning("LLM grammar scorer returned unexpected format: %s", raw[:200])
            return FALLBACK

        data = json.loads(m.group(0))
        grammar_val = max(0, min(100, int(data.get("grammar", 75))))
        pronun_val = max(0, min(100, int(data.get("pronunciation", 75))))
        issues_raw = data.get("grammar_issues", [])
        issues = [str(i) for i in issues_raw if i][:5]

        logger.info(
            "LLM grammar score: grammar=%d, pronunciation=%d, issues=%d",
            grammar_val, pronun_val, len(issues),
        )
        return {"grammar": grammar_val, "pronunciation": pronun_val, "grammar_issues": issues}

    except Exception as e:
        logger.warning("LLM grammar scoring failed: %s", e)
        return FALLBACK


# ─── LLM-based answer relevancy scorer ─────────────────


def score_relevancy_llm(transcript: str, question: str) -> dict:
    """
    Use the Sarvam LLM to score how well *transcript* answers *question*.

    Returns:
        {"relevancy": int}  (0-100)

    Falls back to {"relevancy": 75} on any error or when no question is provided.
    """
    FALLBACK = {"relevancy": 0}

    if not transcript or len(transcript.strip()) < 5:
        return FALLBACK
    if not question or not question.strip():
        return FALLBACK

    try:
        from config import SARVAM_API_KEY, SARVAM_MODEL

        if not SARVAM_API_KEY:
            return FALLBACK

        from sarvamai import SarvamAI
        import json

        client = SarvamAI(api_subscription_key=SARVAM_API_KEY)
        truncated_transcript = transcript[:1500]
        truncated_question = question[:500]

        messages = [
            {
                "role": "user",
                "content": RELEVANCY_SCORE.render(
                    question=truncated_question,
                    transcript=truncated_transcript,
                ),
            }
        ]

        raw = _llm_call_with_retry(client, messages, SARVAM_MODEL, 0.1, "relevancy_score")

        m = re.search(r"\{.*\}", raw, re.DOTALL)
        if not m:
            logger.warning("LLM relevancy scorer returned unexpected format: %s", raw[:200])
            return FALLBACK

        data = json.loads(m.group(0))
        relevancy_val = max(0, min(100, int(data.get("relevancy", 75))))
        logger.info("LLM relevancy score: %d", relevancy_val)
        return {"relevancy": relevancy_val}

    except Exception as e:
        logger.warning("LLM relevancy scoring failed: %s", e)
        return FALLBACK
