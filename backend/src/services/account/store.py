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
  auth_salt    BLOB NOT NULL,
  auth_hash    BLOB NOT NULL,
  kek_salt     BLOB NOT NULL,
  wrapped_dek  BLOB NOT NULL,
  avatar       BLOB,
  avatar_type  TEXT,
  created_at   TEXT NOT NULL
);
"""


@dataclass(frozen=True, slots=True)
class Account:
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

    async def get(self) -> Account | None:
        return await asyncio.to_thread(self._get)

    def _get(self) -> Account | None:
        with self._open() as conn:
            row = conn.execute(
                "SELECT username, avatar IS NOT NULL AS hat FROM account WHERE id = 1"
            ).fetchone()
        return (
            Account(username=row["username"], has_avatar=bool(row["hat"]))
            if row
            else None
        )

    async def create(self, username: str, password: str) -> bytes:
        return await asyncio.to_thread(self._create, username, password)

    def _create(self, username: str, password: str) -> bytes:
        auth_salt = crypto.new_salt()
        kek_salt = crypto.new_salt()
        dek = crypto.new_data_key()

        with self._open() as conn:
            conn.execute(
                "INSERT INTO account "
                "(id, username, auth_salt, auth_hash, kek_salt, wrapped_dek, created_at) "
                "VALUES (1, ?, ?, ?, ?, ?, ?)",
                (
                    username,
                    auth_salt,
                    crypto.password_hash(password, auth_salt),
                    kek_salt,
                    crypto.wrap_key(dek, password, kek_salt),
                    datetime.now(UTC).isoformat(timespec="seconds"),
                ),
            )
        logger.info("Account created: %s", username)
        return dek

    async def delete(self) -> None:
        await asyncio.to_thread(self._delete)

    def _delete(self) -> None:
        with self._open() as conn:
            conn.execute("DELETE FROM account WHERE id = 1")
        logger.info("Account deleted")

    async def unlock(self, username: str, password: str) -> bytes | None:
        return await asyncio.to_thread(self._unlock, username, password)

    def _unlock(self, username: str, password: str) -> bytes | None:
        with self._open() as conn:
            row = conn.execute(
                "SELECT username, auth_salt, auth_hash, kek_salt, wrapped_dek "
                "FROM account WHERE id = 1"
            ).fetchone()

        if row is None or row["username"] != username:
            return None
        if not crypto.password_matches(password, row["auth_salt"], row["auth_hash"]):
            return None

        try:
            return crypto.unwrap_key(
                row["wrapped_dek"], password, row["kek_salt"]
            )
        except Exception:  # noqa: BLE001
            logger.exception("Could not unwrap the data key")
            return None

    async def rename(self, username: str) -> None:
        await asyncio.to_thread(self._rename, username)

    def _rename(self, username: str) -> None:
        with self._open() as conn:
            conn.execute("UPDATE account SET username = ? WHERE id = 1", (username,))
        logger.info("Account renamed: %s", username)

    async def change_password(self, current: str, new: str) -> bool:
        return await asyncio.to_thread(self._change_password, current, new)

    def _change_password(self, current: str, new: str) -> bool:
        with self._open() as conn:
            row = conn.execute(
                "SELECT auth_salt, auth_hash, kek_salt, wrapped_dek "
                "FROM account WHERE id = 1"
            ).fetchone()

            if row is None:
                return False
            if not crypto.password_matches(current, row["auth_salt"], row["auth_hash"]):
                return False

            try:
                dek = crypto.unwrap_key(
                    row["wrapped_dek"], current, row["kek_salt"]
                )
            except Exception:  # noqa: BLE001
                logger.exception("Could not unwrap the data key")
                return False

            auth_salt = crypto.new_salt()
            kek_salt = crypto.new_salt()

            conn.execute(
                "UPDATE account SET auth_salt = ?, auth_hash = ?, "
                "kek_salt = ?, wrapped_dek = ? WHERE id = 1",
                (
                    auth_salt,
                    crypto.password_hash(new, auth_salt),
                    kek_salt,
                    crypto.wrap_key(dek, new, kek_salt),
                ),
            )

        logger.info("Password changed")
        return True

    async def set_avatar(self, image: bytes, media_type: str) -> None:
        await asyncio.to_thread(self._set_avatar, image, media_type)

    def _set_avatar(self, image: bytes, media_type: str) -> None:
        with self._open() as conn:
            conn.execute(
                "UPDATE account SET avatar = ?, avatar_type = ? WHERE id = 1",
                (image, media_type),
            )

    async def clear_avatar(self) -> None:
        await asyncio.to_thread(self._clear_avatar)

    def _clear_avatar(self) -> None:
        with self._open() as conn:
            conn.execute(
                "UPDATE account SET avatar = NULL, avatar_type = NULL WHERE id = 1"
            )

    async def get_avatar(self) -> tuple[bytes, str] | None:
        return await asyncio.to_thread(self._get_avatar)

    def _get_avatar(self) -> tuple[bytes, str] | None:
        with self._open() as conn:
            row = conn.execute(
                "SELECT avatar, avatar_type FROM account WHERE id = 1"
            ).fetchone()
        if row is None or row["avatar"] is None:
            return None
        return bytes(row["avatar"]), row["avatar_type"] or "image/png"
