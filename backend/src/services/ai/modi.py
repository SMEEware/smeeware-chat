"""Wie gesprochen wird -- je nach Kanal.

Die Persona (System-Prompt) sagt, WER antwortet. Der Modus sagt, WIE die
Antwort beim Nutzer ankommt: im Chat gelesen, im Telefonat vorgelesen. Was
im Chat gut aussieht -- Listen, Klammern, Tabellen, Code --, klingt vorgelesen
wie ein Stolpern. Deshalb bekommt ein im Telefonat gesprochener Turn einen
Zusatz zum System-Prompt, statt der Persona etwas wegzunehmen.
"""

from __future__ import annotations

from typing import Literal

Modus = Literal["chat", "call"]

_TELEFONAT = """\
# Live voice call
You are in a live voice call, not a text chat. The user speaks to you and hears your reply read aloud by a voice; they cannot see any text.
- Talk the way a person talks on the phone: natural, clear sentences. Keep it short and to the point unless they ask for detail.
- Never use markdown, headings, bullet points, numbered lists, tables, code blocks, emojis, links, or text in parentheses or brackets.
- Write numbers, units, times, dates and abbreviations the way they are spoken.
- If something only works on screen (code, a long list, a table), say so briefly and offer to put it in the chat instead."""


def zusatz_fuer(modus: Modus | None) -> str | None:
    """Der Zusatz zum System-Prompt fuer diesen Modus -- oder keiner."""
    return _TELEFONAT if modus == "call" else None
