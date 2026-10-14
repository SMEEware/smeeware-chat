from __future__ import annotations

from fastapi import APIRouter

from src.api.deps import ProviderDep
from src.schemas.capabilities import CapabilitiesResponse

router = APIRouter(tags=["capabilities"])


@router.get(
    "/capabilities",
    response_model=CapabilitiesResponse,
    summary="Server features that depend on configuration",
)
async def capabilities(provider: ProviderDep) -> CapabilitiesResponse:
    return CapabilitiesResponse(
        sharing=provider.can_share,
        uploads=provider.settings.uploads_enabled,
        uploads_max_bytes=provider.settings.uploads_max_bytes,
        uploads_max_files=provider.settings.uploads_max_files,
    )
