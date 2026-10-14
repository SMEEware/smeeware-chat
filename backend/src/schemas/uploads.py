from __future__ import annotations

from pydantic import BaseModel

from src.services.uploads import StoredUpload


class UploadedFile(BaseModel):
    id: str
    filename: str
    media_type: str
    bytes: int
    path: str

    @classmethod
    def from_stored(cls, file: StoredUpload) -> "UploadedFile":
        return cls(
            id=file.id, filename=file.filename, media_type=file.media_type,
            bytes=file.bytes, path=str(file.path),
        )


class UploadResponse(BaseModel):
    files: list[UploadedFile]
