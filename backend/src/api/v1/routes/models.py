"""Verfuegbare Chat-Modelle -- was /chat als 'model' akzeptiert.

Die Liste steht im Katalog (``services/ai/catalog.py``), weil dort auch
steht, wo ein Modell laeuft. Zwei Listen an zwei Orten waeren genau die
Sorte Doppelung, die irgendwann auseinanderlaeuft.

Gefiltert wird erst hier, und zwar an der Konfiguration: ohne
``OPENAI_API_KEY`` faellt die ganze OpenAI-Gruppe weg, ohne Ollama die
lokale. Ein Modell anzubieten, das beim ersten Klick mit 401 antwortet,
waere eine Auswahl, die luegt.
"""

from __future__ import annotations

from fastapi import APIRouter

from src.api.deps import ProviderDep
from src.schemas.models import ModelInfo, ModelListResponse
from src.services.ai.catalog import DEFAULT_MODEL, verfuegbar

router = APIRouter(prefix="/models", tags=["models"])


@router.get("", response_model=ModelListResponse, summary="Available chat models")
async def list_models(provider: ProviderDep) -> ModelListResponse:
    """The models that /chat and /chat/stream accept as 'model'."""
    eintraege = verfuegbar(
        openai=provider.openai is not None,
        lokal=await provider.lokale_modelle_sichtbar(),
    )
    modelle = [
        ModelInfo(
            id=entry.id,
            name=entry.name,
            description=entry.description,
            group=entry.group,
            runtime=entry.runtime,
            reasoning_effort=entry.reasoning_effort,
            gated=entry.gated,
        )
        for entry in eintraege
    ]
    # Die Ueberschriften aus der gefilterten Liste, nicht aus dem vollen
    # Katalog: eine leere Gruppe im Auswahlfeld waere schlechter als keine.
    gruppen = list(dict.fromkeys(entry.group for entry in eintraege))

    # Faellt das Standardmodell weg -- etwa weil sein Anbieter aus ist --,
    # zeigt die Auswahl sonst auf etwas, das nicht in der Liste steht.
    vorgabe = DEFAULT_MODEL
    if all(entry.id != vorgabe for entry in eintraege) and eintraege:
        vorgabe = eintraege[0].id

    return ModelListResponse(
        count=len(modelle),
        default=vorgabe,
        groups=gruppen,
        models=modelle,
    )
