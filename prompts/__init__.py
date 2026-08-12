"""
Prompt loader for CommCoach AI.

All LLM prompts live in this directory as Jinja2 (.j2) templates.
Import `render` or the pre-loaded template objects from here.

Usage
-----
from prompts import render

system_msg = render("feedback_system")
user_msg   = render("feedback_user",
                    session_report_json=report_json,
                    user_profile_summary=profile_summary,
                    current_question=current_q,
                    topic=topic)

Template files
--------------
feedback_system.j2   — system prompt for the coaching feedback node
feedback_user.j2     — user turn for the coaching feedback node
question_system.j2   — system prompt for the interview question generator node
question_user.j2     — user turn for the interview question generator node
grammar_score.j2     — user prompt for the LLM grammar + pronunciation scorer
relevancy_score.j2   — user prompt for the LLM answer relevancy scorer
"""

from __future__ import annotations

from pathlib import Path

from jinja2 import Environment, FileSystemLoader, StrictUndefined

# ── Jinja2 environment ─────────────────────────────────────────────────────
# StrictUndefined raises an error when a variable referenced in the template
# is not passed in the render call, catching missing variables early.
_ENV = Environment(
    loader=FileSystemLoader(str(Path(__file__).parent)),
    undefined=StrictUndefined,
    keep_trailing_newline=True,
    autoescape=False,  # prompts are plain text, not HTML  # noqa: S701
)


def render(template_name: str, **variables: object) -> str:
    """
    Render a prompt template by name (without the .j2 extension).

    Args:
        template_name: Filename stem, e.g. ``"feedback_system"``.
        **variables:   Context variables injected into the template.

    Returns:
        Rendered string with all ``{{ variable }}`` placeholders replaced.

    Raises:
        jinja2.TemplateNotFound:  If the .j2 file does not exist.
        jinja2.UndefinedError:    If the template references a variable
                                  that was not passed.
    """
    template = _ENV.get_template(f"{template_name}.j2")
    return template.render(**variables)


# ── Convenience: pre-loaded template objects ───────────────────────────────
# These are available for callers that want to cache the compiled template
# object rather than re-parsing the file on every call.
FEEDBACK_SYSTEM = _ENV.get_template("feedback_system.j2")
FEEDBACK_USER = _ENV.get_template("feedback_user.j2")
QUESTION_SYSTEM = _ENV.get_template("question_system.j2")
QUESTION_USER = _ENV.get_template("question_user.j2")
GRAMMAR_SCORE = _ENV.get_template("grammar_score.j2")
RELEVANCY_SCORE = _ENV.get_template("relevancy_score.j2")
