"""Was das Vorlesen kann -- fuer die Einstellungen.

Kein Synthese-Endpunkt: gesprochen wird ueber das Werkzeug ``read_aloud`` im
Chat, nicht ueber einen eigenen Aufruf. Hier steht nur, ob das Vorlesen
ueberhaupt geht und welche Modelle zur Auswahl stehen -- damit das Frontend
die Stimmen-Auswahl fuellen und ausblenden kann, was gerade nicht laeuft.
"""

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

    hat_key = cfg.api_key is not None
    return TtsStatus(
        available=True,
        provider="elevenlabs" if hat_key else "free",
        voice_id=cfg.voice_id if hat_key else None,
        reason=None
        if hat_key
        else "No ELEVENLABS_API_KEY — using the free fallback voice.",
    )


@router.get(
    "/models",
    response_model=TtsModelListResponse,
    summary="Selectable speech models",
)
async def list_models(provider: ProviderDep) -> TtsModelListResponse:
    """Was in den Einstellungen zur Auswahl steht.

    Ohne ``ELEVENLABS_API_KEY`` faellt die ElevenLabs-Gruppe weg und nur der
    gratis Eintrag bleibt -- die Vorgabe verschiebt sich dann auf ihn.
    """
    eintraege = provider.tts_modelle()
    return TtsModelListResponse(
        count=len(eintraege),
        default=provider.tts_default(),
        default_voice=provider.settings.tts.voice_id,
        groups=list(dict.fromkeys(entry.group for entry in eintraege)),
        models=[
            TtsModelInfo(
                id=entry.id,
                name=entry.name,
                description=entry.description,
                group=entry.group,
                runtime=entry.runtime,
            )
            for entry in eintraege
        ],
    )
