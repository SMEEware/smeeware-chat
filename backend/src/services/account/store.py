"""Das eine Konto dieser Installation.

Eine Zeile, erzwungen ueber ``CHECK (id = 1)``: das hier ist eine App fuer
eine Person auf einer Maschine, kein Mandantensystem. Die Einschraenkung im
Schema ist ehrlicher als eine Konvention, an die sich spaeter niemand
erinnert.

Liegt in derselben Datei wie die Chats -- wer die Datenbank mitnimmt, nimmt
beides mit, und getrennte Dateien wuerden nur die Illusion einer Trennung
erzeugen.
"""

from __future__ import annotations

import asyncio
import sqlite3
from contextlib import contextmanager
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from src.core.logging import get_logger
from src.services.account import crypto

logger = get_logger(__name__)

SCHEMA = """
CREATE TABLE IF NOT EXISTS account (
  id           INTEGER PRIMARY KEY CHECK (id = 1),
  username     TEXT NOT NULL,
  auth_salt    BLOB NOT NULL,     -- fuer den Pruef-Hash
  auth_hash    BLOB NOT NULL,
  kek_salt     BLOB NOT NULL,     -- fuer den Schluessel, der den DEK einpackt
  wrapped_dek  BLOB NOT NULL,
  avatar       BLOB,
  avatar_type  TEXT,
  created_at   TEXT NOT NULL
);
"""


@dataclass(frozen=True, slots=True)
class Konto:
    username: str
    has_avatar: bool


