"""Ein-/Ausgabe-Modelle des Upload-Endpunkts."""

from __future__ import annotations

from pydantic import BaseModel


class UploadedFile(BaseModel):
    """Was von einer angenommenen Datei uebrig bleibt -- eine Adresse."""

    id: str
    filename: str
    media_type: str
    bytes: int
    path: str


class UploadResponse(BaseModel):
    files: list[UploadedFile]
