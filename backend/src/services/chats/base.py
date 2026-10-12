from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol


@dataclass(frozen=True, slots=True)
class ChatInfo:
    id: str
    title: str
    model: str | None
    message_count: int
    created_at: str
    updated_at: str


@dataclass(frozen=True, slots=True)
class StoredChat:
    info: ChatInfo
    messages: list[dict[str, Any]]


class ChatStore(Protocol):
    async def ensure_schema(self) -> None:
        ...

    async def list(self, limit: int = 50, offset: int = 0) -> list[ChatInfo]:
        ...

    async def get(self, chat_id: str) -> StoredChat | None:
        ...

    async def exists(self, chat_id: str) -> bool:
        ...

    async def upsert(
        self,
        chat_id: str,
        messages: list[dict[str, Any]],
        *,
        title: str | None = None,
        model: str | None = None,
    ) -> StoredChat:
        ...

    async def rename(self, chat_id: str, title: str) -> StoredChat:
        ...

    async def delete(self, chat_id: str) -> bool:
        ...

    async def delete_all(self) -> int:
        ...
