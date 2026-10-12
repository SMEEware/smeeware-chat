from __future__ import annotations

import asyncio
import json
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from src.core.logging import get_logger
from src.services.account import crypto
from src.services.chats.base import ChatInfo, StoredChat

logger = get_logger(__name__)

SCHEMA = """
CREATE TABLE IF NOT EXISTS public_chats (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  model         TEXT,
  messages      TEXT NOT NULL,
  message_count INTEGER NOT NULL,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
"""

BUSY_TIMEOUT_MS = 5000


def without_hidden(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [m for m in messages if not m.get("hidden")]


class PublicChatStore:
    def __init__(self, path: Path, key: bytes) -> None:
        self._path = Path(path)
        self._key = key


    async def ensure_schema(self) -> None:
        await asyncio.to_thread(self._ensure_schema)

    def _ensure_schema(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        with self._open() as conn:
            conn.executescript(SCHEMA)
        logger.info("Shared chat store ready: %s", self._path)


    async def hole(self, chat_id: str) -> StoredChat | None:
        return await asyncio.to_thread(self._hole, chat_id)

    def _hole(self, chat_id: str) -> StoredChat | None:
        with self._open() as conn:
            row = conn.execute(
                "SELECT id, title, model, messages, message_count, "
                "created_at, updated_at FROM public_chats WHERE id = ?",
                (chat_id,),
            ).fetchone()

        if row is None:
            return None

        return StoredChat(
            info=ChatInfo(
                id=row["id"],
                title=crypto.decrypt_field(row["title"], self._key),
                model=row["model"],
                message_count=row["message_count"],
                created_at=row["created_at"],
                updated_at=row["updated_at"],
            ),
            messages=json.loads(crypto.decrypt_field(row["messages"], self._key)),
        )

    async def is_shared(self, chat_id: str) -> bool:
        return await asyncio.to_thread(self._is_shared, chat_id)

    def _is_shared(self, chat_id: str) -> bool:
        with self._open() as conn:
            return (
                conn.execute(
                    "SELECT 1 FROM public_chats WHERE id = ?", (chat_id,)
                ).fetchone()
                is not None
            )

    async def shared_ids(self) -> set[str]:
        return await asyncio.to_thread(self._shared_ids)

    def _shared_ids(self) -> set[str]:
        with self._open() as conn:
            return {
                row["id"]
                for row in conn.execute("SELECT id FROM public_chats").fetchall()
            }


    async def publish(self, chat: StoredChat) -> None:
        await asyncio.to_thread(self._publish, chat)

    def _publish(self, chat: StoredChat) -> None:
        visible = without_hidden(chat.messages)
        now = _now()

        title = crypto.encrypt_field(chat.info.title, self._key)
        blob = crypto.encrypt_field(
            json.dumps(visible, ensure_ascii=False), self._key
        )

        with self._open() as conn:
            previous = conn.execute(
                "SELECT created_at FROM public_chats WHERE id = ?",
                (chat.info.id,),
            ).fetchone()
            since = previous["created_at"] if previous is not None else now

            conn.execute(
                "INSERT INTO public_chats "
                "(id, title, model, messages, message_count, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?) "
                "ON CONFLICT(id) DO UPDATE SET "
                "title = excluded.title, model = excluded.model, "
                "messages = excluded.messages, "
                "message_count = excluded.message_count, "
                "updated_at = excluded.updated_at",
                (
                    chat.info.id,
                    title,
                    chat.info.model,
                    blob,
                    len(visible),
                    since,
                    now,
                ),
            )

    async def withdraw(self, chat_id: str) -> bool:
        return await asyncio.to_thread(self._withdraw, chat_id)

    def _withdraw(self, chat_id: str) -> bool:
        with self._open() as conn:
            cursor = conn.execute(
                "DELETE FROM public_chats WHERE id = ?", (chat_id,)
            )
            return cursor.rowcount > 0

    async def withdraw_all(self) -> int:
        return await asyncio.to_thread(self._withdraw_all)

    def _withdraw_all(self) -> int:
        with self._open() as conn:
            return conn.execute("DELETE FROM public_chats").rowcount


    @contextmanager
    def _open(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self._path, timeout=BUSY_TIMEOUT_MS / 1000)
        conn.row_factory = sqlite3.Row
        try:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute(f"PRAGMA busy_timeout={BUSY_TIMEOUT_MS}")
            yield conn
            conn.commit()
        finally:
            conn.close()


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")
