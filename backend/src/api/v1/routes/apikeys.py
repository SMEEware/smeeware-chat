"""Die API-Schluessel des Kontos -- anlegen, auflisten, umbenennen, loeschen.

Alles hier verlangt eine offene Sitzung: Schluessel verwaltet, wer angemeldet
ist. Der Schluessel selbst entsperrt spaeter die Inferenz-Endpunkte, wenn das
Backend oeffentlich steht -- aber angelegt und widerrufen wird er nur von der
Person am Konto, nie mit einem anderen Schluessel.
"""

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

SitzungHeader = Annotated[str | None, Header(alias="X-Session-Id")]


def _pruefe_sitzung(provider: ProviderDep, session: str | None) -> None:
    if provider.sessions.holen(session) is None:
        raise UnauthorizedError("Not signed in.")


@router.get("", response_model=ApiKeyListResponse, summary="List API keys")
async def list_keys(
    provider: ProviderDep, session: SitzungHeader = None
) -> ApiKeyListResponse:
    _pruefe_sitzung(provider, session)
    eintraege = await provider.api_keys.list()
    return ApiKeyListResponse(
        count=len(eintraege),
        keys=[ApiKeyItem(**asdict(e)) for e in eintraege],
    )


@router.post(
    "",
    response_model=ApiKeyCreated,
    status_code=status.HTTP_201_CREATED,
    summary="Create an API key",
)
async def create_key(
    payload: ApiKeyCreate, provider: ProviderDep, session: SitzungHeader = None
) -> ApiKeyCreated:
    """Der Klartext steht nur in dieser einen Antwort.

    Danach kennt ihn niemand mehr -- in der Datenbank liegt nur der Hash.
    """
    _pruefe_sitzung(provider, session)
    eintrag, secret = await provider.api_keys.create(payload.name.strip())
    return ApiKeyCreated(**asdict(eintrag), secret=secret)


@router.patch(
    "/{key_id}", response_model=ApiKeyItem, summary="Rename an API key"
)
async def rename_key(
    key_id: str,
    payload: ApiKeyUpdate,
    provider: ProviderDep,
    session: SitzungHeader = None,
) -> ApiKeyItem:
    _pruefe_sitzung(provider, session)
    if not await provider.api_keys.rename(key_id, payload.name.strip()):
        raise NotFoundError(f"API key {key_id!r} does not exist.")
    # Neu laden statt den Namen von Hand zusammenbauen -- so ist der
    # Zeitstempel garantiert der aus der Datenbank.
    for eintrag in await provider.api_keys.list():
        if eintrag.id == key_id:
            return ApiKeyItem(**asdict(eintrag))
    raise NotFoundError(f"API key {key_id!r} does not exist.")


@router.delete(
    "/{key_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Delete (revoke) an API key",
)
async def delete_key(
    key_id: str, provider: ProviderDep, session: SitzungHeader = None
) -> Response:
    _pruefe_sitzung(provider, session)
    if not await provider.api_keys.delete(key_id):
        raise NotFoundError(f"API key {key_id!r} does not exist.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
