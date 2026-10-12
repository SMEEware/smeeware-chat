from __future__ import annotations

from pydantic import BaseModel


class FsEntry(BaseModel):
    name: str
    path: str
    hidden: bool


class FsListing(BaseModel):
    path: str

    parent: str | None

    home: str

    separator: str

    entries: list[FsEntry]
