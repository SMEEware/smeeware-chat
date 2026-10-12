from __future__ import annotations

from typing import Annotated

from pydantic import BaseModel, Field


class AccountStatus(BaseModel):
    configured: bool
    username: str | None = None
    has_avatar: bool = False
    authenticated: bool = False


class Credentials(BaseModel):
    username: Annotated[str, Field(min_length=1, max_length=64)]
    password: Annotated[str, Field(min_length=8, max_length=256)]


class Session(BaseModel):
    session_id: str
    username: str


class AccountUpdate(BaseModel):
    username: Annotated[str | None, Field(min_length=1, max_length=64)] = None
    current_password: Annotated[str | None, Field(max_length=256)] = None
    new_password: Annotated[str | None, Field(min_length=8, max_length=256)] = None
