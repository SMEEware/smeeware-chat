"""Ein-/Ausgabe-Modelle des Upload-Endpunkts."""

from __future__ import annotations

from pydantic import BaseModel


class UploadedFile(BaseModel):
    """Was von einer angenommenen Datei uebrig bleibt -- eine Adresse."""

    id: str
    filename: str
    media_type: str
    bytes: int
    # Absoluter Pfad auf der Maschine des Backends. Genau die Form, die
    # ``analyze_image`` als Quelle annimmt -- deshalb steht er hier und
    # nicht bloss die Abhol-URL.
    path: str


class UploadResponse(BaseModel):
    files: list[UploadedFile]
