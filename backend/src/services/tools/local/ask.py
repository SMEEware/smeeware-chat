from __future__ import annotations

from typing import Any

from src.core.logging import get_logger
from src.services.tools.base import ToolError
from src.services.tools.local.base import LocalTool

logger = get_logger(__name__)

MAX_OPTIONS = 4
MIN_OPTIONS = 2
MAX_LENGTH = 120


class AskUserTool(LocalTool):
    name = "ask_user"
    description = (
        "Asks the user a question and offers them ready-made answers to pick "
        "from. Use it when you genuinely cannot proceed without knowing "
        "something: a decision only they can make, a fork where guessing wrong "
        "wastes the work, a missing detail that changes the answer. "
        "Give two options for a yes/no question and three when there is a real "
        "spread of choices -- never pad a yes/no question with an invented "
        "third. Each option must be a complete answer in the user's voice, "
        "short enough to read at a glance, and meaningfully different from the "
        "others. The user can always write their own answer instead. "
        "Do NOT use it to check in, to ask whether you should continue, or to "
        "offer help you could simply give. Asking costs the user a turn; be "
        "sure it buys something. "
        "After calling it, stop. Do not answer your own question, do not guess "
        "ahead, do not keep writing -- end your turn and wait for their reply."
    )
    parameters = {
        "type": "object",
        "properties": {
            "question": {
                "type": "string",
                "description": "The question, in one clear sentence",
            },
            "options": {
                "type": "array",
                "items": {"type": "string"},
                "minItems": MIN_OPTIONS,
                "maxItems": MAX_OPTIONS,
                "description": (
                    "Two to four answers the user can pick with one click. "
                    "Two for yes/no, three for an open choice."
                ),
            },
        },
        "required": ["question", "options"],
    }

    async def run(self, question: str, options: Any = None) -> str:
        cleaned = (question or "").strip()
        if not cleaned:
            raise ToolError("The question is empty.")

        selected = _options(options)

        logger.info("Question to user: %s (%d options)", cleaned[:100], len(selected))

        return (
            "The question and its options are now on screen. "
            "End your turn here: write nothing further, do not answer it "
            "yourself, do not anticipate. The user's reply arrives as their "
            "next message."
        )


def _options(raw: Any) -> list[str]:
    if not isinstance(raw, list):
        raise ToolError("options must be a list of strings.")

    clean: list[str] = []
    for entry in raw:
        if not isinstance(entry, str):
            raise ToolError("Every option must be a string.")
        text = " ".join(entry.split())
        if not text:
            continue
        if len(text) > MAX_LENGTH:
            raise ToolError(
                f"The option {text[:40]!r}... is too long. "
                f"Keep every option under {MAX_LENGTH} characters."
            )
        if text.lower() in {existing.lower() for existing in clean}:
            continue
        clean.append(text)

    if len(clean) < MIN_OPTIONS:
        raise ToolError(
            f"Give at least {MIN_OPTIONS} distinct options -- "
            "a question with one answer is not a question."
        )
    return clean[:MAX_OPTIONS]
