"""
LangGraph node functions for CommCoach.

Each node takes the CoachState, does its work, and returns a partial
state dict (only the fields it changed).
"""

from __future__ import annotations
import logging
import json
import concurrent.futures
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from schema import SessionReport
from analysis.analyzer import analyze_audio, analyze_transcript_only, analyze_with_transcript
from graph.memory import retrieve_user_memory, update_user_memory
from graph.state import CoachState
from config import SARVAM_API_KEY, SARVAM_MODEL, LLM_PROVIDER, OPENAI_API_KEY, OPENAI_MODEL, OPENAI_BASE_URL
from prompts import FEEDBACK_SYSTEM, FEEDBACK_USER, QUESTION_SYSTEM, QUESTION_USER

logger = logging.getLogger(__name__)

# ─── LLM singleton ──────────────────────────────────────
_sarvam_client = None


def _get_sarvam_client():
    """Lazy-init the Sarvam AI client."""
    global _sarvam_client
    if _sarvam_client is None:
        if not SARVAM_API_KEY:
            raise RuntimeError(
                "SARVAM_API_KEY is not set. "
                "Add it to your .env file: SARVAM_API_KEY=<your-key>"
            )
        from sarvamai import SarvamAI
        _sarvam_client = SarvamAI(api_subscription_key=SARVAM_API_KEY)
        logger.info("Sarvam AI client initialised (model=%s).", SARVAM_MODEL)
    return _sarvam_client


def _sarvam_chat(messages: list) -> str:
    """
    Call Sarvam AI chat completions with LangChain-style message objects.
    Returns the assistant's reply as a plain string.
    """
    client = _get_sarvam_client()

    # Convert LangChain message objects to Sarvam-style dicts
    sarvam_messages = []
    for msg in messages:
        if isinstance(msg, SystemMessage):
            sarvam_messages.append({"role": "system", "content": msg.content})
        elif isinstance(msg, HumanMessage):
            sarvam_messages.append({"role": "user", "content": msg.content})
        elif isinstance(msg, AIMessage):
            sarvam_messages.append({"role": "assistant", "content": msg.content})
        else:
            sarvam_messages.append({"role": "user", "content": str(msg)})

    # Run with a hard 25-second timeout so the graph never hangs indefinitely.
    def _call():
        return client.chat.completions(
            messages=sarvam_messages,
            model=SARVAM_MODEL,
            temperature=0.7,
        )

    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
        future = ex.submit(_call)
        try:
            response = future.result(timeout=25)
        except concurrent.futures.TimeoutError:
            raise RuntimeError("Sarvam LLM call timed out after 25 seconds")
    return response.choices[0].message.content or ""


def get_llm():
    """Kept for compatibility — returns None; use _sarvam_chat() directly."""
    return None


# ════════════════════════════════════════════════════════
#  NODE: Retrieve long-term user memory
# ════════════════════════════════════════════════════════

def retrieve_memory_node(state: CoachState) -> dict:
    """Pull the user's long-term coaching profile from the store."""
    user_id = state.get("user_id", "default_user")
    profile = retrieve_user_memory(user_id)
    logger.info("Retrieved long-term memory for '%s': %d past sessions, trend=%s",
                user_id, profile.get("total_sessions", 0), profile.get("trend", "new"))
    return {"user_memory": profile}


# ════════════════════════════════════════════════════════
#  NODE: Transcribe audio
# ════════════════════════════════════════════════════════

def transcribe_node(state: CoachState) -> dict:
    """Call Sarvam STT on the audio file and store the transcript + duration.

    If no audio_path is present but the state already contains a transcript
    (e.g. the frontend sent text directly via /interview/answer), we skip STT
    and keep the existing transcript so downstream nodes can still run.
    """
    audio_path = state.get("audio_path")
    existing_transcript = state.get("transcript") or ""

    if not audio_path:
        if existing_transcript.strip():
            # Text-only path: nothing to transcribe, keep what we have.
            return {"error": None}
        return {"error": "No audio_path provided for transcription.", "transcript": "", "duration_seconds": 0.0}

    try:
        from analysis.transcriber import transcribe
        result = transcribe(audio_path)
        return {
            "transcript": result["text"],
            "duration_seconds": result["duration_seconds"],
            "detected_language_code": result.get("language_code"),
            "detected_language_probability": result.get("language_probability"),
            "error": None,
        }
    except Exception as e:
        logger.error("Transcription failed: %s", e)
        # If we already have a transcript, don't clobber it — just mark the error.
        return {
            "error": f"Transcription failed: {e}",
            "transcript": existing_transcript or "",
            "duration_seconds": 0.0,
        }


