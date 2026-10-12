from __future__ import annotations

import asyncio
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path

from src.core.logging import get_logger

logger = get_logger(__name__)

SCHEMA = """
CREATE TABLE IF NOT EXISTS plugins (
  slug         TEXT PRIMARY KEY,
  installed_at TEXT NOT NULL
);
"""

BUSY_TIMEOUT_MS = 5000


class PluginStore:
    def __init__(self, path: Path) -> None:
        self._path = Path(path)

    async def ensure_schema(self) -> None:
        await asyncio.to_thread(self._ensure_schema)

    def _ensure_schema(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        with self._open() as conn:
            conn.executescript(SCHEMA)
        logger.info("Plugin store ready: %s", self._path)

    async def installed(self) -> set[str]:
        return await asyncio.to_thread(self._installed)

    def _installed(self) -> set[str]:
        with self._open() as conn:
            return {
                row["slug"]
                for row in conn.execute("SELECT slug FROM plugins").fetchall()
            }

    async def install(self, slug: str) -> None:
        await asyncio.to_thread(self._install, slug)

    def _install(self, slug: str) -> None:
        with self._open() as conn:
            conn.execute(
                "INSERT INTO plugins (slug, installed_at) VALUES (?, ?) "
                "ON CONFLICT(slug) DO NOTHING",
                (slug, _now()),
            )

    async def uninstall(self, slug: str) -> bool:
        return await asyncio.to_thread(self._uninstall, slug)

    def _uninstall(self, slug: str) -> bool:
        with self._open() as conn:
            return conn.execute(
                "DELETE FROM plugins WHERE slug = ?", (slug,)
            ).rowcount > 0

    async def remove_all(self) -> int:
        return await asyncio.to_thread(self._remove_all)

    def _remove_all(self) -> int:
        with self._open() as conn:
            return conn.execute("DELETE FROM plugins").rowcount

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
