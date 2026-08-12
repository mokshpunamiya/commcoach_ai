"""LangGraph state definition for the CommCoach coaching engine."""

from __future__ import annotations
from typing import Optional, Annotated, Any
from typing_extensions import TypedDict
from langgraph.graph.message import add_messages
from langchain_core.messages import BaseMessage
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
    audio_path: Optional[str]
    transcript: Optional[str]
    duration_seconds: Optional[float]   # filled by transcribe_node, used by analyze_node
    session_report: Optional[SessionReport]
    detected_language_code: Optional[str]          # BCP-47 code returned by Sarvam STT
    detected_language_probability: Optional[float] # 0.0-1.0 confidence in detected language

    # ── LLM outputs ──
    feedback: Optional[str]
    current_question: Optional[str]

    # ── Interview context ──
    interview_topic: Optional[str]
    resume_text: Optional[str]
    turn_count: int

    # ── Long-term memory (cross-session) ──
    user_memory: Optional[dict[str, Any]]

    # ── Error handling ──
    error: Optional[str]