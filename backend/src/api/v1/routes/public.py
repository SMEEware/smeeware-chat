"""Geteilte Chats -- die einzige Route, die ohne Anmeldung Inhalte ausliefert.

Deshalb ein eigenes Modul mit eigenem Prefix statt eines Zweiges in
``chats.py``: schon der Import zeigt, dass hier ``PublicChatStoreDep`` steht
und nicht ``ChatStoreDep``. Wer die Datei aufmacht, sieht sofort, worum es
geht, und niemand fuegt hier versehentlich eine Route ein, die private Daten
anfasst.

Was hier NICHT passiert: kein Zugriff auf die Tabelle ``chats``, kein
Schreiben, kein Fortsetzen des Gespraechs. Nur Lesen dessen, was jemand
bewusst geteilt hat.
"""

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
    chat_id: str, oeffentlich: PublicChatStoreDep
) -> ChatDetail:
    """Der geteilte Verlauf.

    Nicht geteilt und gar nicht vorhanden sind absichtlich derselbe 404. Ein
    403 fuer "existiert, aber nicht geteilt" wuerde verraten, welche ids es
    gibt -- und die id ist bei einem geteilten Chat die einzige Huerde.
    """
    if not CHAT_ID.match(chat_id):
        raise ValidationError(
            "A chat id must match ^[A-Za-z0-9_-]{1,64}$.",
            details={"chat_id": chat_id[:100]},
        )

    chat = await oeffentlich.hole(chat_id)
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