# ════════════════════════════════════════════════════════
#  NODE: Analyse transcript + audio
# ════════════════════════════════════════════════════════

def analyze_node(state: CoachState) -> dict:
    """Run analysis pipeline using the transcript already in state (no re-transcription)."""
    audio_path = state.get("audio_path")
    transcript = state.get("transcript") or ""
    duration = state.get("duration_seconds") or 0.0
    question = state.get("current_question") or state.get("interview_topic") or ""

    try:
        if audio_path and transcript:
            # Transcript already obtained by transcribe_node — just run the analysis steps
            report = analyze_with_transcript(
                transcript=transcript,
                audio_path=audio_path,
                duration_seconds=duration,
                question=question,
            )
        elif transcript:
            # Text-only path (no audio file)
            report = analyze_transcript_only(transcript, question=question)
        elif audio_path:
            # Fallback: audio present but transcription step was skipped (shouldn't happen)
            report = analyze_audio(audio_path, question=question)
        else:
            return {"error": "Nothing to analyse — no audio or transcript.", "session_report": None}

        # Convert pydantic model to dict for state storage
        return {
            "session_report": report.model_dump() if hasattr(report, "model_dump") else report.dict(),
            "error": None,
        }
    except Exception as e:
        logger.error("Analysis failed: %s", e)
        return {"error": f"Analysis failed: {e}", "session_report": None}


# ════════════════════════════════════════════════════════
#  NODE: Generate coaching feedback
# ════════════════════════════════════════════════════════

def generate_feedback_node(state: CoachState) -> dict:
    """Use the LLM to generate coaching feedback from the session report."""
    report = state.get("session_report")
    if not report:
        return {"feedback": "No analysis available to generate feedback.", "error": "Missing session_report"}

    user_memory = state.get("user_memory", {})
    profile_summary = _summarize_user_profile(user_memory)

    current_q = state.get("current_question", "N/A")
    topic = state.get("interview_topic", "general")

    report_json = json.dumps(report, indent=2, default=str)

    messages = [
        SystemMessage(content=FEEDBACK_SYSTEM.render()),
        HumanMessage(content=FEEDBACK_USER.render(
            session_report_json=report_json,
            user_profile_summary=profile_summary,
            current_question=current_q,
            topic=topic,
        )),
    ]

    try:
        feedback_text = _sarvam_chat(messages)
    except Exception as e:
        logger.error("LLM feedback generation failed: %s", e)
        feedback_text = _fallback_feedback(report)

    # Also store in conversation messages for memory
    return {
        "feedback": feedback_text,
        "messages": [
            AIMessage(content=f"[Coach Feedback]\n{feedback_text}")
        ],
    }


def _summarize_user_profile(profile: dict) -> str:
    if not profile or profile.get("total_sessions", 0) == 0:
        return "New user — no previous sessions."

    parts = [
        f"Total sessions: {profile.get('total_sessions', 0)}",
        f"Trend: {profile.get('trend', 'unknown')}",
        f"Weak areas: {', '.join(profile.get('weak_areas', [])) or 'none identified yet'}",
    ]
    history = profile.get("score_history", [])
    if history:
        last = history[-1]
        parts.append(f"Last overall score: {last.get('overall_score', 'N/A')}")
    return " | ".join(parts)


def _fallback_feedback(report: dict) -> str:
    """Generate simple rule-based feedback if the LLM is unavailable."""
    lines = ["## 📊 Overall Assessment", ""]
    overall = report.get("overall_score", 0)
    if overall >= 75:
        lines.append("Strong answer overall — you're communicating effectively.")
    elif overall >= 50:
        lines.append("Decent answer with some areas to refine.")
    else:
        lines.append("This answer needs work — let's focus on the fundamentals.")

    lines.append("\n## 🔧 Areas to Improve")
    relevancy = report.get("answer_relevancy_score", 0)
    if relevancy < 50:
        lines.append(f"- Your answer scored low on relevancy ({relevancy:.0f}/100) — make sure you address the question directly.")
    elif relevancy < 70:
        lines.append(f"- Your answer was partially relevant ({relevancy:.0f}/100) — try to stay more focused on what was asked.")

    wpm = report.get("words_per_minute", 0)
    if wpm > 160:
        lines.append(f"- Your pace is slightly fast at {wpm:.0f} WPM — aim for 140-160.")
    elif wpm < 100 and wpm > 0:
        lines.append(f"- Your pace is slow at {wpm:.0f} WPM — aim for 140-160 WPM.")

    fc = report.get("filler_word_count", 0)
    if fc > 5:
        lines.append(f"- Reduce filler words (found {fc}). Practice pausing instead of saying 'um'.")

    gi = report.get("grammar_issue_count", 0)
    if gi > 2:
        lines.append(f"- Watch grammar ({gi} issues detected). Review your sentences before speaking.")

    return "\n".join(lines)


