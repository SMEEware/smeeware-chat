"""Bilder ansehen -- direkt, ohne den Umweg ueber den Agenten.

Zwei Wege hinein: JSON mit Adressen (URL, Dateipfad, data:-URL) und Multipart
mit echten Dateien. Der zweite ist der, den ein Frontend braucht -- rohe Bytes
lassen sich nicht sinnvoll als Werkzeugargument durchreichen.

Der Agent nutzt denselben Service ueber das Werkzeug ``analyze_image``.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, UploadFile, status

from src.api.deps import ApiAccessDep, ProviderDep
from src.core.exceptions import ConfigurationError, ValidationError
from src.core.logging import get_logger
from src.schemas.vision import VisionImage, VisionRequest, VisionResponse
from src.services.ai.vision import Bild, VisionError, VisionService

logger = get_logger(__name__)

router = APIRouter(prefix="/vision", tags=["vision"])


def get_vision(provider: ProviderDep) -> VisionService:
    if (vision := provider.vision) is None:
        raise ConfigurationError(
            "Vision is disabled (VISION_ENABLED=false)."
        )
    return vision


VisionDep = Annotated[VisionService, Depends(get_vision)]


@router.post(
    "",
    response_model=VisionResponse,
    status_code=status.HTTP_200_OK,
    summary="Analyze images by address",
)
async def analyse(
    payload: VisionRequest, vision: VisionDep, _: ApiAccessDep = None
) -> VisionResponse:
    """URL, file path, or data: URL -- mixed freely."""
    return await _antworten(
        vision, list(payload.images), payload.question, payload.detail
    )


@router.post(
    "/upload",
    response_model=VisionResponse,
    status_code=status.HTTP_200_OK,
    summary="Analyze uploaded image files",
)
async def analyse_upload(
    vision: VisionDep,
    files: Annotated[list[UploadFile], File(description="Image files")],
    _: ApiAccessDep = None,
    question: Annotated[str | None, Form()] = None,
    detail: Annotated[str | None, Form()] = None,
) -> VisionResponse:
    """Raw bytes -- the path for a frontend with a file picker."""
    if not files:
        raise ValidationError("No file uploaded.")

    quellen: list[str | bytes] = []
    for datei in files:
        inhalt = await datei.read()
        if not inhalt:
            raise ValidationError(f"{datei.filename or 'File'} is empty.")
        quellen.append(inhalt)

    return await _antworten(vision, quellen, question, detail)


async def _antworten(
    vision: VisionService,
    quellen: list[str | bytes],
    frage: str | None,
    detail: str | None,
) -> VisionResponse:
    try:
        antwort, bilder = await vision.ask(quellen, frage, detail=detail)
    except VisionError as exc:
        raise ValidationError(str(exc)) from exc

    return VisionResponse(
        answer=antwort,
        model=vision.model,
        images=[_info(bild) for bild in bilder],
    )


def _info(bild: Bild) -> VisionImage:
    return VisionImage(
        source=bild.herkunft,
        media_type=bild.mime,
        bytes=bild.bytes_,
        inlined=bild.eingebettet,
    )
