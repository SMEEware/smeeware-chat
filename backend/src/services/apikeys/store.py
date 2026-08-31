"""Die API-Schluessel dieser Installation.

Liegt in derselben Datei wie Konto und Chats -- wer die Datenbank mitnimmt,
nimmt alles mit, und getrennte Dateien erzeugten nur die Illusion einer
Trennung.

Gespeichert wird nie der Schluessel selbst, sondern sein SHA-256. Das ist der
gleiche Gedanke wie beim Passwort: was in der Datei liegt, soll niemanden
weiterbringen, der sie in die Hand bekommt. Ein Passwort braucht dafuer einen
langsamen Hash (scrypt), weil Menschen kurze, ratbare Passwoerter waehlen; ein
API-Schluessel dagegen ist 32 zufaellige Bytes -- gegen die ist ein einzelner
SHA-256 nicht zu erraten, und schnell nachzuschlagen sein soll er, weil er bei
jeder Anfrage geprueft wird.

Zum Anzeigen bleibt ein Praefix im Klartext: die ersten Zeichen samt Marke,
damit man in einer Liste erkennt, welcher Schluessel welcher ist, ohne dass
der Rest je wieder sichtbar wuerde.
"""

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
  prefix        TEXT NOT NULL,          -- Klartext, nur zum Wiedererkennen
  token_sha256  TEXT NOT NULL UNIQUE,   -- der Schluessel selbst liegt nie hier
  created_at    TEXT NOT NULL,          -- ISO 8601, UTC
  last_used_at  TEXT
);
CREATE INDEX IF NOT EXISTS api_keys_token ON api_keys (token_sha256);
"""

# Die Marke vorne macht einen durchgesickerten Schluessel als solchen
# erkennbar -- Scanner bei GitHub und Co. suchen nach genau solchen
# Praefixen und koennen warnen, statt dass er unbemerkt gueltig bleibt.
MARKE = "sk_smee_"
# Wie viel vom Anfang in der Liste steht: die Marke plus ein paar Zeichen,
# genug zum Auseinanderhalten, zu wenig zum Erraten.
PRAEFIX_LEN = len(MARKE) + 6


@dataclass(frozen=True, slots=True)
class Schluessel:
    """Was von einem Schluessel sichtbar bleibt -- nie der Schluessel selbst."""

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

    async def create(self, name: str) -> tuple[Schluessel, str]:
        """Legt einen Schluessel an und gibt ihn genau dieses eine Mal heraus.

        Was zurueckkommt, ist der Metadatensatz *und* der Klartext. Danach
        kennt ihn niemand mehr -- in der Datei liegt nur sein Hash. Wer ihn
        nicht notiert, muss einen neuen erzeugen; das ist Absicht und kein
        Mangel.
        """
        return await asyncio.to_thread(self._create, name)

    def _create(self, name: str) -> tuple[Schluessel, str]:
        secret = MARKE + secrets.token_urlsafe(32)
        eintrag = Schluessel(
            id=uuid.uuid4().hex,
            name=name,
            prefix=secret[:PRAEFIX_LEN],
            created_at=datetime.now(UTC).isoformat(timespec="seconds"),
            last_used_at=None,
        )
        with self._open() as conn:
            conn.execute(
                "INSERT INTO api_keys "
                "(id, name, prefix, token_sha256, created_at, last_used_at) "
                "VALUES (?, ?, ?, ?, ?, NULL)",
                (eintrag.id, eintrag.name, eintrag.prefix, _hash(secret),
                 eintrag.created_at),
            )
        logger.info("API-Schluessel angelegt: %s (%s)", name, eintrag.prefix)
        return eintrag, secret

    async def list(self) -> list[Schluessel]:
        return await asyncio.to_thread(self._list)

    def _list(self) -> list[Schluessel]:
        with self._open() as conn:
            zeilen = conn.execute(
                "SELECT id, name, prefix, created_at, last_used_at "
                "FROM api_keys ORDER BY created_at DESC"
            ).fetchall()
        return [
            Schluessel(
                id=z["id"],
                name=z["name"],
                prefix=z["prefix"],
                created_at=z["created_at"],
                last_used_at=z["last_used_at"],
            )
            for z in zeilen
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
        """Alle Schluessel weg -- gehoert zum Loeschen des Kontos.

        Ein Schluessel, der das Loeschen des Kontos ueberlebte, waere ein
        Ausweis fuer ein Konto, das es nicht mehr gibt.
        """
        return await asyncio.to_thread(self._delete_all)

    def _delete_all(self) -> int:
        with self._open() as conn:
            cur = conn.execute("DELETE FROM api_keys")
        return cur.rowcount

    async def verify(self, secret: str) -> bool:
        """Ist das ein gueltiger Schluessel? Nebenbei: wann zuletzt benutzt.

        Der Vergleich laeuft ueber den Hash und damit ueber den eindeutigen
        Index -- kein Durchgehen aller Zeilen, keine Zeitunterschiede, aus
        denen sich etwas ablesen liesse.
        """
        if not secret:
            return False
        return await asyncio.to_thread(self._verify, secret)

    def _verify(self, secret: str) -> bool:
        digest = _hash(secret)
        jetzt = datetime.now(UTC).isoformat(timespec="seconds")
        with self._open() as conn:
            cur = conn.execute(
                "UPDATE api_keys SET last_used_at = ? WHERE token_sha256 = ?",
                (jetzt, digest),
            )
        return cur.rowcount > 0
