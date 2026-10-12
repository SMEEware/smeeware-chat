from __future__ import annotations

import re

from fastapi import APIRouter

from src.api.deps import PublicChatStoreDep
from src.core.exceptions import NotFoundError, ValidationError
from src.schemas.chats import ChatDetail, ChatSummary

CHAT_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")

router = APIRouter(prefix="/public/chats", tags=["public"])


@router.get(
    "/{chat_id}",
    response_model=ChatDetail,
    summary="A shared chat, readable without signing in",
)
async def get_public_chat(
    chat_id: str, public: PublicChatStoreDep
) -> ChatDetail:
    if not CHAT_ID.match(chat_id):
        raise ValidationError(
            "A chat id must match ^[A-Za-z0-9_-]{1,64}$.",
            details={"chat_id": chat_id[:100]},
        )

    chat = await public.hole(chat_id)
    if chat is None:
        raise NotFoundError("No shared chat under this address.")

    return ChatDetail(
        **ChatSummary(
            id=chat.info.id,
            title=chat.info.title,
            model=chat.info.model,
            message_count=chat.info.message_count,
            created_at=chat.info.created_at,
            updated_at=chat.info.updated_at,
            public=True,
        ).model_dump(),
        messages=chat.messages,
    )
