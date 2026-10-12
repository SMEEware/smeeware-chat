from __future__ import annotations

import asyncio
import hashlib
import secrets
import sqlite3
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from src.core.logging import get_logger

logger = get_logger(__name__)

SCHEMA = """
CREATE TABLE IF NOT EXISTS api_keys (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  prefix        TEXT NOT NULL,
  token_sha256  TEXT NOT NULL UNIQUE,
  created_at    TEXT NOT NULL,
  last_used_at  TEXT
);
CREATE INDEX IF NOT EXISTS api_keys_token ON api_keys (token_sha256);
"""

KEY_PREFIX = "sk_smee_"
PREFIX_LEN = len(KEY_PREFIX) + 6


@dataclass(frozen=True, slots=True)
class Key:
    id: str
    name: str
    prefix: str
    created_at: str
    last_used_at: str | None


def _hash(secret: str) -> str:
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()


class ApiKeyStore:
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

    async def create(self, name: str) -> tuple[Key, str]:
        return await asyncio.to_thread(self._create, name)

    def _create(self, name: str) -> tuple[Key, str]:
        secret = KEY_PREFIX + secrets.token_urlsafe(32)
        entry = Key(
            id=uuid.uuid4().hex,
            name=name,
            prefix=secret[:PREFIX_LEN],
            created_at=datetime.now(UTC).isoformat(timespec="seconds"),
            last_used_at=None,
        )
        with self._open() as conn:
            conn.execute(
                "INSERT INTO api_keys "
                "(id, name, prefix, token_sha256, created_at, last_used_at) "
                "VALUES (?, ?, ?, ?, ?, NULL)",
                (entry.id, entry.name, entry.prefix, _hash(secret),
                 entry.created_at),
            )
        logger.info("API key created: %s (%s)", name, entry.prefix)
        return entry, secret

    async def list(self) -> list[Key]:
        return await asyncio.to_thread(self._list)

    def _list(self) -> list[Key]:
        with self._open() as conn:
            lines = conn.execute(
                "SELECT id, name, prefix, created_at, last_used_at "
                "FROM api_keys ORDER BY created_at DESC"
            ).fetchall()
        return [
            Key(
                id=z["id"],
                name=z["name"],
                prefix=z["prefix"],
                created_at=z["created_at"],
                last_used_at=z["last_used_at"],
            )
            for z in lines
        ]

    async def rename(self, key_id: str, name: str) -> bool:
        return await asyncio.to_thread(self._rename, key_id, name)

    def _rename(self, key_id: str, name: str) -> bool:
        with self._open() as conn:
            cur = conn.execute(
                "UPDATE api_keys SET name = ? WHERE id = ?", (name, key_id)
            )
        return cur.rowcount > 0

    async def delete(self, key_id: str) -> bool:
        return await asyncio.to_thread(self._delete, key_id)

    def _delete(self, key_id: str) -> bool:
        with self._open() as conn:
            cur = conn.execute("DELETE FROM api_keys WHERE id = ?", (key_id,))
        return cur.rowcount > 0

    async def delete_all(self) -> int:
        return await asyncio.to_thread(self._delete_all)

    def _delete_all(self) -> int:
        with self._open() as conn:
            cur = conn.execute("DELETE FROM api_keys")
        return cur.rowcount

    async def verify(self, secret: str) -> bool:
        if not secret:
            return False
        return await asyncio.to_thread(self._verify, secret)

    def _verify(self, secret: str) -> bool:
        digest = _hash(secret)
        now = datetime.now(UTC).isoformat(timespec="seconds")
        with self._open() as conn:
            cur = conn.execute(
                "UPDATE api_keys SET last_used_at = ? WHERE token_sha256 = ?",
                (now, digest),
            )
        return cur.rowcount > 0
