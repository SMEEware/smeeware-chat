from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, File, Form, UploadFile, status

from src.api.deps import ApiAccessDep, ProviderDep
from src.core.exceptions import ConfigurationError, ValidationError
from src.core.logging import get_logger
from src.schemas.transcribe import (
    SttModelInfo,
    SttModelListResponse,
    TranscriptionResponse,
    TranscriptionStatus,
)
from src.services.audio import TranscriptionError, TranscriptionService

logger = get_logger(__name__)

router = APIRouter(prefix="/transcribe", tags=["transcribe"])


def _service(provider: ProviderDep, model: str | None) -> TranscriptionService:
    service = provider.transcribe_for(model)
    if service is None:
        raise ConfigurationError("Transcription is disabled (TRANSCRIBE_ENABLED=false).")
    return service


@router.get(
    "",
    response_model=TranscriptionStatus,
    summary="Is transcription usable?",
)
async def status_(
    provider: ProviderDep,
    model: str | None = None,
) -> TranscriptionStatus:
    if not provider.settings.transcribe.enabled:
        return TranscriptionStatus(available=False, reason="Transcription is disabled.")

    try:
        service = _service(provider, model)
    except (ConfigurationError, ValidationError) as exc:
        return TranscriptionStatus(available=False, reason=str(exc))

    return TranscriptionStatus(
        available=service.available,
        reason=service.why_unavailable(),
        model=service.model_name,
    )


@router.get(
    "/models",
    response_model=SttModelListResponse,
    summary="Selectable transcription models",
)
async def list_models(provider: ProviderDep) -> SttModelListResponse:
    entries = provider.stt_models()
    default = provider.stt_default()

    return SttModelListResponse(
        count=len(entries),
        default=default,
        groups=list(dict.fromkeys(entry.group for entry in entries)),
        models=[
            SttModelInfo(
                id=entry.id,
                name=entry.name,
                description=entry.description,
                group=entry.group,
                runtime=entry.runtime,
            )
            for entry in entries
        ],
    )


@router.post(
    "",
    response_model=TranscriptionResponse,
    status_code=status.HTTP_200_OK,
    summary="Transcribe a recording",
)
async def transcribe(
    provider: ProviderDep,
    file: Annotated[UploadFile, File(description="Audio recording")],
    _: ApiAccessDep = None,
    language: Annotated[str | None, Form()] = None,
    model: Annotated[str | None, Form()] = None,
) -> TranscriptionResponse:
    service = _service(provider, model)
    audio = await file.read()

    try:
        transcript = await service.transcribe(
            audio,
            language=language or None,
            mime=file.content_type,
            filename=file.filename,
        )
    except TranscriptionError as exc:
        raise ValidationError(str(exc)) from exc

    logger.info(
        "transcribe.done",
        extra={
            "language": transcript.language,
            "chars": len(transcript.text),
            "model": service.model_name,
        },
    )
    return TranscriptionResponse(
        text=transcript.text,
        language=transcript.language,
        duration_ms=transcript.duration_ms,
        model=provider.stt_choice(model),
    )
