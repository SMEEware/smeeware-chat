from __future__ import annotations

import secrets
import time
from dataclasses import dataclass

from src.core.logging import get_logger

logger = get_logger(__name__)


@dataclass(slots=True)
class Session:
    dek: bytes
    username: str
    expires: float


class SessionStore:
    def __init__(self, ttl_seconds: float = 12 * 3600) -> None:
        self._ttl = ttl_seconds
        self._sessions: dict[str, Session] = {}

    def open(self, username: str, dek: bytes) -> str:
        self._cleanup()
        identifier = secrets.token_urlsafe(32)
        self._sessions[identifier] = Session(
            dek=dek, username=username, expires=time.time() + self._ttl
        )
        return identifier

    def fetch(self, identifier: str | None) -> Session | None:
        if not identifier:
            return None
        session = self._sessions.get(identifier)
        if session is None:
            return None
        if session.expires <= time.time():
            del self._sessions[identifier]
            return None
        session.expires = time.time() + self._ttl
        return session

    def active_key(self) -> bytes | None:
        self._cleanup()
        for session in self._sessions.values():
            return session.dek
        return None

    def close(self, identifier: str | None) -> None:
        if identifier:
            self._sessions.pop(identifier, None)

    def close_all(self) -> None:
        self._sessions.clear()

    def _cleanup(self) -> None:
        now = time.time()
        for identifier in [
            k for k, s in self._sessions.items() if s.expires <= now
        ]:
            del self._sessions[identifier]
