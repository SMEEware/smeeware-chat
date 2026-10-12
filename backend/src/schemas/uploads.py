from __future__ import annotations

from pydantic import BaseModel


class UploadedFile(BaseModel):
    id: str
    filename: str
    media_type: str
    bytes: int
    path: str


class UploadResponse(BaseModel):
    files: list[UploadedFile]
