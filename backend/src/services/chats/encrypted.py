from __future__ import annotations

from dataclasses import replace
from typing import Any

from src.core.logging import get_logger
from src.services.account import crypto
from src.services.chats.base import ChatInfo, ChatStore, StoredChat

logger = get_logger(__name__)

_encrypt = crypto.encrypt_field
_decrypt = crypto.decrypt_field


class EncryptedChatStore:
    def __init__(self, inner: ChatStore, key: bytes) -> None:
        self._inner = inner
        self._key = key

    async def ensure_schema(self) -> None:
        await self._inner.ensure_schema()

    async def list(self, limit: int = 50, offset: int = 0) -> list[ChatInfo]:
        infos = await self._inner.list(limit=limit, offset=offset)
        return [self._info_out(info) for info in infos]

    async def get(self, chat_id: str) -> StoredChat | None:
        chat = await self._inner.get(chat_id)
        return None if chat is None else self._chat_out(chat)

    async def exists(self, chat_id: str) -> bool:
        return await self._inner.exists(chat_id)

    async def upsert(
        self,
        chat_id: str,
        messages: list[dict[str, Any]],
        *,
        title: str | None = None,
        model: str | None = None,
    ) -> StoredChat:
        plain_title = title
        if plain_title is None and not await self._inner.exists(chat_id):
            plain_title = _title_from(messages)

        chat = await self._inner.upsert(
            chat_id,
            [self._message_in(n) for n in messages],
            title=_encrypt(plain_title, self._key) if plain_title is not None else None,
            model=model,
        )
        return self._chat_out(chat)

    async def rename(self, chat_id: str, title: str) -> StoredChat:
        chat = await self._inner.rename(chat_id, _encrypt(title, self._key))
        return self._chat_out(chat)

    async def delete(self, chat_id: str) -> bool:
        return await self._inner.delete(chat_id)

    async def delete_all(self) -> int:
        return await self._inner.delete_all()


    def _message_in(self, message: dict[str, Any]) -> dict[str, Any]:
        copy = dict(message)
        for field in ("content", "reasoning"):
            value = copy.get(field)
            if isinstance(value, str) and value:
                copy[field] = _encrypt(value, self._key)
        if isinstance(copy.get("parts"), list):
            copy["parts"] = [self._part_in(t) for t in copy["parts"]]
        if isinstance(copy.get("attachments"), list):
            copy["attachments"] = [self._attachment_in(a) for a in copy["attachments"]]
        return copy

    def _message_out(self, message: dict[str, Any]) -> dict[str, Any]:
        copy = dict(message)
        for field in ("content", "reasoning"):
            value = copy.get(field)
            if isinstance(value, str) and value:
                copy[field] = _decrypt(value, self._key)
        if isinstance(copy.get("parts"), list):
            copy["parts"] = [self._part_out(t) for t in copy["parts"]]
        if isinstance(copy.get("attachments"), list):
            copy["attachments"] = [self._attachment_out(a) for a in copy["attachments"]]
        return copy

    def _part_in(self, part: dict) -> dict:
        if not isinstance(part, dict):
            return part
        copy = dict(part)
        for field in ("text", "preview"):
            value = copy.get(field)
            if isinstance(value, str) and value:
                copy[field] = _encrypt(value, self._key)
        return copy

    def _part_out(self, part: dict) -> dict:
        if not isinstance(part, dict):
            return part
        copy = dict(part)
        for field in ("text", "preview"):
            value = copy.get(field)
            if isinstance(value, str) and value:
                copy[field] = _decrypt(value, self._key)
        return copy

    def _attachment_in(self, attachment: dict) -> dict:
        if not isinstance(attachment, dict):
            return attachment
        copy = dict(attachment)
        for field in ("name", "text", "path"):
            value = copy.get(field)
            if isinstance(value, str) and value:
                copy[field] = _encrypt(value, self._key)
        return copy

    def _attachment_out(self, attachment: dict) -> dict:
        if not isinstance(attachment, dict):
            return attachment
        copy = dict(attachment)
        for field in ("name", "text", "path"):
            value = copy.get(field)
            if isinstance(value, str) and value:
                copy[field] = _decrypt(value, self._key)
        return copy

    def _info_out(self, info: ChatInfo) -> ChatInfo:
        try:
            return replace(info, title=_decrypt(info.title, self._key))
        except Exception:  # noqa: BLE001
            return replace(info, title="[locked]")

    def _chat_out(self, chat: StoredChat) -> StoredChat:
        return replace(
            chat,
            info=self._info_out(chat.info),
            messages=[self._message_out(n) for n in chat.messages],
        )


MAX_TITLE = 60
FALLBACK_TITLE = "New chat"


def _title_from(messages: list[dict[str, Any]]) -> str:
    for message in messages:
        if message.get("role") != "user":
            continue
        content = message.get("content")
        if not isinstance(content, str):
            continue
        text = " ".join(content.split())
        if text:
            return text[:MAX_TITLE]
    return FALLBACK_TITLE
