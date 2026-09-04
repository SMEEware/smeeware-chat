"""Womit vorgelesen wird -- die Auswahl in den Einstellungen.

Derselbe Aufbau wie der Chat- und der Transkriptions-Katalog: ``runtime``
sagt, *wer* spricht. "elevenlabs" braucht einen Schluessel; "free" laeuft ohne
und ist der Rueckfall.

Der gratis Eintrag steht bewusst mit in der Liste, obwohl ElevenLabs in allem
natuerlicher klingt: er ist der einzige, der ohne Anmeldung spricht -- und
damit das, was ein Nutzer ohne Schluessel bekommt.
"""

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
        description="No key needed — a plain fallback voice. Add a key for the good ones.",
        runtime="free",
        upstream="free",
        group="Free",
    ),
)

DEFAULT_TTS = "eleven_multilingual_v2"
DEFAULT_FREE = "free-google"

GROUPS: tuple[str, ...] = tuple(dict.fromkeys(entry.group for entry in CATALOG))

_BY_ID: dict[str, TtsEntry] = {entry.id: entry for entry in CATALOG}


def verfuegbar(*, elevenlabs: bool) -> tuple[TtsEntry, ...]:
    """Nur, was gerade wirklich sprechen kann.

    Ohne ElevenLabs-Schluessel bleibt der gratis Eintrag -- die Liste ist nie
    leer, sonst haette der Nutzer eine Auswahl ohne Wahl.
    """
    return tuple(
        entry for entry in CATALOG if entry.runtime != "elevenlabs" or elevenlabs
    )


def default_for(*, elevenlabs: bool) -> str:
    """Welcher Eintrag die Vorgabe ist -- haengt am Schluessel."""
    return DEFAULT_TTS if elevenlabs else DEFAULT_FREE


def resolve(model_id: str | None, *, elevenlabs: bool) -> TtsEntry:
    """Einen Modellnamen aufloesen -- oder auf die passende Vorgabe fallen.

    Ohne Schluessel wird ein gewuenschtes ElevenLabs-Modell still zum gratis
    Rueckfall: der Nutzer hat einmal eine Stimme gewaehlt, die es hier gerade
    nicht gibt, und soll deshalb nicht ohne Sprache dastehen.
    """
    if not model_id:
        return _BY_ID[default_for(elevenlabs=elevenlabs)]
    entry = _BY_ID.get(model_id)
    if entry is None:
        bekannt = ", ".join(e.id for e in CATALOG)
        raise ValidationError(f"Unknown speech model {model_id!r}. Known: {bekannt}.")
    if entry.runtime == "elevenlabs" and not elevenlabs:
        return _BY_ID[DEFAULT_FREE]
    return entry
