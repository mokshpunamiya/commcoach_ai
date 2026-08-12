"""
FastAPI backend for CommCoach AI.

Endpoints:
  POST /analyze              — upload audio, get analysis + feedback
  POST /analyze/stream       — streaming version of /analyze (SSE)
  POST /analyze/text         — analyze a text transcript directly
  POST /interview/start      — start a new mock interview
  POST /interview/answer     — submit an answer (audio or text), get feedback + next question
  GET  /sessions/{user_id}   — list user's past sessions
  GET  /session/{session_id} — get full session with all turns
  GET  /profile/{user_id}    — get user long-term coaching profile
  GET  /health               — health check
  GET  /                     — root
"""

import asyncio
import json
import os
import re
import shutil
import logging
import uuid
from pathlib import Path
from fastapi import FastAPI, Request, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from typing import Optional
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from config import UPLOAD_DIR, API_HOST, API_PORT
from database import db
from graph.graph import (
    analyze_audio_file,
    start_interview,
    continue_interview,
    get_session_history,
)
from graph.memory import retrieve_user_memory

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

# ─── Rate limiter ────────────────────────────────────────
limiter = Limiter(key_func=get_remote_address, default_limits=["200/hour"])

app = FastAPI(title="CommCoach AI", version="1.0.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, lambda req, exc: __import__("fastapi").responses.JSONResponse(
    {"error": "Rate limit exceeded. Please slow down."}, status_code=429
))
app.add_middleware(SlowAPIMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Serve React frontend static files ──────────────────
_FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
_INDEX_HTML = _FRONTEND_DIR / "index.html"
if _INDEX_HTML.exists():
    app.mount("/static", StaticFiles(directory=str(_FRONTEND_DIR)), name="static")


# ─── Models ─────────────────────────────────────────────

class StartInterviewBody(BaseModel):
    user_id: str = "default_user"
    topic: str = "general software engineering"
    resume_text: Optional[str] = None


class AnswerBody(BaseModel):
    session_id: str
    user_id: str = "default_user"
    transcript: Optional[str] = None  # if no audio, use text directly


class TextAnalyzeBody(BaseModel):
    user_id: str = "default_user"
    transcript: str
    interview_topic: Optional[str] = None


# ─── Endpoints ──────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "healthy"}


@app.get("/languages")
def get_languages():
    """
    Return the full language registry from languages.json.
    The frontend uses this to populate the language selector and build
    the client-side filler-word heuristic without hardcoding anything.
    """
    from config import _LANG_REGISTRY
    return {"languages": _LANG_REGISTRY}


@app.get("/")
def root():
    """Serve the React frontend if it exists, otherwise return API info."""
    if _INDEX_HTML.exists():
        return FileResponse(str(_INDEX_HTML))
    return {"service": "CommCoach AI", "status": "running", "version": "1.0.0"}


def _safe_filename(original: str) -> str:
    """Return a collision-free filename using a UUID prefix and the original extension only."""
    suffix = Path(original).suffix.lower() if original else ".bin"
    # Allowlist safe audio/video extensions
    allowed = {".webm", ".wav", ".mp3", ".mp4", ".ogg", ".flac", ".aac", ".opus", ".m4a", ".amr"}
    if suffix not in allowed:
        suffix = ".bin"
    return f"{uuid.uuid4()}{suffix}"


@app.post("/analyze")
@limiter.limit("10/minute")
async def analyze(
    request: Request,
    file: UploadFile = File(...),
    user_id: str = Form("default_user"),
    interview_topic: Optional[str] = Form(None),
):
    """
    Upload an audio file → transcribe → analyze → generate coaching feedback.
    """
    if not file.filename:
        raise HTTPException(400, "No file provided")

    # Save uploaded file with a safe, collision-free name (fixes path traversal)
    safe_name = _safe_filename(file.filename)
    file_path = UPLOAD_DIR / safe_name
    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    logger.info("Saved upload to %s", file_path)

    try:
        # Run the blocking graph call in a thread so the event loop stays free
        result = await asyncio.to_thread(
            analyze_audio_file,
            audio_path=str(file_path),
            user_id=user_id,
            interview_topic=interview_topic,
        )

        # Also save to DB — use the DB-created session_id for turn linkage
        db_session_id = db.create_session(user_id, "analyze", interview_topic)
        report = result.get("session_report")
        db.save_turn(
            session_id=db_session_id,
            turn_number=0,
            transcript=result.get("transcript"),
            session_report=report,
            feedback=result.get("feedback"),
        )

        return _build_analyze_response(db_session_id, result, report)
    except Exception as e:
        logger.error("Analyze endpoint failed: %s", e, exc_info=True)
        raise HTTPException(500, "Analysis failed. Please try again.")
    finally:
        # Always clean up the uploaded file regardless of success or failure
        file_path.unlink(missing_ok=True)


@app.post("/analyze/stream")
@limiter.limit("10/minute")
async def analyze_stream(
    request: Request,
    file: UploadFile = File(...),
    user_id: str = Form("default_user"),
    interview_topic: Optional[str] = Form(None),
):
    """
    Streaming version of /analyze — emits newline-delimited JSON events so the
    client can show live progress instead of waiting for the full response.
    Each event is a JSON object on its own line: {"status": "..."} or the full
    result payload.
    """
    if not file.filename:
        raise HTTPException(400, "No file provided")

    safe_name = _safe_filename(file.filename)
    file_path = UPLOAD_DIR / safe_name
    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    async def _generate():
        try:
            yield json.dumps({"status": "transcribing"}) + "\n"
            result = await asyncio.to_thread(
                analyze_audio_file,
                audio_path=str(file_path),
                user_id=user_id,
                interview_topic=interview_topic,
            )
            yield json.dumps({"status": "saving"}) + "\n"
            db_session_id = db.create_session(user_id, "analyze", interview_topic)
            report = result.get("session_report")
            db.save_turn(
                session_id=db_session_id,
                turn_number=0,
                transcript=result.get("transcript"),
                session_report=report,
                feedback=result.get("feedback"),
            )
            payload = _build_analyze_response(db_session_id, result, report)
            yield json.dumps({"status": "done", **payload}) + "\n"
        except Exception as e:
            logger.error("analyze/stream failed: %s", e, exc_info=True)
            yield json.dumps({"status": "error", "detail": "Analysis failed. Please try again."}) + "\n"
        finally:
            file_path.unlink(missing_ok=True)

    return StreamingResponse(_generate(), media_type="application/x-ndjson")


@app.post("/analyze/text")
@limiter.limit("20/minute")
async def analyze_text(request: Request, body: TextAnalyzeBody):
    """Analyze a text transcript directly (no audio)."""
    try:
        from graph.graph import get_graph
        thread_id = f"analyze-{uuid.uuid4()}"
        graph = get_graph()
        initial_state = {
            "messages": [],
            "user_id": body.user_id,
            "session_id": thread_id,
            "action": "analyze_only",
            "audio_path": None,
            "transcript": body.transcript,
            "duration_seconds": None,
            "session_report": None,
            "feedback": None,
            "current_question": None,
            "interview_topic": body.interview_topic,
            "resume_text": None,
            "turn_count": 0,
            "user_memory": None,
            "error": None,
        }
        config = {"configurable": {"thread_id": thread_id}}
        result = graph.invoke(initial_state, config=config)

        report = result.get("session_report")
        # Save to DB with a proper linked session record
        db_session_id = db.create_session(body.user_id, "analyze", body.interview_topic)
        db.save_turn(
            session_id=db_session_id,
            turn_number=0,
            transcript=body.transcript,
            session_report=report,
            feedback=result.get("feedback"),
        )
        return _build_analyze_response(db_session_id, result, report)
    except Exception as e:
        logger.error("Analyze text endpoint failed: %s", e, exc_info=True)
        raise HTTPException(500, "Analysis failed. Please try again.")


@app.post("/interview/start")
@limiter.limit("20/minute")
async def interview_start(request: Request, body: StartInterviewBody):
    """Start a new mock interview — returns the first question."""
    try:
        result = await asyncio.to_thread(
            start_interview,
            user_id=body.user_id,
            topic=body.topic,
            resume_text=body.resume_text,
        )
        langgraph_session_id = result.get("session_id", "unknown")
        question = result.get("current_question", "")

        # Save to DB — use the DB-created session_id for turn linkage.
        # Return the LangGraph thread_id separately so the client can pass
        # it back to /interview/answer for conversation continuity.
        db_session_id = db.create_session(body.user_id, "interview", body.topic)
        db.save_turn(
            session_id=db_session_id,
            turn_number=0,
            question=question,
        )

        return {
            "session_id": langgraph_session_id,   # used by /interview/answer for LangGraph
            "db_session_id": db_session_id,        # used by frontend for DB turn saves
            "question": question,
            "turn_count": result.get("turn_count", 1),
            "user_profile": _safe_profile(result.get("user_memory")),
        }
    except Exception as e:
        logger.error("Interview start failed: %s", e, exc_info=True)
        raise HTTPException(500, str(e))


@app.post("/interview/answer")
@limiter.limit("20/minute")
async def interview_answer(
    request: Request,
    session_id: str = Form(...),
    user_id: str = Form("default_user"),
    file: Optional[UploadFile] = File(None),
    transcript: Optional[str] = Form(None),
    db_session_id: Optional[str] = Form(None),
):
    """
    Submit an answer to the current interview question.
    Provide either an audio file OR a text transcript.
    Returns: feedback on the answer + next question.
    """
    audio_path = None
    file_path = None
    saved_transcript = transcript

    if file and file.filename:
        # Use a safe, collision-free filename (fixes path traversal)
        safe_name = _safe_filename(file.filename)
        file_path = UPLOAD_DIR / safe_name
        with open(file_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
        audio_path = str(file_path)
        logger.info("Saved answer audio to %s", file_path)

    if not audio_path and not transcript:
        raise HTTPException(400, "Provide either an audio file or a text transcript")

    try:
        # Run the blocking graph call off the event loop
        result = await asyncio.to_thread(
            continue_interview,
            session_id=session_id,
            audio_path=audio_path,
            transcript=saved_transcript,
            user_id=user_id,
        )

        report = result.get("session_report")
        feedback = result.get("feedback", "")
        next_q = result.get("current_question", "")
        turn_count = result.get("turn_count", 0)

        # Save turn to DB — prefer db_session_id (properly linked to sessions table),
        # fall back to langgraph session_id for backward compatibility.
        db.save_turn(
            session_id=db_session_id or session_id,
            turn_number=turn_count,
            question=next_q,
            transcript=result.get("transcript"),
            session_report=report,
            feedback=feedback,
        )

        return {
            "session_id": session_id,
            "transcript": result.get("transcript", ""),
            "session_report": report,
            "feedback": feedback,
            "next_question": next_q,
            "turn_count": turn_count,
            "error": result.get("error"),
        }
    except Exception as e:
        logger.error("Interview answer failed: %s", e, exc_info=True)
        raise HTTPException(500, "Interview processing failed. Please try again.")
    finally:
        # Clean up uploaded audio regardless of success or failure
        if file_path is not None:
            file_path.unlink(missing_ok=True)


@app.get("/sessions/{user_id}")
async def list_sessions(user_id: str):
    """List all sessions for a user, enriched with aggregated scores from turns."""
    sessions = db.get_sessions(user_id)
    enriched = []
    for s in sessions:
        turns = db.get_session_turns(s["id"])
        reports = [
            t["session_report"]
            for t in turns
            if t.get("session_report") and isinstance(t["session_report"], dict)
        ]
        if reports:
            def _avg(key, rpts=reports):
                vals = [r.get(key) or 0 for r in rpts]
                return round(sum(vals) / len(vals)) if vals else 0
            _conf_map = {"low": 40, "medium": 65, "high": 85}
            conf_vals = [_conf_map.get((r.get("confidence_level") or "medium").lower(), 65) for r in reports]
            s = dict(s)
            s["overall"]       = _avg("overall_score")
            s["fluency"]       = _avg("fluency_score")
            s["grammar"]       = _avg("grammar_score")
            s["pronunciation"] = _avg("pronunciation_score")
            s["confidence"]    = round(sum(conf_vals) / len(conf_vals)) if conf_vals else 0
            s["pace"]          = _avg("pace_score")
            s["fillers"]       = _avg("filler_word_count")
        else:
            s = dict(s)
            s["overall"] = s["fluency"] = s["grammar"] = 0
            s["pronunciation"] = s["confidence"] = s["pace"] = s["fillers"] = 0
        enriched.append(s)
    return {"sessions": enriched}


@app.get("/session/{session_id}")
async def get_session_detail(session_id: str):
    """Get full session detail including all turns."""
    turns = db.get_session_turns(session_id)
    graph_state = get_session_history(session_id)
    return {
        "session_id": session_id,
        "turns": turns,
        "graph_state": {
            "messages": [str(m) for m in graph_state.get("messages", [])] if graph_state else [],
            "interview_topic": graph_state.get("interview_topic") if graph_state else None,
            "turn_count": graph_state.get("turn_count") if graph_state else 0,
        } if graph_state else None,
    }


@app.get("/profile/{user_id}")
async def get_user_profile(user_id: str):
    """Get the user's long-term coaching profile."""
    profile = retrieve_user_memory(user_id)
    return {"user_id": user_id, "profile": profile}


@app.delete("/sessions/reset/{user_id}")
async def reset_sessions(user_id: str):
    """Delete all session history for a user. Irreversible."""
    try:
        deleted = db.reset_user_sessions(user_id)
        logger.info("Reset %d session(s) for user '%s'", deleted, user_id)
        return {"deleted_sessions": deleted, "user_id": user_id}
    except Exception as e:
        logger.error("Reset sessions failed: %s", e, exc_info=True)
        raise HTTPException(500, "Could not reset session history")


@app.post("/resume/parse")
async def parse_resume(file: UploadFile = File(...)):
    """
    Parse a resume PDF/TXT and extract text, headline, summary, and skills.
    Used by the React frontend ResumeUpload component.
    """
    try:
        content = await file.read()
        text = ""

        if file.filename and file.filename.lower().endswith(".pdf"):
            try:
                from pypdf import PdfReader
                import io as _io
                reader = PdfReader(_io.BytesIO(content))
                text = "\n".join(page.extract_text() or "" for page in reader.pages).strip()
            except Exception as e:
                logger.warning("PDF parsing failed: %s", e)
                text = content.decode("utf-8", errors="replace")
        else:
            text = content.decode("utf-8", errors="replace")

        # Extract a rough headline (first non-empty line)
        lines = [l.strip() for l in text.splitlines() if l.strip()]
        headline = lines[0][:80] if lines else "Resume uploaded"
        summary = " ".join(lines[1:4])[:200] if len(lines) > 1 else ""

        # Naive skill extraction: look for common tech/soft skill keywords
        SKILL_KEYWORDS = {
            "python","java","javascript","typescript","react","node","sql","nosql",
            "fastapi","django","flask","aws","azure","gcp","docker","kubernetes",
            "machine learning","deep learning","nlp","data analysis","project management",
            "leadership","communication","agile","scrum","git","ci/cd","rest","graphql",
        }
        text_lower = text.lower()
        skills = sorted({s.title() for s in SKILL_KEYWORDS if s in text_lower})[:10]

        return {
            "text": text[:5000],    # cap to avoid huge payloads
            "headline": headline,
            "summary": summary,
            "skills": skills,
            "word_count": len(text.split()),
        }
    except Exception as e:
        logger.error("Resume parse failed: %s", e, exc_info=True)
        raise HTTPException(500, "Could not parse resume")


# ─── Helpers ────────────────────────────────────────────

def _safe_profile(profile: Optional[dict]) -> dict:
    if profile is None:
        return {}
    safe = {k: v for k, v in profile.items() if k != "score_history"}
    safe["score_history_count"] = len(profile.get("score_history", []))
    return safe


def _build_analyze_response(session_id: str, result: dict, report: Optional[dict]) -> dict:
    """
    Build a unified analyze response shaped to match the JSX frontend schema.

    JSX FeedbackPage expects feedback shaped as:
      fluency, grammar, pronunciation, confidence, emotion (str), pace,
      paceNote, wpm, overall, fillers, fillersPerMinute, summary,
      publicSpeaking, coachingPlan
    And transcript as a list of token objects: [{t: str, f: bool}, ...]
    Also includes detected_language (label) and detected_language_confidence (0-100 int).
    """
    # ── Scores from the session_report ──────────────────
    fluency      = round(report.get("fluency_score", 0))            if report else 0
    grammar      = round(report.get("grammar_score", 0))            if report else 0
    pronunciation = round(report.get("pronunciation_score", 0))     if report else 0
    pace_sc      = round(report.get("pace_score", 0))               if report else 0
    filler_sc    = round(report.get("filler_score", 0))             if report else 0
    overall      = round(report.get("overall_score", 0))            if report else 0
    wpm          = round(report.get("words_per_minute", 0))         if report else 0
    fillers      = report.get("filler_word_count", 0)               if report else 0
    duration     = report.get("duration_seconds", 60.0)             if report else 60.0
    fillers_pm   = round(fillers / max(duration / 60.0, 0.01), 1)
    relevancy    = round(report.get("answer_relevancy_score", 0))   if report else 0

    # ── Emotion / confidence ─────────────────────────────
    emotion_info = report.get("emotion") if report else None
    if isinstance(emotion_info, dict):
        emotion_label = emotion_info.get("label", "Neutral").capitalize()
    else:
        emotion_label = "Neutral"

    confidence_label = (report.get("confidence_level") or "medium") if report else "medium"
    confidence_score = {"low": 40, "medium": 65, "high": 85}.get(confidence_label, 65)

    # Public-speaking sub-scores (derived from real metrics) — clamped 0-100
    storytelling        = max(0, min(100, round(fluency * 0.5 + grammar * 0.3 + filler_sc * 0.2)))
    audience_engagement = max(0, min(100, round(confidence_score * 0.4 + pace_sc * 0.3 + filler_sc * 0.3)))
    presentation_flow   = max(0, min(100, round(fluency * 0.4 + pace_sc * 0.4 + filler_sc * 0.2)))

    # ── Pace note ────────────────────────────────────────
    if wpm == 0:
        pace_note = "N/A — text input"
    elif wpm > 160:
        pace_note = f"Slightly fast ({wpm} WPM)"
    elif wpm < 120:
        pace_note = f"Slightly slow ({wpm} WPM)"
    else:
        pace_note = f"Good pace ({wpm} WPM)"

    # ── Summary sentence ─────────────────────────────────
    if overall >= 80:
        summary = "Excellent delivery — polished and confident."
    elif overall >= 65:
        summary = "Solid answer — a little polish on delivery."
    elif overall >= 50:
        summary = "Decent answer with clear areas to improve."
    else:
        summary = "This answer needs work — let's focus on the fundamentals."

    # ── Coaching plan from LLM feedback text + LLM grammar issues ────────
    raw_feedback = result.get("feedback", "")
    report_for_plan = dict(report or {})
    # Inject LLM grammar issues into the report so _parse_coaching_plan can use them
    if report and report.get("llm_grammar_issues"):
        report_for_plan["_llm_grammar_issues"] = report["llm_grammar_issues"]
    coaching_plan = _parse_coaching_plan(raw_feedback, report_for_plan)

    # ── Detected language ────────────────────────────────
    # Map BCP-47 code back to a human-readable label using the language registry.
    from config import _LANG_REGISTRY
    _code_to_label = {lang["code"]: lang["label"] for lang in _LANG_REGISTRY}
    raw_lang_code = result.get("detected_language_code")
    detected_lang_label = _code_to_label.get(raw_lang_code, raw_lang_code) if raw_lang_code else None
    raw_lang_prob = result.get("detected_language_probability")
    detected_lang_confidence = round(raw_lang_prob * 100) if raw_lang_prob is not None else None

    # ── Transcript token list ─────────────────────────────
    filler_set = {fw["word"].lower() for fw in (report.get("filler_words") or [])} if report else set()
    transcript_text = result.get("transcript", "")
    transcript_tokens = _tokenize_transcript(transcript_text, filler_set)

    return {
        "session_id":     session_id,
        "transcript":     transcript_text,
        "transcript_tokens": transcript_tokens,
        "session_report": report,
        "feedback_raw":   raw_feedback,
        "detected_language":            detected_lang_label,
        "detected_language_confidence": detected_lang_confidence,
        "feedback": {
            "fluency":          fluency,
            "grammar":          grammar,
            "pronunciation":    pronunciation,
            "relevancy":        relevancy,
            "confidence":       confidence_score,
            "emotion":          f"{emotion_label} and steady",
            "pace":             pace_sc,
            "paceNote":         pace_note,
            "wpm":              wpm,
            "overall":          overall,
            "fillers":          fillers,
            "fillersPerMinute": fillers_pm,
            "summary":          summary,
            "publicSpeaking": {
                "storytelling":        storytelling,
                "audienceEngagement":  audience_engagement,
                "presentationFlow":    presentation_flow,
            },
            "coachingPlan": coaching_plan,
        },
        "error": result.get("error"),
    }


def _tokenize_transcript(text: str, filler_set: set) -> list:
    """Split transcript into [{t: token, f: is_filler}, ...] tokens."""
    if not text:
        return []
    tokens = []
    # Split on word boundaries, keeping whitespace attached to words
    for word in re.split(r"(\s+)", text):
        if not word:
            continue
        clean = word.strip(".,!?;:\"'").lower()
        tokens.append({"t": word if word.strip() else word, "f": clean in filler_set})
    return tokens


def _parse_coaching_plan(feedback_text: str, report: dict) -> dict:
    """Extract structured coaching plan from the LLM feedback markdown."""
    notes = []
    drills = []

    if feedback_text:
        # Pull bullet/numbered lines from the full feedback text.
        # Handles: "- text", "• text", "* text", "1. text", "**- text**"
        import re
        lines = feedback_text.splitlines()
        for line in lines:
            stripped = line.strip()
            # Skip section headings (## …)
            if stripped.startswith("#"):
                continue
            # Match any common bullet or numbered list marker
            m = re.match(r'^(?:\*{0,2}[-•*]|\d+\.)\s*(.+)', stripped)
            if m:
                note_text = m.group(1).strip()
                # Strip markdown bold: **word**: rest → "word: rest"
                note_text = re.sub(r'\*\*([^*]+)\*\*:?\s*', r'\1: ', note_text)
                # Strip any orphaned ** left by partial bold at start/end
                note_text = note_text.replace("**", "").strip(": ")
                if note_text and len(note_text) > 10:
                    notes.append(note_text)
        notes = notes[:4]  # cap at 4

    # Default drills based on weak metrics
    if report.get("filler_word_count", 0) > 5:
        drills.append({
            "title": "Pause, don't fill",
            "desc": "Practice 5 answers replacing every filler with a 1-second silent pause.",
        })
    if report.get("words_per_minute", 0) > 160:
        drills.append({
            "title": "Slow down at key moments",
            "desc": "Record yourself and aim for 140–160 WPM at emphasis points.",
        })
    if report.get("grammar_issue_count", 0) > 3:
        drills.append({
            "title": "Edit-then-speak",
            "desc": "Write your answer, fix grammar in writing, then speak from memory.",
        })
    if not drills:
        drills.append({
            "title": "Lead with the number",
            "desc": "Rewrite 3 project stories to open with the metric, then the setup.",
        })

    wpm = report.get("words_per_minute", 0)
    if not notes:
        notes = [
            "Focus on reducing filler words — pause instead of filling.",
            "Maintain a steady pace of 120–160 WPM.",
            "Structure answers with Situation → Task → Action → Result.",
        ]

    focus = "Overall communication clarity"
    if report.get("filler_word_count", 0) > 5:
        focus = "Cutting filler words before technical terms"
    elif wpm > 160:
        focus = "Slowing down for impact and clarity"
    elif report.get("grammar_issue_count", 0) > 3:
        focus = "Grammar and sentence structure"

    return {"focusArea": focus, "notes": notes, "drills": drills}


# ─── Entry point ────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api.main:app", host=API_HOST, port=API_PORT, reload=True)