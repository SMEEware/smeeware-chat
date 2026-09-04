"""Gespeicherte Chat-Verlaeufe -- auflisten, laden, speichern, umbenennen, loeschen.

Unabhaengig von ``routes/chat.py``: der Chat selbst bleibt zustandslos. Die ID
vergibt das Frontend (``crypto.randomUUID``), deshalb gibt es bewusst kein POST
-- PUT legt an oder ueberschreibt, ist damit idempotent und ein Retry nach
einem Netzfehler gefahrlos.
"""

from __future__ import annotations

import re
from typing import Annotated

from fastapi import APIRouter, Query, Response, status

from src.api.deps import ChatStoreDep, ProviderDep, PublicChatStoreDep
from src.core.exceptions import NotFoundError, ValidationError
from src.schemas.chats import (
    ChatDetail,
    ChatListResponse,
    ChatRenameRequest,
    ChatShareResponse,
    ChatSummary,
    ChatUpsertRequest,
)
from src.services.chats import ChatInfo, StoredChat

CHAT_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")

router = APIRouter(prefix="/chats", tags=["chats"])


@router.get("", response_model=ChatListResponse, summary="Stored chats")
async def list_chats(
    store: ChatStoreDep,
    oeffentlich: PublicChatStoreDep,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ChatListResponse:
    """Most recently updated first -- without the messages."""
    infos = await store.list(limit=limit, offset=offset)
    geteilt = await oeffentlich.geteilte_ids()
    return ChatListResponse(
        count=len(infos),
        chats=[_summary(i, i.id in geteilt) for i in infos],
    )


@router.delete(
    "",
    status_code=status.HTTP_200_OK,
    summary="Delete every stored chat",
)
async def delete_all_chats(
    store: ChatStoreDep, oeffentlich: PublicChatStoreDep
) -> dict[str, int]:
    """Leert die Ablage vollstaendig.

    Ohne id und damit ohne 404: eine leere Ablage zu leeren ist kein Fehler,
    sondern ein Treffer mit ``deleted: 0``. Anders als beim Loeschen eines
    einzelnen Chats gibt es hier etwas zu berichten -- deshalb 200 mit Zahl
    statt eines stummen 204.
    """
    await oeffentlich.alle_zuruecknehmen()
    return {"deleted": await store.delete_all()}


@router.get("/{chat_id}", response_model=ChatDetail, summary="One chat with messages")
async def get_chat(
    chat_id: str, store: ChatStoreDep, oeffentlich: PublicChatStoreDep
) -> ChatDetail:
    chat = await store.get(_geprueft(chat_id))
    if chat is None:
        raise NotFoundError(f"Chat {chat_id!r} does not exist.")
    return _detail(chat, await oeffentlich.ist_geteilt(chat.info.id))


@router.put("/{chat_id}", response_model=ChatDetail, summary="Create or overwrite")
async def upsert_chat(
    chat_id: str,
    payload: ChatUpsertRequest,
    store: ChatStoreDep,
    oeffentlich: PublicChatStoreDep,
) -> ChatDetail:
    """Stores the history verbatim -- unknown message fields survive."""
    chat = await store.upsert(
        _geprueft(chat_id),
        [message.model_dump() for message in payload.messages],
        title=payload.title,
        model=payload.model,
    )

    geteilt = await oeffentlich.ist_geteilt(chat.info.id)
    if geteilt:
        await oeffentlich.veroeffentliche(chat)

    return _detail(chat, geteilt)


@router.patch("/{chat_id}", response_model=ChatDetail, summary="Rename a chat")
async def rename_chat(
    chat_id: str,
    payload: ChatRenameRequest,
    store: ChatStoreDep,
    oeffentlich: PublicChatStoreDep,
) -> ChatDetail:
    chat = await store.rename(_geprueft(chat_id), payload.title)
    geteilt = await oeffentlich.ist_geteilt(chat.info.id)
    if geteilt:
        await oeffentlich.veroeffentliche(chat)
    return _detail(chat, geteilt)


@router.delete(
    "/{chat_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Delete a chat",
)
async def delete_chat(
    chat_id: str, store: ChatStoreDep, oeffentlich: PublicChatStoreDep
) -> Response:
    geprueft = _geprueft(chat_id)
    if not await store.delete(geprueft):
        raise NotFoundError(f"Chat {chat_id!r} does not exist.")
    await oeffentlich.zuruecknehmen(geprueft)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{chat_id}/share",
    response_model=ChatShareResponse,
    summary="Make a chat publicly readable",
)
async def share_chat(
    chat_id: str,
    store: ChatStoreDep,
    oeffentlich: PublicChatStoreDep,
    provider: ProviderDep,
) -> ChatShareResponse:
    """Legt die oeffentlich lesbare Kopie an -- und haelt sie ab jetzt aktuell.

    Der Verlauf wird hier mit dem Schluessel der Sitzung gelesen und mit dem
    App-Schluessel neu verschluesselt. Das geht nur in diesem Moment: spaeter,
    beim Abruf durch jemand Unangemeldetes, gibt es keinen Sitzungsschluessel
    mehr.
    """
    if not provider.teilen_moeglich:
        raise ValidationError(
            "Sharing is disabled while SECRET is unset or still the example "
            "value. Public chats are encrypted with a key derived from it, "
            "and a known SECRET would make that encryption decorative.",
        )

    chat = await store.get(_geprueft(chat_id))
    if chat is None:
        raise NotFoundError(f"Chat {chat_id!r} does not exist.")

    await oeffentlich.veroeffentliche(chat)
    return ChatShareResponse(id=chat.info.id, public=True, url=f"/chat/{chat.info.id}")


@router.delete(
    "/{chat_id}/share",
    response_model=ChatShareResponse,
    summary="Withdraw a shared chat",
)
async def unshare_chat(
    chat_id: str, oeffentlich: PublicChatStoreDep
) -> ChatShareResponse:
    """Loescht die oeffentliche Kopie. Der Chat selbst bleibt unberuehrt.

    Kein 404, wenn nichts geteilt war: das Ziel ist "danach nicht geteilt",
    und das gilt dann bereits. Ein Fehler waere hier nur laut, nicht nuetzlich.
    """
    geprueft = _geprueft(chat_id)
    await oeffentlich.zuruecknehmen(geprueft)
    return ChatShareResponse(id=geprueft, public=False, url=None)


def _geprueft(chat_id: str) -> str:
    if not CHAT_ID.match(chat_id):
        raise ValidationError(
            "A chat id must match ^[A-Za-z0-9_-]{1,64}$.",
            details={"chat_id": chat_id[:100]},
        )
    return chat_id


def _summary(info: ChatInfo, public: bool = False) -> ChatSummary:
    return ChatSummary(
        id=info.id,
        title=info.title,
        model=info.model,
        message_count=info.message_count,
        created_at=info.created_at,
        updated_at=info.updated_at,
        public=public,
    )


def _detail(chat: StoredChat, public: bool = False) -> ChatDetail:
    return ChatDetail(
        **_summary(chat.info, public).model_dump(), messages=chat.messages
    )
