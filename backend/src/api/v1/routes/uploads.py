from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, File, Header, UploadFile, status
from fastapi.responses import FileResponse

from src.api.deps import ProviderDep
from src.core.exceptions import ConfigurationError, TooManyFilesError, UnauthorizedError, ValidationError
from src.core.logging import get_logger
from src.schemas.uploads import UploadedFile, UploadResponse
from src.services.uploads import StoredUpload, referenced_upload_ids
from src.services.uploads.lifecycle import existing_chat_ids

logger = get_logger(__name__)

router = APIRouter(prefix="/uploads", tags=["uploads"])

SessionHeader = Annotated[str | None, Header(alias="X-Session-Id")]
INLINE_IMAGES = {"image/png", "image/jpeg", "image/webp", "image/gif"}


@router.post(
    "",
    response_model=UploadResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Store chat attachments",
)
async def upload(
    provider: ProviderDep,
    files: Annotated[list[UploadFile], File(description="Files of any type")],
    session: SessionHeader = None,
) -> UploadResponse:
    if provider.sessions.fetch(session) is None:
        raise UnauthorizedError("Not signed in.")
    if not provider.settings.uploads_enabled:
        raise ConfigurationError("Uploads are disabled (UPLOADS_ENABLED=false).")
    if not files:
        raise ValidationError("No file uploaded.")
    if len(files) > provider.settings.uploads_max_files:
        raise TooManyFilesError(provider.settings.uploads_max_files)

    store = provider.uploads
    stored: list[StoredUpload] = []
    try:
        store.cleanup_unbound()
        if provider.settings.chats_enabled and provider.chats is not None:
            store.cleanup_orphans(await existing_chat_ids(provider.chats))
        for file in files:
            stored.append(await store.save(file.filename or "file", file.content_type or "", file.read))
    except BaseException:
        for file in stored:
            store.delete(file.id)
        raise
    finally:
        for file in files:
            await file.close()
    logger.info("uploads.stored", extra={"count": len(stored)})
    return UploadResponse(files=[UploadedFile.from_stored(file) for file in stored])


@router.get(
    "/{file_id}",
    response_class=FileResponse,
    summary="Fetch a stored attachment",
)
async def collect(file_id: str, provider: ProviderDep, session: SessionHeader = None) -> FileResponse:
    file = provider.uploads.get(file_id)
    signed_in = provider.sessions.fetch(session) is not None
    if not signed_in and not await _public_reference(file, provider):
        raise UnauthorizedError("Not signed in.")
    inline = file.media_type in INLINE_IMAGES or file.media_type.startswith("audio/")
    return FileResponse(
        file.path, media_type=file.media_type, filename=file.filename,
        content_disposition_type="inline" if inline else "attachment",
        headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store"},
    )


async def _public_reference(file: StoredUpload, provider: ProviderDep) -> bool:
    public = provider.public_chats
    if public is None:
        return False
    if file.chat_id is not None:
        chat = await public.hole(file.chat_id)
        return chat is not None and file.id in referenced_upload_ids(chat.messages)
    # Older published chats contain UUID images/audio without metadata.
    # They remain readable only while a shared conversation references the file.
    if (provider.uploads.root / ".metadata" / f"{file.id}.json").exists():
        return False
    for chat_id in await public.shared_ids():
        chat = await public.hole(chat_id)
        if chat is not None and file.id in referenced_upload_ids(chat.messages):
            return True
    return False
