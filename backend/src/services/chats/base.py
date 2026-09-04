"""Vertrag des Chat-Speichers.

Die Routen kennen nur diese Typen -- ob dahinter SQLite, Postgres oder ein
fremder Dienst steckt, sehen sie nicht.

Nachrichten sind bewusst rohe Dicts: gespeichert wird das Format des
Frontends (role, content, parts[], id, model, durationMs, aborted, ...), und
das Backend interpretiert davon nichts. Wer hier ein engeres Modell
einzieht, verliert genau die Felder, die den Verlauf ausmachen.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol


@dataclass(frozen=True, slots=True)
class ChatInfo:
    """Die Zusammenfassung fuer die Liste -- ohne die Nachrichten selbst."""

    id: str
    title: str
    model: str | None
    message_count: int
    created_at: str
    updated_at: str


@dataclass(frozen=True, slots=True)
class StoredChat:
    """Ein vollstaendiger Verlauf: Zusammenfassung plus Nachrichten."""

    info: ChatInfo
    messages: list[dict[str, Any]]


class ChatStore(Protocol):
    """Ablage fuer Chat-Verlaeufe."""

    async def ensure_schema(self) -> None:
        """Legt Tabelle und Index an, falls sie fehlen."""
        ...

    async def list(self, limit: int = 50, offset: int = 0) -> list[ChatInfo]:
        """Zusammenfassungen, zuletzt geaenderte zuerst."""
        ...

    async def get(self, chat_id: str) -> StoredChat | None:
        """Der volle Verlauf -- None, wenn es ihn nicht gibt."""
        ...

    async def exists(self, chat_id: str) -> bool:
        """Gibt es den Chat schon? Ohne den Verlauf zu laden.

        Fuer den einen Aufrufer, der nur wissen muss, ob ein Titel bereits
        vergeben ist -- ``get`` dafuer zu nehmen hiesse, jedes Mal den
        ganzen Verlauf durch die Entschluesselung zu schicken.
        """
        ...

    async def upsert(
        self,
        chat_id: str,
        messages: list[dict[str, Any]],
        *,
        title: str | None = None,
        model: str | None = None,
    ) -> StoredChat:
        """Legt an oder ueberschreibt die Nachrichten. Idempotent."""
        ...

    async def rename(self, chat_id: str, title: str) -> StoredChat:
        """Aendert nur den Titel. Wirft NotFoundError, wenn es den Chat nicht gibt."""
        ...

    async def delete(self, chat_id: str) -> bool:
        """True, wenn wirklich eine Zeile verschwunden ist."""
        ...

    async def delete_all(self) -> int:
        """Leert die Ablage und meldet, wie viele Chats verschwunden sind.

        Eigene Methode statt einer Schleife ueber ``delete``: das ist eine
        Anweisung statt N, und sie kann nicht auf halbem Weg steckenbleiben
        und einen halb geleerten Verlauf hinterlassen.
        """
        ...