# ════════════════════════════════════════════════════════
#  NODE: Generate next interview question
# ════════════════════════════════════════════════════════

def generate_question_node(state: CoachState) -> dict:
    """Generate the next interview question using the LLM."""
    user_memory = state.get("user_memory", {})
    profile_summary = _summarize_user_profile(user_memory)
    topic = state.get("interview_topic", "general software engineering")
    turn_count = state.get("turn_count", 0)
    resume = state.get("resume_text", "Not provided")

    # Build conversation summary from messages
    conversation_summary = _build_conversation_summary(state.get("messages", []))

    # Summarize previous answer analysis
    report = state.get("session_report")
    prev_analysis = "N/A"
    if report:
        prev_analysis = (
            f"Overall score: {report.get('overall_score', 'N/A')}/100, "
            f"Answer relevancy: {report.get('answer_relevancy_score', 'N/A')}/100, "
            f"Fluency: {report.get('fluency_score', 'N/A')}, "
            f"Grammar: {report.get('grammar_score', 'N/A')}, "
            f"Pace: {report.get('words_per_minute', 'N/A')} WPM, "
            f"Fillers: {report.get('filler_word_count', 'N/A')}"
        )

    messages = [
        SystemMessage(content=QUESTION_SYSTEM.render()),
        HumanMessage(content=QUESTION_USER.render(
            topic=topic,
            turn_count=turn_count,
            resume=resume[:2000] if resume else "Not provided",
            profile_summary=profile_summary,
            conversation_summary=conversation_summary,
            prev_analysis_summary=prev_analysis,
        )),
    ]

    try:
        question = _sarvam_chat(messages).strip()
    except Exception as e:
        logger.error("Question generation failed: %s", e)
        question = _fallback_question(topic, turn_count)

    return {
        "current_question": question,
        "turn_count": turn_count + 1,
        "messages": [
            AIMessage(content=f"[Interviewer Question]\n{question}")
        ],
    }


def _build_conversation_summary(messages: list) -> str:
    """Build a text summary of the conversation so far."""
    if not messages:
        return "No conversation yet."
    parts = []
    for msg in messages[-10:]:  # last 10 messages
        role = getattr(msg, "type", "unknown")
        content = msg.content if isinstance(msg.content, str) else str(msg.content)
        # Truncate long messages
        if len(content) > 300:
            content = content[:300] + "…"
        parts.append(f"{role}: {content}")
    return "\n".join(parts)


def _fallback_question(topic: str, turn: int) -> str:
    """Generic fallback questions if the LLM fails."""
    questions = [
        f"Tell me about your experience with {topic}.",
        f"What's a challenging problem you've faced related to {topic}?",
        f"How do you stay current with developments in {topic}?",
        f"Describe a project where you applied {topic} skills.",
        f"What are your career goals and how does {topic} fit into them?",
    ]
    return questions[turn % len(questions)]


# ════════════════════════════════════════════════════════
#  NODE: Update long-term user memory
# ════════════════════════════════════════════════════════

def update_memory_node(state: CoachState) -> dict | None:
    """Persist this session's results to the user's long-term profile."""
    user_id = state.get("user_id", "default_user")
    report = state.get("session_report")
    feedback = state.get("feedback", "")

    if report:
        updated_profile = update_user_memory(user_id, report, feedback)
        return {"user_memory": updated_profile}
    # Return None (not {}) — LangGraph treats None as "no update", but an
    # empty dict {} raises InvalidUpdateError because no state key is touched.
    return None


# ════════════════════════════════════════════════════════
#  ROUTING FUNCTION
# ════════════════════════════════════════════════════════

def route_action(state: CoachState) -> str:
    """Route to the correct sub-graph based on the action field."""
    action = state.get("action", "analyze_only")
    return action