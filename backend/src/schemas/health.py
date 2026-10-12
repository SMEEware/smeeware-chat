from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    version: str
    environment: str


class ReadinessResponse(HealthResponse):
    provider: str
    provider_reachable: bool
