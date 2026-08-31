"""Womit transkribiert wird -- die Auswahl in den Einstellungen.

Derselbe Aufbau wie der Modellkatalog des Chats, und aus demselben Grund:
``runtime`` sagt, *wer* die Arbeit macht, und das entscheidet, welcher
Dienst die Aufnahme bekommt. "openai" schickt sie an die API, "local"
laesst sie auf der Maschine.

Der lokale Eintrag steht bewusst weiter in der Liste, obwohl OpenAI in
allem schneller und genauer ist: er ist der einzige, bei dem die Aufnahme
den Rechner nicht verlaesst.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from src.core.exceptions import ValidationError

Runtime = Literal["openai", "local"]


@dataclass(frozen=True, slots=True)
class SttEntry:
    id: str
    name: str
    description: str
    runtime: Runtime
    upstream: str
    group: str


CATALOG: tuple[SttEntry, ...] = (
    SttEntry(
        id="gpt-transcribe",
        name="GPT-Transcribe",
        description="Most accurate, and reports the language it heard.",
        runtime="openai",
        upstream="gpt-transcribe",
        group="OpenAI",
    ),
    SttEntry(
        id="gpt-4o-transcribe",
        name="GPT-4o Transcribe",
        description="Solid all-rounder built on GPT-4o.",
        runtime="openai",
        upstream="gpt-4o-transcribe",
        group="OpenAI",
    ),
    SttEntry(
        id="gpt-4o-mini-transcribe",
        name="GPT-4o Mini Transcribe",
        description="Quicker and cheaper — good enough for short dictation.",
        runtime="openai",
        upstream="gpt-4o-mini-transcribe",
        group="OpenAI",
    ),
    SttEntry(
        id="whisper-1",
        name="Whisper v1",
        description="The classic hosted Whisper. Handles timestamps.",
        runtime="openai",
        upstream="whisper-1",
        group="OpenAI",
    ),
    SttEntry(
        id="whisper-local",
        name="Whisper (local)",
        description="Runs through whisper.cpp — the recording never leaves this machine.",
        runtime="local",
        upstream="local",
        group="Local",
    ),
)

DEFAULT_STT = "gpt-transcribe"

GROUPS: tuple[str, ...] = tuple(dict.fromkeys(entry.group for entry in CATALOG))

_BY_ID: dict[str, SttEntry] = {entry.id: entry for entry in CATALOG}


def verfuegbar(*, openai: bool, lokal: bool) -> tuple[SttEntry, ...]:
    """Nur, was gerade wirklich laufen kann -- siehe Chat-Katalog."""
    return tuple(
        entry
        for entry in CATALOG
        if (entry.runtime != "openai" or openai) and (entry.runtime != "local" or lokal)
    )


def resolve(model_id: str | None) -> SttEntry:
    if not model_id:
        return _BY_ID[DEFAULT_STT]
    if (entry := _BY_ID.get(model_id)) is not None:
        return entry
    bekannt = ", ".join(entry.id for entry in CATALOG)
    raise ValidationError(
        f"Unknown transcription model {model_id!r}. Known: {bekannt}."
    )
