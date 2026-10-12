from __future__ import annotations

import asyncio
import sqlite3
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass, replace
from datetime import UTC, datetime
from pathlib import Path

from src.core.logging import get_logger
from src.services.account.crypto import decrypt_field, encrypt_field

logger = get_logger(__name__)

SCHEMA = """
CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  level      TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT,
  created_at TEXT NOT NULL,
  read_at    TEXT
);
CREATE INDEX IF NOT EXISTS notifications_created_at
  ON notifications (created_at DESC);
"""

MAX_NOTIFICATIONS = 200


@dataclass(frozen=True, slots=True)
class Notification:
    id: str
    level: str
    title: str
    body: str | None
    created_at: str
    read_at: str | None


class NotificationStore:
    def __init__(self, path: Path) -> None:
        self._path = path

    @contextmanager
    def _open(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self._path, timeout=10.0)
        conn.row_factory = sqlite3.Row
        try:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA busy_timeout=5000")
            yield conn
            conn.commit()
        finally:
            conn.close()

    async def ensure_schema(self) -> None:
        await asyncio.to_thread(self._ensure_schema)

    def _ensure_schema(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        with self._open() as conn:
            conn.executescript(SCHEMA)

    async def add(self, level: str, title: str, body: str | None) -> Notification:
        return await asyncio.to_thread(self._add, level, title, body)

    def _add(self, level: str, title: str, body: str | None) -> Notification:
        notification = Notification(
            id=uuid.uuid4().hex,
            level=level,
            title=title,
            body=body,
            created_at=datetime.now(UTC).isoformat(timespec="seconds"),
            read_at=None,
        )
        with self._open() as conn:
            conn.execute(
                "INSERT INTO notifications "
                "(id, level, title, body, created_at, read_at) "
                "VALUES (?, ?, ?, ?, ?, NULL)",
                (
                    notification.id,
                    notification.level,
                    notification.title,
                    notification.body,
                    notification.created_at,
                ),
            )
            conn.execute(
                "DELETE FROM notifications WHERE id NOT IN "
                "(SELECT id FROM notifications ORDER BY created_at DESC LIMIT ?)",
                (MAX_NOTIFICATIONS,),
            )
        return notification

    async def list(self, limit: int = 100) -> list[Notification]:
        return await asyncio.to_thread(self._list, limit)

    def _list(self, limit: int) -> list[Notification]:
        with self._open() as conn:
            lines = conn.execute(
                "SELECT id, level, title, body, created_at, read_at "
                "FROM notifications ORDER BY created_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [Notification(**dict(row)) for row in lines]

    async def mark_read(self) -> int:
        return await asyncio.to_thread(self._mark_read)

    def _mark_read(self) -> int:
        now = datetime.now(UTC).isoformat(timespec="seconds")
        with self._open() as conn:
            return conn.execute(
                "UPDATE notifications SET read_at = ? WHERE read_at IS NULL",
                (now,),
            ).rowcount

    async def delete(self, notification_id: str) -> bool:
        return await asyncio.to_thread(self._delete, notification_id)

    def _delete(self, notification_id: str) -> bool:
        with self._open() as conn:
            return bool(
                conn.execute(
                    "DELETE FROM notifications WHERE id = ?", (notification_id,)
                ).rowcount
            )

    async def delete_all(self) -> int:
        return await asyncio.to_thread(self._delete_all)

    def _delete_all(self) -> int:
        with self._open() as conn:
            return conn.execute("DELETE FROM notifications").rowcount


class EncryptedNotifications:
    def __init__(self, inner: NotificationStore, key: bytes) -> None:
        self._inner = inner
        self._key = key

    async def add(self, level: str, title: str, body: str | None) -> Notification:
        notification = await self._inner.add(
            level,
            encrypt_field(title, self._key),
            encrypt_field(body, self._key) if body else None,
        )
        return self.decrypt_field(notification)

    async def list(self, limit: int = 100) -> list[Notification]:
        return [self.decrypt_field(h) for h in await self._inner.list(limit)]

    async def mark_read(self) -> int:
        return await self._inner.mark_read()

    async def delete(self, notification_id: str) -> bool:
        return await self._inner.delete(notification_id)

    async def delete_all(self) -> int:
        return await self._inner.delete_all()

    def decrypt_field(self, notification: Notification) -> Notification:
        try:
            return replace(
                notification,
                title=decrypt_field(notification.title, self._key),
                body=decrypt_field(notification.body, self._key) if notification.body else None,
            )
        except Exception:  # noqa: BLE001
            return replace(notification, title="[locked]", body=None)
