"""Welche Plugins installiert sind.

Eine Zeile heisst installiert, keine Zeile heisst nicht installiert. Kein
``enabled``-Flag: der Zustand "Zeile da, aber aus" waere eine Unterscheidung
ohne Nutzen und eine zweite Wahrheit, die von der ersten abweichen kann.

Nicht verschluesselt, anders als Chats und Hinweise: welche Werkzeuge an sind,
ist kein Inhalt, und der Schalter muss auch dann lesbar sein, wenn niemand
angemeldet ist.
"""

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
        logger.info("Plugin-Speicher bereit: %s", self._path)

    async def installiert(self) -> set[str]:
        return await asyncio.to_thread(self._installiert)

    def _installiert(self) -> set[str]:
        with self._open() as conn:
            return {
                zeile["slug"]
                for zeile in conn.execute("SELECT slug FROM plugins").fetchall()
            }

    async def installieren(self, slug: str) -> None:
        await asyncio.to_thread(self._installieren, slug)

    def _installieren(self, slug: str) -> None:
        with self._open() as conn:
            conn.execute(
                "INSERT INTO plugins (slug, installed_at) VALUES (?, ?) "
                "ON CONFLICT(slug) DO NOTHING",
                (slug, _jetzt()),
            )

    async def deinstallieren(self, slug: str) -> bool:
        return await asyncio.to_thread(self._deinstallieren, slug)

    def _deinstallieren(self, slug: str) -> bool:
        with self._open() as conn:
            return conn.execute(
                "DELETE FROM plugins WHERE slug = ?", (slug,)
            ).rowcount > 0

    async def alle_entfernen(self) -> int:
        """Beim Loeschen des Kontos -- die Auswahl gehoert zu ihm."""
        return await asyncio.to_thread(self._alle_entfernen)

    def _alle_entfernen(self) -> int:
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


def _jetzt() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")
