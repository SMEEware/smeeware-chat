"""Ein-/Ausgabe-Modelle des Transkriptions-Endpunkts."""

from __future__ import annotations

from pydantic import BaseModel


class TranscriptionResponse(BaseModel):
    text: str
    language: str | None = None
    duration_ms: int = 0
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
    runtime: str


class SttModelListResponse(BaseModel):
    count: int
    default: str
    groups: list[str]
    models: list[SttModelInfo]
