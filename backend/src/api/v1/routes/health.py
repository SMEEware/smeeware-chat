from __future__ import annotations

from fastapi import APIRouter

from src.api.deps import AgentDep, SettingsDep
from src.schemas.health import HealthResponse, ReadinessResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse, summary="Liveness")
async def health(settings: SettingsDep) -> HealthResponse:
    """Is the process running? No upstream call -- for Electron at startup."""
    return HealthResponse(
        status="ok",
        version=settings.version,
        environment=settings.environment,
    )


@router.get("/ready", response_model=ReadinessResponse, summary="Readiness")
async def ready(settings: SettingsDep, agent: AgentDep) -> ReadinessResponse:
    """Is the LLM provider reachable? Actually queries the upstream."""
    reachable = await agent.health()
    return ReadinessResponse(
        status="ok" if reachable else "degraded",
        version=settings.version,
        environment=settings.environment,
        provider=agent.provider_name,
        provider_reachable=reachable,
    )
