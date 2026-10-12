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
    public: PublicChatStoreDep,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ChatListResponse:
    infos = await store.list(limit=limit, offset=offset)
    shared = await public.shared_ids()
    return ChatListResponse(
        count=len(infos),
        chats=[_summary(i, i.id in shared) for i in infos],
    )


@router.delete(
    "",
    status_code=status.HTTP_200_OK,
    summary="Delete every stored chat",
)
async def delete_all_chats(
    store: ChatStoreDep, public: PublicChatStoreDep
) -> dict[str, int]:
    await public.withdraw_all()
    return {"deleted": await store.delete_all()}


@router.get("/{chat_id}", response_model=ChatDetail, summary="One chat with messages")
async def get_chat(
    chat_id: str, store: ChatStoreDep, public: PublicChatStoreDep
) -> ChatDetail:
    chat = await store.get(_checked(chat_id))
    if chat is None:
        raise NotFoundError(f"Chat {chat_id!r} does not exist.")
    return _detail(chat, await public.is_shared(chat.info.id))


@router.put("/{chat_id}", response_model=ChatDetail, summary="Create or overwrite")
async def upsert_chat(
    chat_id: str,
    payload: ChatUpsertRequest,
    store: ChatStoreDep,
    public: PublicChatStoreDep,
) -> ChatDetail:
    chat = await store.upsert(
        _checked(chat_id),
        [message.model_dump() for message in payload.messages],
        title=payload.title,
        model=payload.model,
    )

    shared = await public.is_shared(chat.info.id)
    if shared:
        await public.publish(chat)

    return _detail(chat, shared)


@router.patch("/{chat_id}", response_model=ChatDetail, summary="Rename a chat")
async def rename_chat(
    chat_id: str,
    payload: ChatRenameRequest,
    store: ChatStoreDep,
    public: PublicChatStoreDep,
) -> ChatDetail:
    chat = await store.rename(_checked(chat_id), payload.title)
    shared = await public.is_shared(chat.info.id)
    if shared:
        await public.publish(chat)
    return _detail(chat, shared)


@router.delete(
    "/{chat_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Delete a chat",
)
async def delete_chat(
    chat_id: str, store: ChatStoreDep, public: PublicChatStoreDep
) -> Response:
    checked = _checked(chat_id)
    if not await store.delete(checked):
        raise NotFoundError(f"Chat {chat_id!r} does not exist.")
    await public.withdraw(checked)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{chat_id}/share",
    response_model=ChatShareResponse,
    summary="Make a chat publicly readable",
)
async def share_chat(
    chat_id: str,
    store: ChatStoreDep,
    public: PublicChatStoreDep,
    provider: ProviderDep,
) -> ChatShareResponse:
    if not provider.can_share:
        raise ValidationError(
            "Sharing is disabled while SECRET is unset or still the example "
            "value. Public chats are encrypted with a key derived from it, "
            "and a known SECRET would make that encryption decorative.",
        )

    chat = await store.get(_checked(chat_id))
    if chat is None:
        raise NotFoundError(f"Chat {chat_id!r} does not exist.")

    await public.publish(chat)
    return ChatShareResponse(id=chat.info.id, public=True, url=f"/chat/{chat.info.id}")


@router.delete(
    "/{chat_id}/share",
    response_model=ChatShareResponse,
    summary="Withdraw a shared chat",
)
async def unshare_chat(
    chat_id: str, public: PublicChatStoreDep
) -> ChatShareResponse:
    checked = _checked(chat_id)
    await public.withdraw(checked)
    return ChatShareResponse(id=checked, public=False, url=None)


def _checked(chat_id: str) -> str:
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
