"""Ein-/Ausgabe-Modelle des Transkriptions-Endpunkts."""

from __future__ import annotations

from pydantic import BaseModel


class TranscriptionResponse(BaseModel):
    text: str
    # Was der Dienst selbst erkannt hat -- niemand musste sie vorher waehlen.
    language: str | None = None
    duration_ms: int = 0
    # Welches Modell den Text gemacht hat. Steht in der Antwort, damit die
    # Anzeige sie nicht aus den Einstellungen erraten muss.
    model: str | None = None


class TranscriptionStatus(BaseModel):
    """Damit das Frontend keinen Knopf zeigt, der nur scheitern kann."""

    available: bool
    reason: str | None = None
    model: str | None = None


class SttModelInfo(BaseModel):
    id: str
    name: str
    description: str
    group: str
    # "openai" | "local" -- ob die Aufnahme die Maschine verlaesst.
    runtime: str


class SttModelListResponse(BaseModel):
    count: int
    default: str
    groups: list[str]
    models: list[SttModelInfo]
