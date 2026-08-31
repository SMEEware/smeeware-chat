from __future__ import annotations

from fastapi import APIRouter

from src.api.deps import ProviderDep
from src.schemas.tools import ToolListResponse, ToolSpecResponse

router = APIRouter(prefix="/tools", tags=["tools"])


@router.get("", response_model=ToolListResponse, summary="Available tools")
async def list_tools(provider: ProviderDep) -> ToolListResponse:
    """What the agent can currently call -- for the frontend and debugging."""
    specs = await provider.toolbox.specs()
    return ToolListResponse(
        count=len(specs),
        tools=[
            ToolSpecResponse(
                name=spec.name,
                description=spec.description,
                parameters=spec.parameters,
            )
            for spec in specs
        ],
    )
