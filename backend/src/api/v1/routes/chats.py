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

from src.api.deps import ChatStoreDep
from src.core.exceptions import NotFoundError, ValidationError
from src.schemas.chats import (
    ChatDetail,
    ChatListResponse,
    ChatRenameRequest,
    ChatSummary,
    ChatUpsertRequest,
)
from src.services.chats import ChatInfo, StoredChat

# Die ID kommt vom Client und landet in der Datenbank -- eine enge Form
# schliesst Ueberraschungen aus, UUIDs passen problemlos hinein.
CHAT_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")

router = APIRouter(prefix="/chats", tags=["chats"])


@router.get("", response_model=ChatListResponse, summary="Stored chats")
async def list_chats(
    store: ChatStoreDep,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ChatListResponse:
    """Most recently updated first -- without the messages."""
    infos = await store.list(limit=limit, offset=offset)
    return ChatListResponse(count=len(infos), chats=[_summary(i) for i in infos])


@router.delete(
    "",
    status_code=status.HTTP_200_OK,
    summary="Delete every stored chat",
)
async def delete_all_chats(store: ChatStoreDep) -> dict[str, int]:
    """Leert die Ablage vollstaendig.

    Ohne id und damit ohne 404: eine leere Ablage zu leeren ist kein Fehler,
    sondern ein Treffer mit ``deleted: 0``. Anders als beim Loeschen eines
    einzelnen Chats gibt es hier etwas zu berichten -- deshalb 200 mit Zahl
    statt eines stummen 204.
    """
    return {"deleted": await store.delete_all()}


@router.get("/{chat_id}", response_model=ChatDetail, summary="One chat with messages")
async def get_chat(chat_id: str, store: ChatStoreDep) -> ChatDetail:
    chat = await store.get(_geprueft(chat_id))
    if chat is None:
        raise NotFoundError(f"Chat {chat_id!r} does not exist.")
    return _detail(chat)


@router.put("/{chat_id}", response_model=ChatDetail, summary="Create or overwrite")
async def upsert_chat(
    chat_id: str, payload: ChatUpsertRequest, store: ChatStoreDep
) -> ChatDetail:
    """Stores the history verbatim -- unknown message fields survive."""
    chat = await store.upsert(
        _geprueft(chat_id),
        # model_dump ohne Filter: parts[], id, durationMs und alles weitere,
        # was das Frontend mitschickt, muss unveraendert in die Datei.
        [message.model_dump() for message in payload.messages],
        title=payload.title,
        model=payload.model,
    )
    return _detail(chat)


@router.patch("/{chat_id}", response_model=ChatDetail, summary="Rename a chat")
async def rename_chat(
    chat_id: str, payload: ChatRenameRequest, store: ChatStoreDep
) -> ChatDetail:
    return _detail(await store.rename(_geprueft(chat_id), payload.title))


@router.delete(
    "/{chat_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Delete a chat",
)
async def delete_chat(chat_id: str, store: ChatStoreDep) -> Response:
    if not await store.delete(_geprueft(chat_id)):
        raise NotFoundError(f"Chat {chat_id!r} does not exist.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _geprueft(chat_id: str) -> str:
    if not CHAT_ID.match(chat_id):
        raise ValidationError(
            "A chat id must match ^[A-Za-z0-9_-]{1,64}$.",
            details={"chat_id": chat_id[:100]},
        )
    return chat_id


def _summary(info: ChatInfo) -> ChatSummary:
    return ChatSummary(
        id=info.id,
        title=info.title,
        model=info.model,
        message_count=info.message_count,
        created_at=info.created_at,
        updated_at=info.updated_at,
    )


def _detail(chat: StoredChat) -> ChatDetail:
    return ChatDetail(**_summary(chat.info).model_dump(), messages=chat.messages)
