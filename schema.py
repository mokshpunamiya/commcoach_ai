"""Shared data schemas — the 'contract' between analysis, graph, and API."""

from pydantic import BaseModel, Field
from typing import Optional


class FillerWordHit(BaseModel):
    word: str
    count: int
    timestamps: list[float] = Field(default_factory=list)


class GrammarIssue(BaseModel):
    message: str
    category: str
    offset: int = 0
    length: int = 0
    suggestion: Optional[str] = None


class PauseInfo(BaseModel):
    start: float
    end: float
    duration: float


class EmotionInfo(BaseModel):
    label: str
    confidence: float


class SessionReport(BaseModel):
    """The single JSON contract between analysis (Person B) and LLM (Person C)."""
    transcript: str = ""
    word_count: int = 0
    duration_seconds: float = 0.0
    words_per_minute: float = 0.0
    pause_count: int = 0
    long_pauses: list[PauseInfo] = Field(default_factory=list)
    filler_words: list[FillerWordHit] = Field(default_factory=list)
    filler_word_count: int = 0
    filler_word_rate: float = 0.0  # per minute
    grammar_issues: list[GrammarIssue] = Field(default_factory=list)
    grammar_issue_count: int = 0
    fluency_score: float = 0.0        # 0-100
    grammar_score: float = 0.0        # 0-100
    pronunciation_score: float = 0.0  # 0-100 (from LLM scorer)
    pace_score: float = 0.0           # 0-100
    filler_score: float = 0.0         # 0-100
    answer_relevancy_score: float = 0.0  # 0-100  (how well answer addresses the question)
    overall_score: float = 0.0        # 0-100
    emotion: Optional[EmotionInfo] = None
    confidence_level: Optional[str] = None  # "low" | "medium" | "high"
    llm_grammar_issues: list[str] = Field(default_factory=list)  # from LLM scorer


class FeedbackResponse(BaseModel):
    feedback: str
    next_question: Optional[str] = None
    session_report: Optional[SessionReport] = None


class StartInterviewRequest(BaseModel):
    user_id: str = "default_user"
    topic: str = "general software engineering"
    resume_text: Optional[str] = None


class AnalyzeRequest(BaseModel):
    user_id: str = "default_user"
    session_id: Optional[str] = None
    interview_topic: Optional[str] = None