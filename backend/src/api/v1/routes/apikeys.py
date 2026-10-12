from __future__ import annotations

from dataclasses import asdict
from typing import Annotated

from fastapi import APIRouter, Header, Response, status

from src.api.deps import ProviderDep
from src.core.exceptions import NotFoundError, UnauthorizedError
from src.core.logging import get_logger
from src.schemas.apikeys import (
    ApiKeyCreate,
    ApiKeyCreated,
    ApiKeyItem,
    ApiKeyListResponse,
    ApiKeyUpdate,
)

logger = get_logger(__name__)

router = APIRouter(prefix="/account/keys", tags=["api-keys"])

SessionHeader = Annotated[str | None, Header(alias="X-Session-Id")]


def _check_session(provider: ProviderDep, session: str | None) -> None:
    if provider.sessions.fetch(session) is None:
        raise UnauthorizedError("Not signed in.")


@router.get("", response_model=ApiKeyListResponse, summary="List API keys")
async def list_keys(
    provider: ProviderDep, session: SessionHeader = None
) -> ApiKeyListResponse:
    _check_session(provider, session)
    entries = await provider.api_keys.list()
    return ApiKeyListResponse(
        count=len(entries),
        keys=[ApiKeyItem(**asdict(e)) for e in entries],
    )


@router.post(
    "",
    response_model=ApiKeyCreated,
    status_code=status.HTTP_201_CREATED,
    summary="Create an API key",
)
async def create_key(
    payload: ApiKeyCreate, provider: ProviderDep, session: SessionHeader = None
) -> ApiKeyCreated:
    _check_session(provider, session)
    entry, secret = await provider.api_keys.create(payload.name.strip())
    return ApiKeyCreated(**asdict(entry), secret=secret)


@router.patch(
    "/{key_id}", response_model=ApiKeyItem, summary="Rename an API key"
)
async def rename_key(
    key_id: str,
    payload: ApiKeyUpdate,
    provider: ProviderDep,
    session: SessionHeader = None,
) -> ApiKeyItem:
    _check_session(provider, session)
    if not await provider.api_keys.rename(key_id, payload.name.strip()):
        raise NotFoundError(f"API key {key_id!r} does not exist.")
    for entry in await provider.api_keys.list():
        if entry.id == key_id:
            return ApiKeyItem(**asdict(entry))
    raise NotFoundError(f"API key {key_id!r} does not exist.")


@router.delete(
    "/{key_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Delete (revoke) an API key",
)
async def delete_key(
    key_id: str, provider: ProviderDep, session: SessionHeader = None
) -> Response:
    _check_session(provider, session)
    if not await provider.api_keys.delete(key_id):
        raise NotFoundError(f"API key {key_id!r} does not exist.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
