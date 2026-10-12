from __future__ import annotations

from src.api.deps import ProviderDep
from fastapi import APIRouter

from src.core.logging import get_logger
from src.schemas.tts import (
    TtsModelInfo,
    TtsModelListResponse,
    TtsStatus,
)

logger = get_logger(__name__)

router = APIRouter(prefix="/tts", tags=["tts"])


@router.get("", response_model=TtsStatus, summary="Is read-aloud usable?")
async def status_(provider: ProviderDep) -> TtsStatus:
    cfg = provider.settings.tts
    if not cfg.enabled:
        return TtsStatus(available=False, provider="none", reason="Read-aloud is disabled.")

    has_key = cfg.api_key is not None
    return TtsStatus(
        available=True,
        provider="elevenlabs" if has_key else "free",
        voice_id=cfg.voice_id if has_key else None,
        reason=None
        if has_key
        else "No ELEVENLABS_API_KEY — using the free fallback voice.",
    )


@router.get(
    "/models",
    response_model=TtsModelListResponse,
    summary="Selectable speech models",
)
async def list_models(provider: ProviderDep) -> TtsModelListResponse:
    entries = provider.tts_models()
    return TtsModelListResponse(
        count=len(entries),
        default=provider.tts_default(),
        default_voice=provider.settings.tts.voice_id,
        groups=list(dict.fromkeys(entry.group for entry in entries)),
        models=[
            TtsModelInfo(
                id=entry.id,
                name=entry.name,
                description=entry.description,
                group=entry.group,
                runtime=entry.runtime,
                language=(
                    provider.settings.tts.free_language
                    if entry.runtime == "free"
                    else None
                ),
            )
            for entry in entries
        ],
    )
