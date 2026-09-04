"""Ein-/Ausgabe-Modelle des Modell-Katalogs."""

from __future__ import annotations

from pydantic import BaseModel


class ModelInfo(BaseModel):
    id: str
    name: str
    description: str
    group: str
    runtime: str
    reasoning_effort: str | None = None
    gated: bool = False


class ModelListResponse(BaseModel):
    count: int
    default: str
    groups: list[str]
    models: list[ModelInfo]
