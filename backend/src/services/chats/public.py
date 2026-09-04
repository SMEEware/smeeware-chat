"""Die oeffentlich lesbare Kopie eines Chats.

Warum eine Kopie und nicht eine Spalte am Chat: der Verlauf liegt mit dem
Datenschluessel der Sitzung verschluesselt (siehe ``encrypted.py``), und der
entsteht beim Anmelden aus dem Passwort. Wer nicht angemeldet ist, hat ihn
nicht -- eine Markierung "oeffentlich" an der bestehenden Zeile braechte also
nichts, weil niemand sie lesen koennte.

Deshalb entsteht beim Teilen eine zweite Zeile, verschluesselt mit dem
App-Schluessel aus SECRET. Den hat der Server immer, auch ohne Sitzung.

Die Existenz dieser Zeile IST die Markierung. Kein zusaetzliches Flag am
Chat: zwei Wahrheiten laufen auseinander, sobald ein Schreibvorgang scheitert,
und dann stuende "geteilt" an einem Chat, den niemand abrufen kann.
"""

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
  title         TEXT NOT NULL,      -- enc:v1: mit dem App-Schluessel
  model         TEXT,
  messages      TEXT NOT NULL,      -- enc:v1: JSON-Array, ohne versteckte
  message_count INTEGER NOT NULL,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
"""

BUSY_TIMEOUT_MS = 5000


def ohne_versteckte(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Was eine ausgeblendete Nachricht ist, entscheidet das Frontend.

    Es setzt ``hidden: true``, wenn jemand eine Nachricht aus dem Verlauf
    nimmt. Sie darf dann auch oeffentlich nicht auftauchen -- sonst waere das
    Ausblenden im eigenen Fenster eine Illusion.

    Gefiltert wird beim SCHREIBEN, nicht beim Lesen: was hier nicht
    hineinkommt, kann auch durch einen Fehler weiter oben nicht herausfallen.
    """
    return [m for m in messages if not m.get("hidden")]


class PublicChatStore:
    """Geteilte Chats -- lesbar ohne Anmeldung, deshalb eigener Schluessel."""

    def __init__(self, path: Path, key: bytes) -> None:
        self._path = Path(path)
        self._key = key


    async def ensure_schema(self) -> None:
        await asyncio.to_thread(self._ensure_schema)

    def _ensure_schema(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        with self._open() as conn:
            conn.executescript(SCHEMA)
        logger.info("Speicher fuer geteilte Chats bereit: %s", self._path)


    async def hole(self, chat_id: str) -> StoredChat | None:
        """Der geteilte Verlauf -- None, wenn dieser Chat nicht geteilt ist."""
        return await asyncio.to_thread(self._hole, chat_id)

    def _hole(self, chat_id: str) -> StoredChat | None:
        with self._open() as conn:
            zeile = conn.execute(
                "SELECT id, title, model, messages, message_count, "
                "created_at, updated_at FROM public_chats WHERE id = ?",
                (chat_id,),
            ).fetchone()

        if zeile is None:
            return None

        return StoredChat(
            info=ChatInfo(
                id=zeile["id"],
                title=crypto.feld_aus(zeile["title"], self._key),
                model=zeile["model"],
                message_count=zeile["message_count"],
                created_at=zeile["created_at"],
                updated_at=zeile["updated_at"],
            ),
            messages=json.loads(crypto.feld_aus(zeile["messages"], self._key)),
        )

    async def ist_geteilt(self, chat_id: str) -> bool:
        return await asyncio.to_thread(self._ist_geteilt, chat_id)

    def _ist_geteilt(self, chat_id: str) -> bool:
        with self._open() as conn:
            return (
                conn.execute(
                    "SELECT 1 FROM public_chats WHERE id = ?", (chat_id,)
                ).fetchone()
                is not None
            )

    async def geteilte_ids(self) -> set[str]:
        """Alle geteilten ids auf einmal.

        Fuer die Liste in der Seitenleiste: sie will je Chat wissen, ob er
        geteilt ist, und N einzelne Abfragen waeren N Abfragen fuer eine
        Antwort, die in eine passt.
        """
        return await asyncio.to_thread(self._geteilte_ids)

    def _geteilte_ids(self) -> set[str]:
        with self._open() as conn:
            return {
                zeile["id"]
                for zeile in conn.execute("SELECT id FROM public_chats").fetchall()
            }


    async def veroeffentliche(self, chat: StoredChat) -> None:
        """Anlegen oder nachziehen. Idempotent.

        ``created_at`` bleibt beim ersten Teilen stehen: es beantwortet
        "seit wann ist das oeffentlich" und nicht "wann wurde zuletzt
        geschrieben".
        """
        await asyncio.to_thread(self._veroeffentliche, chat)

    def _veroeffentliche(self, chat: StoredChat) -> None:
        sichtbar = ohne_versteckte(chat.messages)
        jetzt = _jetzt()

        titel = crypto.feld_ein(chat.info.title, self._key)
        blob = crypto.feld_ein(
            json.dumps(sichtbar, ensure_ascii=False), self._key
        )

        with self._open() as conn:
            alt = conn.execute(
                "SELECT created_at FROM public_chats WHERE id = ?",
                (chat.info.id,),
            ).fetchone()
            seit = alt["created_at"] if alt is not None else jetzt

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
                    titel,
                    chat.info.model,
                    blob,
                    len(sichtbar),
                    seit,
                    jetzt,
                ),
            )

    async def zuruecknehmen(self, chat_id: str) -> bool:
        """True, wenn wirklich eine Zeile verschwunden ist."""
        return await asyncio.to_thread(self._zuruecknehmen, chat_id)

    def _zuruecknehmen(self, chat_id: str) -> bool:
        with self._open() as conn:
            cursor = conn.execute(
                "DELETE FROM public_chats WHERE id = ?", (chat_id,)
            )
            return cursor.rowcount > 0

    async def alle_zuruecknehmen(self) -> int:
        return await asyncio.to_thread(self._alle_zuruecknehmen)

    def _alle_zuruecknehmen(self) -> int:
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


def _jetzt() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")
