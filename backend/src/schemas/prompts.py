from __future__ import annotations

from typing import Annotated

from pydantic import BaseModel, Field


class PromptSummary(BaseModel):
    name: str
    title: str
    variables: list[str]
    length: int


class PromptListResponse(BaseModel):
    count: int
    default: str
    prompts: list[PromptSummary]


class PromptDetail(PromptSummary):
    text: str


class PromptWrite(BaseModel):
    """Anlegen oder ueberschreiben."""

    name: Annotated[str, Field(min_length=1, max_length=64)]
    text: Annotated[str, Field(min_length=1, max_length=100_000)]
