from __future__ import annotations

import asyncio
import json
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from src.core.exceptions import NotFoundError
from src.core.logging import get_logger
from src.services.chats.base import ChatInfo, StoredChat

logger = get_logger(__name__)

SCHEMA = """
CREATE TABLE IF NOT EXISTS chats (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  model         TEXT,
  messages      TEXT NOT NULL,
  message_count INTEGER NOT NULL,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  user_id       TEXT
);
CREATE INDEX IF NOT EXISTS chats_updated_at ON chats (updated_at DESC);
"""

COLUMNS = "id, title, model, messages, message_count, created_at, updated_at"

MAX_TITLE = 60
FALLBACK_TITLE = "New chat"

BUSY_TIMEOUT_MS = 5000


class SqliteChatStore:
    def __init__(self, path: Path) -> None:
        self._path = Path(path)


    async def ensure_schema(self) -> None:
        await asyncio.to_thread(self._ensure_schema)

    def _ensure_schema(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        with self._open() as conn:
            conn.executescript(SCHEMA)
        logger.info("Chat store ready: %s", self._path)


    async def list(self, limit: int = 50, offset: int = 0) -> list[ChatInfo]:
        return await asyncio.to_thread(self._list, limit, offset)

    def _list(self, limit: int, offset: int) -> list[ChatInfo]:
        with self._open() as conn:
            lines = conn.execute(
                "SELECT id, title, model, message_count, created_at, updated_at "
                "FROM chats ORDER BY updated_at DESC LIMIT ? OFFSET ?",
                (limit, offset),
            ).fetchall()
        return [_to_info(row) for row in lines]

    async def get(self, chat_id: str) -> StoredChat | None:
        return await asyncio.to_thread(self._get, chat_id)

    def _get(self, chat_id: str) -> StoredChat | None:
        with self._open() as conn:
            row = self._read(conn, chat_id)
        return _to_chat(row) if row is not None else None


    async def exists(self, chat_id: str) -> bool:
        return await asyncio.to_thread(self._exists, chat_id)

    def _exists(self, chat_id: str) -> bool:
        with self._open() as conn:
            return (
                conn.execute(
                    "SELECT 1 FROM chats WHERE id = ?", (chat_id,)
                ).fetchone()
                is not None
            )

    async def upsert(
        self,
        chat_id: str,
        messages: list[dict[str, Any]],
        *,
        title: str | None = None,
        model: str | None = None,
    ) -> StoredChat:
        return await asyncio.to_thread(self._upsert, chat_id, messages, title, model)

    def _upsert(
        self,
        chat_id: str,
        messages: list[dict[str, Any]],
        title: str | None,
        model: str | None,
    ) -> StoredChat:
        now = _now()
        blob = json.dumps(messages, ensure_ascii=False)

        with self._open() as conn:
            existing = conn.execute(
                "SELECT title, model, created_at FROM chats WHERE id = ?",
                (chat_id,),
            ).fetchone()

            if existing is None:
                created_at = now
                new_title = title or _title_from(messages)
                new_model = model
            else:
                created_at = existing["created_at"]
                new_title = title or existing["title"] or _title_from(messages)
                new_model = model if model is not None else existing["model"]

            conn.execute(
                f"INSERT INTO chats ({COLUMNS}, user_id) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, NULL) "
                "ON CONFLICT(id) DO UPDATE SET "
                "title = excluded.title, model = excluded.model, "
                "messages = excluded.messages, "
                "message_count = excluded.message_count, "
                "updated_at = excluded.updated_at",
                (
                    chat_id,
                    new_title,
                    new_model,
                    blob,
                    len(messages),
                    created_at,
                    now,
                ),
            )

        return StoredChat(
            info=ChatInfo(
                id=chat_id,
                title=new_title,
                model=new_model,
                message_count=len(messages),
                created_at=created_at,
                updated_at=now,
            ),
            messages=messages,
        )

    async def rename(self, chat_id: str, title: str) -> StoredChat:
        return await asyncio.to_thread(self._rename, chat_id, title)

    def _rename(self, chat_id: str, title: str) -> StoredChat:
        with self._open() as conn:
            changed = conn.execute(
                "UPDATE chats SET title = ?, updated_at = ? WHERE id = ?",
                (title, _now(), chat_id),
            ).rowcount
            if not changed:
                raise NotFoundError(f"Chat {chat_id!r} does not exist.")
            row = self._read(conn, chat_id)

        assert row is not None
        return _to_chat(row)

    async def delete(self, chat_id: str) -> bool:
        return await asyncio.to_thread(self._delete, chat_id)

    def _delete(self, chat_id: str) -> bool:
        with self._open() as conn:
            return bool(
                conn.execute("DELETE FROM chats WHERE id = ?", (chat_id,)).rowcount
            )

    async def delete_all(self) -> int:
        return await asyncio.to_thread(self._delete_all)

    def _delete_all(self) -> int:
        with self._open() as conn:
            return conn.execute("DELETE FROM chats").rowcount


    def _read(self, conn: sqlite3.Connection, chat_id: str) -> sqlite3.Row | None:
        return conn.execute(
            f"SELECT {COLUMNS} FROM chats WHERE id = ?", (chat_id,)
        ).fetchone()

    @contextmanager
    def _open(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self._path, timeout=BUSY_TIMEOUT_MS / 1000)
        conn.row_factory = sqlite3.Row
        try:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute(f"PRAGMA busy_timeout={BUSY_TIMEOUT_MS}")
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()


def _to_info(row: sqlite3.Row) -> ChatInfo:
    return ChatInfo(
        id=row["id"],
        title=row["title"],
        model=row["model"],
        message_count=row["message_count"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _to_chat(row: sqlite3.Row) -> StoredChat:
    return StoredChat(info=_to_info(row), messages=json.loads(row["messages"]))


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


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
