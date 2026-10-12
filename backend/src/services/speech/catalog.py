from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from src.core.exceptions import ValidationError

Runtime = Literal["elevenlabs", "free"]


@dataclass(frozen=True, slots=True)
class TtsEntry:
    id: str
    name: str
    description: str
    runtime: Runtime
    upstream: str
    group: str


CATALOG: tuple[TtsEntry, ...] = (
    TtsEntry(
        id="eleven_multilingual_v2",
        name="Eleven Multilingual v2",
        description="The default — natural in many languages, understands IPA.",
        runtime="elevenlabs",
        upstream="eleven_multilingual_v2",
        group="ElevenLabs",
    ),
    TtsEntry(
        id="eleven_turbo_v2_5",
        name="Eleven Turbo v2.5",
        description="Faster and cheaper, still multilingual — good for long text.",
        runtime="elevenlabs",
        upstream="eleven_turbo_v2_5",
        group="ElevenLabs",
    ),
    TtsEntry(
        id="eleven_flash_v2_5",
        name="Eleven Flash v2.5",
        description="Lowest latency — the one to reach for when speed matters most.",
        runtime="elevenlabs",
        upstream="eleven_flash_v2_5",
        group="ElevenLabs",
    ),
    TtsEntry(
        id="eleven_v3",
        name="Eleven v3",
        description="The most expressive model — dramatic delivery, emotion, range.",
        runtime="elevenlabs",
        upstream="eleven_v3",
        group="ElevenLabs",
    ),
    TtsEntry(
        id="free-google",
        name="Free voice",
        description="No key needed — a plain voice that reads in one language (English by default).",
        runtime="free",
        upstream="free",
        group="Free",
    ),
)

DEFAULT_TTS = "eleven_multilingual_v2"
DEFAULT_FREE = "free-google"

GROUPS: tuple[str, ...] = tuple(dict.fromkeys(entry.group for entry in CATALOG))

_BY_ID: dict[str, TtsEntry] = {entry.id: entry for entry in CATALOG}


def available(*, elevenlabs: bool) -> tuple[TtsEntry, ...]:
    return tuple(
        entry for entry in CATALOG if entry.runtime != "elevenlabs" or elevenlabs
    )


def default_for(*, elevenlabs: bool) -> str:
    return DEFAULT_TTS if elevenlabs else DEFAULT_FREE


def resolve(model_id: str | None, *, elevenlabs: bool) -> TtsEntry:
    if not model_id:
        return _BY_ID[default_for(elevenlabs=elevenlabs)]
    entry = _BY_ID.get(model_id)
    if entry is None:
        known = ", ".join(e.id for e in CATALOG)
        raise ValidationError(f"Unknown speech model {model_id!r}. Known: {known}.")
    if entry.runtime == "elevenlabs" and not elevenlabs:
        return _BY_ID[DEFAULT_FREE]
    return entry
