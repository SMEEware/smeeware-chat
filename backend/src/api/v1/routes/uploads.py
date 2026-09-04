"""Dateien aus dem Chat entgegennehmen.

Das Hauptmodell sieht keine Bilder. Ein Anhang wandert deshalb nicht in die
Nachricht, sondern auf die Platte; zurueck geht eine Adresse. Die reicht das
Frontend als Text in den Verlauf, und der Agent gibt sie an ``analyze_image``
weiter, wenn er sie braucht.

Der Umweg ist Absicht: ``ChatRequest`` bleibt unveraendert, und der Agent
entscheidet selbst, wann und mit welcher Frage er hinsieht -- statt eine
vorgekaute Beschreibung serviert zu bekommen, zu der er nicht nachfragen kann.

Der Dateiname des Nutzers bestimmt nie den Ablageort: gespeichert wird unter
einer erzeugten id, die Endung kommt aus dem gemeldeten Medientyp. So laeuft
weder ein ``..`` noch ein ``.py`` durch.
"""

from __future__ import annotations

import re
import uuid
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, File, UploadFile, status
from fastapi.responses import FileResponse

from src.api.deps import SettingsDep
from src.core.exceptions import ConfigurationError, NotFoundError, ValidationError
from src.core.logging import get_logger
from src.schemas.uploads import UploadedFile, UploadResponse

logger = get_logger(__name__)

router = APIRouter(prefix="/uploads", tags=["uploads"])

ERLAUBT: dict[str, str] = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
}

STUECK = 1024 * 1024

ID_MUSTER = re.compile(r"^[0-9a-f]{32}$")


@router.post(
    "",
    response_model=UploadResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Store chat attachments",
)
async def hochladen(
    settings: SettingsDep,
    files: Annotated[list[UploadFile], File(description="Image files")],
) -> UploadResponse:
    """Multipart rein, Adressen raus."""
    if not settings.uploads_enabled:
        raise ConfigurationError("Uploads are disabled (UPLOADS_ENABLED=false).")
    if not files:
        raise ValidationError("No file uploaded.")
    if len(files) > settings.uploads_max_files:
        raise ValidationError(
            f"At most {settings.uploads_max_files} files per request."
        )

    ziel = settings.uploads_dir
    ziel.mkdir(parents=True, exist_ok=True)

    abgelegt = [
        await _ablegen(datei, ziel, settings.uploads_max_bytes) for datei in files
    ]
    logger.info("uploads.stored", extra={"count": len(abgelegt)})
    return UploadResponse(files=abgelegt)


@router.get(
    "/{file_id}",
    response_class=FileResponse,
    summary="Fetch a stored attachment",
)
async def abholen(file_id: str, settings: SettingsDep) -> FileResponse:
    """Damit das Frontend eine Vorschau zeigen kann, ohne die Datei zu halten."""
    if not ID_MUSTER.match(file_id):
        raise ValidationError("Invalid file id.")

    treffer = sorted(settings.uploads_dir.glob(f"{file_id}.*"))
    if not treffer:
        raise NotFoundError("Attachment not found.")
    return FileResponse(treffer[0])


async def _ablegen(datei: UploadFile, ziel: Path, max_bytes: int) -> UploadedFile:
    medientyp = (datei.content_type or "").split(";")[0].strip().lower()
    endung = ERLAUBT.get(medientyp)
    if endung is None:
        raise ValidationError(
            f"{datei.filename or 'File'}: {medientyp or 'unknown type'} cannot be "
            f"viewed. Allowed: {', '.join(sorted(ERLAUBT))}."
        )

    kennung = uuid.uuid4().hex
    pfad = ziel / f"{kennung}{endung}"

    groesse = 0
    try:
        with pfad.open("wb") as ausgabe:
            while stueck := await datei.read(STUECK):
                groesse += len(stueck)
                if groesse > max_bytes:
                    raise ValidationError(
                        f"{datei.filename or 'File'} is larger than "
                        f"{max_bytes // 1_000_000} MB."
                    )
                ausgabe.write(stueck)
        if groesse == 0:
            raise ValidationError(f"{datei.filename or 'File'} is empty.")
    except Exception:
        pfad.unlink(missing_ok=True)
        raise

    return UploadedFile(
        id=kennung,
        filename=datei.filename or f"{kennung}{endung}",
        media_type=medientyp,
        bytes=groesse,
        path=str(pfad.resolve()),
    )