class AccountStore:
    def __init__(self, path: Path) -> None:
        self._path = path

    @contextmanager
    def _open(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self._path, timeout=10.0)
        try:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA busy_timeout=5000")
            conn.row_factory = sqlite3.Row
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

    async def get(self) -> Konto | None:
        return await asyncio.to_thread(self._get)

    def _get(self) -> Konto | None:
        with self._open() as conn:
            zeile = conn.execute(
                "SELECT username, avatar IS NOT NULL AS hat FROM account WHERE id = 1"
            ).fetchone()
        return (
            Konto(username=zeile["username"], has_avatar=bool(zeile["hat"]))
            if zeile
            else None
        )

    async def create(self, username: str, password: str) -> bytes:
        """Legt das Konto an und gibt den frischen Datenschluessel zurueck.

        Der DEK entsteht genau hier ein einziges Mal. Ab jetzt haengt jeder
        Chat an ihm, und er selbst haengt am Passwort.
        """
        return await asyncio.to_thread(self._create, username, password)

    def _create(self, username: str, password: str) -> bytes:
        auth_salz = crypto.neues_salz()
        kek_salz = crypto.neues_salz()
        dek = crypto.neuer_datenschluessel()

        with self._open() as conn:
            conn.execute(
                "INSERT INTO account "
                "(id, username, auth_salt, auth_hash, kek_salt, wrapped_dek, created_at) "
                "VALUES (1, ?, ?, ?, ?, ?, ?)",
                (
                    username,
                    auth_salz,
                    crypto.passwort_hash(password, auth_salz),
                    kek_salz,
                    crypto.schluessel_einpacken(dek, password, kek_salz),
                    datetime.now(UTC).isoformat(timespec="seconds"),
                ),
            )
        logger.info("Konto angelegt: %s", username)
        return dek

    async def delete(self) -> None:
        """Loescht die Kontozeile -- Passwort-Hash, eingepackter Schluessel und
        Profilbild inklusive.

        Danach ist die Installation wieder im Auslieferungszustand: die
        Anmeldeseite zeigt das Einrichten, und ein frisches Konto bekommt
        einen neuen Datenschluessel. Die mit dem alten verschluesselten Chats
        waeren ohne diesen Schluessel ohnehin nie wieder lesbar -- sie werden
        an anderer Stelle mitgeloescht.
        """
        await asyncio.to_thread(self._delete)

    def _delete(self) -> None:
        with self._open() as conn:
            conn.execute("DELETE FROM account WHERE id = 1")
        logger.info("Konto geloescht")

    async def unlock(self, username: str, password: str) -> bytes | None:
        """Passwort pruefen und den Datenschluessel auspacken.

        None heisst: Name oder Passwort falsch. Bewusst nicht unterschieden --
        welches von beidem daneben lag, geht einen Fremden nichts an.
        """
        return await asyncio.to_thread(self._unlock, username, password)

    def _unlock(self, username: str, password: str) -> bytes | None:
        with self._open() as conn:
            zeile = conn.execute(
                "SELECT username, auth_salt, auth_hash, kek_salt, wrapped_dek "
                "FROM account WHERE id = 1"
            ).fetchone()

        if zeile is None or zeile["username"] != username:
            return None
        if not crypto.passwort_stimmt(password, zeile["auth_salt"], zeile["auth_hash"]):
            return None

        try:
            return crypto.schluessel_auspacken(
                zeile["wrapped_dek"], password, zeile["kek_salt"]
            )
        except Exception:  # noqa: BLE001 -- kaputtes Paket ist kein Absturzgrund
            logger.exception("Datenschluessel liess sich nicht auspacken")
            return None

    async def rename(self, username: str) -> None:
        await asyncio.to_thread(self._rename, username)

    def _rename(self, username: str) -> None:
        with self._open() as conn:
            conn.execute("UPDATE account SET username = ? WHERE id = 1", (username,))
        logger.info("Konto umbenannt: %s", username)

    async def change_password(self, alt: str, neu: str) -> bool:
        """Passwort tauschen, ohne die Chats anzufassen.

        Genau hierfuer gibt es den Umweg ueber den eingepackten Schluessel:
        die Daten haengen am DEK, der DEK am Passwort. Beim Wechsel wird er
        einmal aus- und mit dem neuen Passwort wieder eingepackt -- kein
        einziger Chat muss dafuer neu verschluesselt werden.

        False heisst: das alte Passwort war falsch. Dann bleibt alles, wie
        es war.
        """
        return await asyncio.to_thread(self._change_password, alt, neu)

    def _change_password(self, alt: str, neu: str) -> bool:
        with self._open() as conn:
            zeile = conn.execute(
                "SELECT auth_salt, auth_hash, kek_salt, wrapped_dek "
                "FROM account WHERE id = 1"
            ).fetchone()

            if zeile is None:
                return False
            if not crypto.passwort_stimmt(alt, zeile["auth_salt"], zeile["auth_hash"]):
                return False

            try:
                dek = crypto.schluessel_auspacken(
                    zeile["wrapped_dek"], alt, zeile["kek_salt"]
                )
            except Exception:  # noqa: BLE001
                logger.exception("Datenschluessel liess sich nicht auspacken")
                return False

            # Frische Salze fuer beides: ein Passwortwechsel, der die alten
            # behielte, waere nur halb einer.
            auth_salz = crypto.neues_salz()
            kek_salz = crypto.neues_salz()

            conn.execute(
                "UPDATE account SET auth_salt = ?, auth_hash = ?, "
                "kek_salt = ?, wrapped_dek = ? WHERE id = 1",
                (
                    auth_salz,
                    crypto.passwort_hash(neu, auth_salz),
                    kek_salz,
                    crypto.schluessel_einpacken(dek, neu, kek_salz),
                ),
            )

        logger.info("Passwort gewechselt")
        return True

    async def set_avatar(self, bild: bytes, medientyp: str) -> None:
        await asyncio.to_thread(self._set_avatar, bild, medientyp)

    def _set_avatar(self, bild: bytes, medientyp: str) -> None:
        with self._open() as conn:
            conn.execute(
                "UPDATE account SET avatar = ?, avatar_type = ? WHERE id = 1",
                (bild, medientyp),
            )

    async def get_avatar(self) -> tuple[bytes, str] | None:
        return await asyncio.to_thread(self._get_avatar)

    def _get_avatar(self) -> tuple[bytes, str] | None:
        with self._open() as conn:
            zeile = conn.execute(
                "SELECT avatar, avatar_type FROM account WHERE id = 1"
            ).fetchone()
        if zeile is None or zeile["avatar"] is None:
            return None
        return bytes(zeile["avatar"]), zeile["avatar_type"] or "image/png"
