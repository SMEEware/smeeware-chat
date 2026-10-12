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

ALLOWED: dict[str, str] = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
}

CHUNK_SIZE = 1024 * 1024

ID_PATTERN = re.compile(r"^[0-9a-f]{32}$")


@router.post(
    "",
    response_model=UploadResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Store chat attachments",
)
async def upload(
    settings: SettingsDep,
    files: Annotated[list[UploadFile], File(description="Image files")],
) -> UploadResponse:
    if not settings.uploads_enabled:
        raise ConfigurationError("Uploads are disabled (UPLOADS_ENABLED=false).")
    if not files:
        raise ValidationError("No file uploaded.")
    if len(files) > settings.uploads_max_files:
        raise ValidationError(
            f"At most {settings.uploads_max_files} files per request."
        )

    target = settings.uploads_dir
    target.mkdir(parents=True, exist_ok=True)

    stored = [
        await _store(file, target, settings.uploads_max_bytes) for file in files
    ]
    logger.info("uploads.stored", extra={"count": len(stored)})
    return UploadResponse(files=stored)


@router.get(
    "/{file_id}",
    response_class=FileResponse,
    summary="Fetch a stored attachment",
)
async def collect(file_id: str, settings: SettingsDep) -> FileResponse:
    if not ID_PATTERN.match(file_id):
        raise ValidationError("Invalid file id.")

    matched = sorted(settings.uploads_dir.glob(f"{file_id}.*"))
    if not matched:
        raise NotFoundError("Attachment not found.")
    return FileResponse(matched[0])


async def _store(file: UploadFile, target: Path, max_bytes: int) -> UploadedFile:
    media_type = (file.content_type or "").split(";")[0].strip().lower()
    extension = ALLOWED.get(media_type)
    if extension is None:
        raise ValidationError(
            f"{file.filename or 'File'}: {media_type or 'unknown type'} cannot be "
            f"viewed. Allowed: {', '.join(sorted(ALLOWED))}."
        )

    identifier = uuid.uuid4().hex
    path = target / f"{identifier}{extension}"

    size = 0
    try:
        with path.open("wb") as output:
            while chunk := await file.read(CHUNK_SIZE):
                size += len(chunk)
                if size > max_bytes:
                    raise ValidationError(
                        f"{file.filename or 'File'} is larger than "
                        f"{max_bytes // 1_000_000} MB."
                    )
                output.write(chunk)
        if size == 0:
            raise ValidationError(f"{file.filename or 'File'} is empty.")
    except Exception:
        path.unlink(missing_ok=True)
        raise

    return UploadedFile(
        id=identifier,
        filename=file.filename or f"{identifier}{extension}",
        media_type=media_type,
        bytes=size,
        path=str(path.resolve()),
    )
