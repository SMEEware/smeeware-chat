from __future__ import annotations

from pydantic import BaseModel, Field


class ApiKeyItem(BaseModel):
    id: str
    name: str
    prefix: str
    created_at: str
    last_used_at: str | None = None


class ApiKeyListResponse(BaseModel):
    count: int
    keys: list[ApiKeyItem]


class ApiKeyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=60)


class ApiKeyUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=60)


class ApiKeyCreated(ApiKeyItem):
    secret: str
