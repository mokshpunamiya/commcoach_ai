"""LangGraph state definition for the CommCoach coaching engine."""

from __future__ import annotations

from typing import Annotated, Any

from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages
from typing_extensions import TypedDict

from schema import SessionReport


class CoachState(TypedDict):
    """
    Full state for the coaching graph.

    Memory model:
    ──────────────────────────────────────────────
    SHORT-TERM (thread-level, automatic via checkpointer):
      - messages:       conversation history (auto-accumulated by add_messages reducer)
      - session_report: latest analysis results
      - feedback:       latest LLM feedback text
      - current_question: the question the user is answering
      - interview_topic:  the interview's topic
      - turn_count:       how many Q&A turns have happened

    LONG-TERM (cross-session, via InMemoryStore):
      - user_memory:    dict retrieved from the store at session start,
                        containing past scores, identified weak areas,
                        and coaching notes.
    ──────────────────────────────────────────────
    """

    # ── Conversation memory (auto-managed by checkpointer) ──
    messages: Annotated[list[BaseMessage], add_messages]

    # ── Identity ──
    user_id: str
    session_id: str

    # ── Action routing ──
    action: str  # "analyze_only" | "start_interview" | "continue_interview"

    # ── Analysis results ──
    audio_path: str | None
    transcript: str | None
    duration_seconds: float | None  # filled by transcribe_node, used by analyze_node
    session_report: SessionReport | None
    detected_language_code: str | None  # BCP-47 code returned by Sarvam STT
    detected_language_probability: float | None  # 0.0-1.0 confidence in detected language

    # ── LLM outputs ──
    feedback: str | None
    current_question: str | None

    # ── Interview context ──
    interview_topic: str | None
    resume_text: str | None
    turn_count: int
    user_goal: str | None  # career goal: SDE, AI Engineer, Data Scientist, QA, DevOps …

    # ── Long-term memory (cross-session) ──
    user_memory: dict[str, Any] | None

    # ── Error handling ──
    error: str | None
