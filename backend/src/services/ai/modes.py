from __future__ import annotations

from typing import Literal

Mode = Literal["chat", "call"]

_CALL = """\
# Live voice call
You are in a live voice call, not a text chat. The user speaks to you and hears your reply read aloud by a voice; they cannot see any text.
- Talk the way a person talks on the phone: natural, clear sentences. Keep it short and to the point unless they ask for detail.
- Never use markdown, headings, bullet points, numbered lists, tables, code blocks, emojis, links, or text in parentheses or brackets.
- Write numbers, units, times, dates and abbreviations the way they are spoken.
- If something only works on screen (code, a long list, a table), say so briefly and offer to put it in the chat instead."""


def system_addition_for(mode: Mode | None) -> str | None:
    return _CALL if mode == "call" else None
