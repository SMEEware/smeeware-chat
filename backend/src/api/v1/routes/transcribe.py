"""Gesprochenes zu Text.

Multipart rein, Text raus. Welches Modell die Arbeit macht, entscheidet der
Client pro Anfrage: die Einstellung lebt im Browser, nicht im Server. Ohne
Angabe gilt ``TRANSCRIBE_MODEL`` aus der ``.env``.

Der Weg dorthin steht in ``services/audio/`` -- hier steht nur, was ein
Fehler bedeutet und wer gefragt wird.
"""

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
from src.services.audio.catalog import resolve

logger = get_logger(__name__)

router = APIRouter(prefix="/transcribe", tags=["transcribe"])


def _dienst(provider: ProviderDep, model: str | None) -> TranscriptionService:
    dienst = provider.transcribe_for(model)
    if dienst is None:
        raise ConfigurationError("Transcription is disabled (TRANSCRIBE_ENABLED=false).")
    return dienst


@router.get(
    "",
    response_model=TranscriptionStatus,
    summary="Is transcription usable?",
)
async def status_(
    provider: ProviderDep,
    model: str | None = None,
) -> TranscriptionStatus:
    """Ohne Aufnahme: laeuft alles, was gebraucht wird?

    Das Frontend fragt das einmal beim Laden und blendet das Mikrofon aus,
    wenn die Antwort nein lautet -- ein Knopf, der sicher scheitert, ist
    schlimmer als kein Knopf.
    """
    if not provider.settings.transcribe.enabled:
        return TranscriptionStatus(available=False, reason="Transcription is disabled.")

    try:
        dienst = _dienst(provider, model)
    except (ConfigurationError, ValidationError) as exc:
        return TranscriptionStatus(available=False, reason=str(exc))

    return TranscriptionStatus(
        available=dienst.available,
        reason=dienst.why_unavailable(),
        model=dienst.model_name,
    )


@router.get(
    "/models",
    response_model=SttModelListResponse,
    summary="Selectable transcription models",
)
async def list_models(provider: ProviderDep) -> SttModelListResponse:
    """Was in den Einstellungen zur Auswahl steht.

    Wie beim Chat-Katalog gefiltert: ohne ``OPENAI_API_KEY`` faellt die
    gehostete Gruppe weg, ohne installiertes whisper.cpp die lokale.
    """
    eintraege = provider.stt_modelle()
    vorgabe = provider.settings.transcribe.default_model
    if all(entry.id != vorgabe for entry in eintraege) and eintraege:
        vorgabe = eintraege[0].id

    return SttModelListResponse(
        count=len(eintraege),
        default=vorgabe,
        groups=list(dict.fromkeys(entry.group for entry in eintraege)),
        models=[
            SttModelInfo(
                id=entry.id,
                name=entry.name,
                description=entry.description,
                group=entry.group,
                runtime=entry.runtime,
            )
            for entry in eintraege
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
    """``language`` ist optional -- ohne Angabe erkennt das Modell sie selbst."""
    dienst = _dienst(provider, model)
    audio = await file.read()

    try:
        transkript = await dienst.transcribe(
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
            "language": transkript.language,
            "chars": len(transkript.text),
            "model": dienst.model_name,
        },
    )
    return TranscriptionResponse(
        text=transkript.text,
        language=transkript.language,
        duration_ms=transkript.duration_ms,
        model=resolve(model or provider.settings.transcribe.default_model).id,
    )
