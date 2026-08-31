from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class ToolSpecResponse(BaseModel):
    name: str
    description: str
    parameters: dict[str, Any]


class ToolListResponse(BaseModel):
    count: int
    tools: list[ToolSpecResponse]
