from __future__ import annotations

from pydantic import BaseModel, Field


class ModelInfo(BaseModel):
    id: str
    name: str
    description: str
    group: str
    runtime: str
    reasoning_effort: str | None = None
    reasoning_efforts: list[str] = Field(default_factory=list)
    gated: bool = False


class ModelListResponse(BaseModel):
    count: int
    default: str
    groups: list[str]
    models: list[ModelInfo]
