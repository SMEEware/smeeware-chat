"""Chat-Verlaeufe in einer SQLite-Datei.

Eine Zeile je Chat, nicht je Nachricht: der Verlauf wird immer komplett
geladen, und ``parts[]`` ist verschachtelt -- eine eigene Nachrichtentabelle
brauechte also Joins und ein Schema fuer Daten, die das Backend gar nicht
liest. ``message_count`` wird beim Schreiben mitgefuehrt, damit die Liste die
JSON-Blobs nie anfassen muss.

Nebenlaeufigkeit: jede Operation oeffnet ihre eigene Verbindung und laeuft
komplett in ``asyncio.to_thread``. Keine geteilte Verbindung, kein
``check_same_thread=False``, kein eigener Lock -- damit stellt sich die Frage
nach Thread-Affinitaet erst gar nicht. WAL und ``busy_timeout`` regeln den
Rest.
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

from src.core.exceptions import NotFoundError
from src.core.logging import get_logger
from src.services.chats.base import ChatInfo, StoredChat

logger = get_logger(__name__)

SCHEMA = """
CREATE TABLE IF NOT EXISTS chats (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  model         TEXT,
  messages      TEXT NOT NULL,      -- JSON-Array, wie vom Frontend geliefert
  message_count INTEGER NOT NULL,
  created_at    TEXT NOT NULL,      -- ISO 8601, UTC
  updated_at    TEXT NOT NULL,
  user_id       TEXT                -- bleibt NULL, bis es Auth gibt
);
CREATE INDEX IF NOT EXISTS chats_updated_at ON chats (updated_at DESC);
"""

SPALTEN = "id, title, model, messages, message_count, created_at, updated_at"

# Ein aus der ersten Frage abgeleiteter Titel soll in eine Seitenleiste
# passen, nicht sie sprengen.
MAX_TITEL = 60
FALLBACK_TITEL = "Neuer Chat"

# Wie lange SQLite auf eine gesperrte Datei wartet, bevor es aufgibt (ms).
BUSY_TIMEOUT_MS = 5000


class SqliteChatStore:
    """``ChatStore`` auf einer einzelnen SQLite-Datei."""

    def __init__(self, path: Path) -> None:
        self._path = Path(path)

    # -- Schema --------------------------------------------------------- #

    async def ensure_schema(self) -> None:
        await asyncio.to_thread(self._ensure_schema)

    def _ensure_schema(self) -> None:
        # Das Verzeichnis kann fehlen: die Datei liegt ausserhalb von git.
        self._path.parent.mkdir(parents=True, exist_ok=True)
        with self._open() as conn:
            conn.executescript(SCHEMA)
        logger.info("Chat-Speicher bereit: %s", self._path)

    # -- Lesen ---------------------------------------------------------- #

    async def list(self, limit: int = 50, offset: int = 0) -> list[ChatInfo]:
        return await asyncio.to_thread(self._list, limit, offset)

    def _list(self, limit: int, offset: int) -> list[ChatInfo]:
        with self._open() as conn:
            zeilen = conn.execute(
                "SELECT id, title, model, message_count, created_at, updated_at "
                "FROM chats ORDER BY updated_at DESC LIMIT ? OFFSET ?",
                (limit, offset),
            ).fetchall()
        return [_zu_info(zeile) for zeile in zeilen]

    async def get(self, chat_id: str) -> StoredChat | None:
        return await asyncio.to_thread(self._get, chat_id)

    def _get(self, chat_id: str) -> StoredChat | None:
        with self._open() as conn:
            zeile = self._lesen(conn, chat_id)
        return _zu_chat(zeile) if zeile is not None else None

    # -- Schreiben ------------------------------------------------------ #

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
        jetzt = _jetzt()
        blob = json.dumps(messages, ensure_ascii=False)

        with self._open() as conn:
            alt = conn.execute(
                "SELECT title, model, created_at FROM chats WHERE id = ?",
                (chat_id,),
            ).fetchone()

            if alt is None:
                created_at = jetzt
                neuer_titel = title or _titel_aus(messages)
                neues_modell = model
            else:
                # created_at bleibt unangetastet -- ein Ueberschreiben des
                # Verlaufs ist kein neuer Chat.
                created_at = alt["created_at"]
                # Ein einmal vergebener Titel ueberlebt jeden weiteren Turn;
                # sonst wanderte er bei jedem Speichern mit der ersten Frage.
                neuer_titel = title or alt["title"] or _titel_aus(messages)
                neues_modell = model if model is not None else alt["model"]

            conn.execute(
                f"INSERT INTO chats ({SPALTEN}, user_id) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, NULL) "
                "ON CONFLICT(id) DO UPDATE SET "
                "title = excluded.title, model = excluded.model, "
                "messages = excluded.messages, "
                "message_count = excluded.message_count, "
                "updated_at = excluded.updated_at",
                (
                    chat_id,
                    neuer_titel,
                    neues_modell,
                    blob,
                    len(messages),
                    created_at,
                    jetzt,
                ),
            )

        return StoredChat(
            info=ChatInfo(
                id=chat_id,
                title=neuer_titel,
                model=neues_modell,
                message_count=len(messages),
                created_at=created_at,
                updated_at=jetzt,
            ),
            messages=messages,
        )

    async def rename(self, chat_id: str, title: str) -> StoredChat:
        return await asyncio.to_thread(self._rename, chat_id, title)

    def _rename(self, chat_id: str, title: str) -> StoredChat:
        with self._open() as conn:
            geaendert = conn.execute(
                "UPDATE chats SET title = ?, updated_at = ? WHERE id = ?",
                (title, _jetzt(), chat_id),
            ).rowcount
            if not geaendert:
                raise NotFoundError(f"Chat {chat_id!r} does not exist.")
            zeile = self._lesen(conn, chat_id)

        assert zeile is not None  # gerade in derselben Transaktion geschrieben
        return _zu_chat(zeile)

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

    # -- Innereien ------------------------------------------------------ #

    def _lesen(self, conn: sqlite3.Connection, chat_id: str) -> sqlite3.Row | None:
        return conn.execute(
            f"SELECT {SPALTEN} FROM chats WHERE id = ?", (chat_id,)
        ).fetchone()

    @contextmanager
    def _open(self) -> Iterator[sqlite3.Connection]:
        """Frische Verbindung je Aufruf, Transaktion inklusive.

        ``with sqlite3.connect(...)`` allein wuerde nur committen, nicht
        schliessen -- deshalb der eigene Kontextmanager.
        """
        conn = sqlite3.connect(self._path, timeout=BUSY_TIMEOUT_MS / 1000)
        conn.row_factory = sqlite3.Row
        try:
            # WAL: Lesen blockiert Schreiben nicht. busy_timeout: kurze
            # Schreibkollisionen aussitzen statt sofort "database is locked".
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute(f"PRAGMA busy_timeout={BUSY_TIMEOUT_MS}")
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()


def _zu_info(zeile: sqlite3.Row) -> ChatInfo:
    return ChatInfo(
        id=zeile["id"],
        title=zeile["title"],
        model=zeile["model"],
        message_count=zeile["message_count"],
        created_at=zeile["created_at"],
        updated_at=zeile["updated_at"],
    )


def _zu_chat(zeile: sqlite3.Row) -> StoredChat:
    return StoredChat(info=_zu_info(zeile), messages=json.loads(zeile["messages"]))


def _jetzt() -> str:
    """Zeitstempel setzt immer der Server -- Uhren von Clients luegen."""
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _titel_aus(messages: list[dict[str, Any]]) -> str:
    """Der Titel kommt aus der ersten Frage -- so wie in jedem Chat-Client."""
    for nachricht in messages:
        if nachricht.get("role") != "user":
            continue
        inhalt = nachricht.get("content")
        if not isinstance(inhalt, str):
            continue
        text = " ".join(inhalt.split())
        if text:
            return text[:MAX_TITEL]
    return FALLBACK_TITEL
