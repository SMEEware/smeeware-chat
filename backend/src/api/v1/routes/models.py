from __future__ import annotations

from fastapi import APIRouter

from src.api.deps import ProviderDep
from src.schemas.models import ModelInfo, ModelListResponse
from src.services.ai.catalog import DEFAULT_MODEL, available

router = APIRouter(prefix="/models", tags=["models"])


@router.get("", response_model=ModelListResponse, summary="Available chat models")
async def list_models(provider: ProviderDep) -> ModelListResponse:
    entries = available(
        openai=provider.openai is not None,
        local=await provider.local_models_visible(),
    )
    models = [
        ModelInfo(
            id=entry.id,
            name=entry.name,
            description=entry.description,
            group=entry.group,
            runtime=entry.runtime,
            reasoning_effort=entry.reasoning_effort,
            gated=entry.gated,
        )
        for entry in entries
    ]
    groups = list(dict.fromkeys(entry.group for entry in entries))

    default = DEFAULT_MODEL
    if all(entry.id != default for entry in entries) and entries:
        default = entries[0].id

    return ModelListResponse(
        count=len(models),
        default=default,
        groups=groups,
        models=models,
    )
