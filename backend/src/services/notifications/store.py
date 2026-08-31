"""Hinweise, die den Toast ueberleben.

Ein Toast ist nach sieben Sekunden weg. Wer in dem Moment woanders hinsah,
hat ihn verpasst -- und wenn er etwas Wichtiges trug, ist das genau die
Sorte Verlust, die man dem Nutzer nicht zumuten will. Also landet jeder
Hinweis zusaetzlich hier.

Verschluesselt wie die Chats, und aus demselben Grund: der Text kann alles
Moegliche tragen. Nicht verschluesselt sind Stufe und Zeitpunkt -- danach
wird sortiert und gezaehlt, und aus "eine Warnung am Dienstag" laesst sich
nicht lesen, worum es ging.
"""

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
from src.services.account.crypto import feld_aus, feld_ein

logger = get_logger(__name__)

SCHEMA = """
CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  level      TEXT NOT NULL,      -- info | success | warning | error
  title      TEXT NOT NULL,      -- verschluesselt
  body       TEXT,               -- verschluesselt
  created_at TEXT NOT NULL,      -- ISO 8601, UTC
  read_at    TEXT
);
CREATE INDEX IF NOT EXISTS notifications_created_at
  ON notifications (created_at DESC);
"""

# Mehr als das liest ohnehin niemand nach, und es haelt die Datei klein.
MAX_HINWEISE = 200


@dataclass(frozen=True, slots=True)
class Hinweis:
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

    async def add(self, level: str, title: str, body: str | None) -> Hinweis:
        return await asyncio.to_thread(self._add, level, title, body)

    def _add(self, level: str, title: str, body: str | None) -> Hinweis:
        hinweis = Hinweis(
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
                    hinweis.id,
                    hinweis.level,
                    hinweis.title,
                    hinweis.body,
                    hinweis.created_at,
                ),
            )
            # Alte abschneiden, damit die Liste nicht unbegrenzt waechst.
            conn.execute(
                "DELETE FROM notifications WHERE id NOT IN "
                "(SELECT id FROM notifications ORDER BY created_at DESC LIMIT ?)",
                (MAX_HINWEISE,),
            )
        return hinweis

    async def list(self, limit: int = 100) -> list[Hinweis]:
        return await asyncio.to_thread(self._list, limit)

    def _list(self, limit: int) -> list[Hinweis]:
        with self._open() as conn:
            zeilen = conn.execute(
                "SELECT id, level, title, body, created_at, read_at "
                "FROM notifications ORDER BY created_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [Hinweis(**dict(zeile)) for zeile in zeilen]

    async def mark_read(self) -> int:
        return await asyncio.to_thread(self._mark_read)

    def _mark_read(self) -> int:
        jetzt = datetime.now(UTC).isoformat(timespec="seconds")
        with self._open() as conn:
            return conn.execute(
                "UPDATE notifications SET read_at = ? WHERE read_at IS NULL",
                (jetzt,),
            ).rowcount

    async def delete(self, hinweis_id: str) -> bool:
        return await asyncio.to_thread(self._delete, hinweis_id)

    def _delete(self, hinweis_id: str) -> bool:
        with self._open() as conn:
            return bool(
                conn.execute(
                    "DELETE FROM notifications WHERE id = ?", (hinweis_id,)
                ).rowcount
            )

    async def delete_all(self) -> int:
        return await asyncio.to_thread(self._delete_all)

    def _delete_all(self) -> int:
        with self._open() as conn:
            return conn.execute("DELETE FROM notifications").rowcount


class VerschluesselteHinweise:
    """Dieselbe Huelle wie bei den Chats -- der Schluessel gehoert zur Sitzung.

    Ein Hinweis ohne Praefix stammt aus der Zeit vor der Verschluesselung
    oder aus einem Lauf ohne angemeldete Sitzung; er wird unveraendert
    durchgereicht, statt die Liste an ihm scheitern zu lassen.
    """

    def __init__(self, inner: NotificationStore, key: bytes) -> None:
        self._inner = inner
        self._key = key

    async def add(self, level: str, title: str, body: str | None) -> Hinweis:
        hinweis = await self._inner.add(
            level,
            feld_ein(title, self._key),
            feld_ein(body, self._key) if body else None,
        )
        return self.feld_aus(hinweis)

    async def list(self, limit: int = 100) -> list[Hinweis]:
        return [self.feld_aus(h) for h in await self._inner.list(limit)]

    async def mark_read(self) -> int:
        return await self._inner.mark_read()

    async def delete(self, hinweis_id: str) -> bool:
        return await self._inner.delete(hinweis_id)

    async def delete_all(self) -> int:
        return await self._inner.delete_all()

    def feld_aus(self, hinweis: Hinweis) -> Hinweis:
        try:
            return replace(
                hinweis,
                title=feld_aus(hinweis.title, self._key),
                body=feld_aus(hinweis.body, self._key) if hinweis.body else None,
            )
        except Exception:  # noqa: BLE001 -- aus einer anderen Passwort-Aera
            return replace(hinweis, title="[locked]", body=None)
