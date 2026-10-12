from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, UploadFile, status

from src.api.deps import ApiAccessDep, ProviderDep
from src.core.exceptions import ConfigurationError, ValidationError
from src.core.logging import get_logger
from src.schemas.vision import VisionImage, VisionRequest, VisionResponse
from src.services.ai.vision import Image, VisionError, VisionService

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
    return await _answers(
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
    if not files:
        raise ValidationError("No file uploaded.")

    sources: list[str | bytes] = []
    for file in files:
        content = await file.read()
        if not content:
            raise ValidationError(f"{file.filename or 'File'} is empty.")
        sources.append(content)

    return await _answers(vision, sources, question, detail)


async def _answers(
    vision: VisionService,
    sources: list[str | bytes],
    question: str | None,
    detail: str | None,
) -> VisionResponse:
    try:
        response, images = await vision.ask(sources, question, detail=detail)
    except VisionError as exc:
        raise ValidationError(str(exc)) from exc

    return VisionResponse(
        answer=response,
        model=vision.model,
        images=[_info(image) for image in images],
    )


def _info(image: Image) -> VisionImage:
    return VisionImage(
        source=image.origin,
        media_type=image.mime,
        bytes=image.bytes_,
        inlined=image.embedded,
    )
