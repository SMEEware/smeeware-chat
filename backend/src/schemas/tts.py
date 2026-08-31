"""Ein-/Ausgabe-Modelle des Sprach-Endpunkts."""

from __future__ import annotations

from pydantic import BaseModel


class TtsStatus(BaseModel):
    """Damit das Frontend weiss, ob es das Vorlesen anbieten kann."""

    available: bool
    # Spricht gerade ein bezahlter oder der gratis Dienst? "elevenlabs" | "free"
    provider: str
    # Die Vorgabe-Stimme (nur bei ElevenLabs sinnvoll).
    voice_id: str | None = None
    reason: str | None = None


class TtsModelInfo(BaseModel):
    id: str
    name: str
    description: str
    group: str
    # "elevenlabs" | "free" -- ob ein Schluessel dahintersteht.
    runtime: str


class TtsModelListResponse(BaseModel):
    count: int
    default: str
    groups: list[str]
    models: list[TtsModelInfo]
    # Die Vorgabe-Stimme -- das Frontend zeigt sie im Stimmen-Feld als
    # Platzhalter, damit klar ist, was ohne eigene Angabe spricht.
    default_voice: str
