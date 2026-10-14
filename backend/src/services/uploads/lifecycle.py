from __future__ import annotations

from src.services.chats.base import ChatStore


async def existing_chat_ids(store: ChatStore) -> set[str]:
    """Read every stored scope without decrypting messages or truncating at one page."""
    identifiers: set[str] = set()
    offset = 0
    while chats := await store.list(limit=200, offset=offset):
        identifiers.update(chat.id for chat in chats)
        offset += len(chats)
    return identifiers
