"""Ein-/Ausgabe-Modelle des Sprach-Endpunkts."""

from __future__ import annotations

from pydantic import BaseModel


class TtsStatus(BaseModel):
    """Damit das Frontend weiss, ob es das Vorlesen anbieten kann."""

    available: bool
    provider: str
    voice_id: str | None = None
    reason: str | None = None


class TtsModelInfo(BaseModel):
    id: str
    name: str
    description: str
    group: str
    runtime: str


class TtsModelListResponse(BaseModel):
    count: int
    default: str
    groups: list[str]
    models: list[TtsModelInfo]
    default_voice: str
