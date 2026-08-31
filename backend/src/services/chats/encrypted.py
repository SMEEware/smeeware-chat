"""Ein ChatStore, der verschluesselt, was durch ihn hindurchgeht.

Bewusst eine Huelle um den SQLite-Speicher und keine Aenderung an ihm: der
Datenschluessel gehoert zur Sitzung, nicht zur Anwendung. Der SQLite-Speicher
bleibt ein Singleton mit seiner Datei, und je Anfrage legt sich diese duenne
Schicht mit dem Schluessel der gerade angemeldeten Person darum.

Verschluesselt werden Titel und Nachrichten -- alles, was Inhalt traegt.
Nicht verschluesselt werden id, Modell, Zeitstempel und die Anzahl: danach
wird sortiert und gezaehlt, und aus "17 Nachrichten am Dienstag" laesst sich
nicht lesen, worum es ging.
"""

from __future__ import annotations

from dataclasses import replace
from typing import Any

from src.core.logging import get_logger
from src.services.account import crypto
from src.services.chats.base import ChatInfo, ChatStore, StoredChat

logger = get_logger(__name__)

# Die Feld-Verschluesselung liegt bei der Krypto, nicht hier: die Hinweise
# brauchen dieselbe, und zweimal dasselbe waere zweimal zu pflegen.
_ein = crypto.feld_ein
_aus = crypto.feld_aus


class EncryptedChatStore:
    def __init__(self, inner: ChatStore, key: bytes) -> None:
        self._inner = inner
        self._key = key

    async def ensure_schema(self) -> None:
        await self._inner.ensure_schema()

    async def list(self, limit: int = 50, offset: int = 0) -> list[ChatInfo]:
        infos = await self._inner.list(limit=limit, offset=offset)
        return [self._info_aus(info) for info in infos]

    async def get(self, chat_id: str) -> StoredChat | None:
        chat = await self._inner.get(chat_id)
        return None if chat is None else self._chat_aus(chat)

    async def exists(self, chat_id: str) -> bool:
        return await self._inner.exists(chat_id)

    async def upsert(
        self,
        chat_id: str,
        messages: list[dict[str, Any]],
        *,
        title: str | None = None,
        model: str | None = None,
    ) -> StoredChat:
        # Der Titel muss HIER entstehen, nicht in der Ablage darunter.
        #
        # Ohne Titel leitet die Ablage einen aus der ersten Nutzer-Nachricht
        # ab und kuerzt ihn auf 60 Zeichen. Die Nachrichten sind zu dem
        # Zeitpunkt aber schon verschluesselt -- sie schnitte also ein
        # Chiffrat mittendrin durch, und das laesst sich nie wieder
        # entschluesseln. Genau das hat vorher jeden neuen Chat als
        # "[locked]" enden lassen.
        #
        # Nur beim ersten Speichern: danach traegt der Chat seinen Titel,
        # und ein umbenannter soll nicht bei jedem Turn zurueckfallen.
        klartitel = title
        if klartitel is None and not await self._inner.exists(chat_id):
            klartitel = _titel_aus(messages)

        chat = await self._inner.upsert(
            chat_id,
            [self._nachricht_ein(n) for n in messages],
            title=_ein(klartitel, self._key) if klartitel is not None else None,
            model=model,
        )
        return self._chat_aus(chat)

    async def rename(self, chat_id: str, title: str) -> StoredChat:
        chat = await self._inner.rename(chat_id, _ein(title, self._key))
        return self._chat_aus(chat)

    async def delete(self, chat_id: str) -> bool:
        return await self._inner.delete(chat_id)

    async def delete_all(self) -> int:
        return await self._inner.delete_all()

    # -- Innereien ------------------------------------------------------- #

    def _nachricht_ein(self, nachricht: dict[str, Any]) -> dict[str, Any]:
        """Nur der Inhalt wandert ins Chiffrat, die Struktur bleibt.

        Rolle und Reihenfolge sind kein Geheimnis, und sie unangetastet zu
        lassen heisst, dass die Ablage weiter zaehlen und pruefen kann, ohne
        den Schluessel zu kennen.
        """
        kopie = dict(nachricht)
        for feld in ("content", "reasoning"):
            wert = kopie.get(feld)
            if isinstance(wert, str) and wert:
                kopie[feld] = _ein(wert, self._key)
        if isinstance(kopie.get("parts"), list):
            kopie["parts"] = [self._teil_ein(t) for t in kopie["parts"]]
        if isinstance(kopie.get("attachments"), list):
            kopie["attachments"] = [self._anhang_ein(a) for a in kopie["attachments"]]
        return kopie

    def _nachricht_aus(self, nachricht: dict[str, Any]) -> dict[str, Any]:
        kopie = dict(nachricht)
        for feld in ("content", "reasoning"):
            wert = kopie.get(feld)
            if isinstance(wert, str) and wert:
                kopie[feld] = _aus(wert, self._key)
        if isinstance(kopie.get("parts"), list):
            kopie["parts"] = [self._teil_aus(t) for t in kopie["parts"]]
        if isinstance(kopie.get("attachments"), list):
            kopie["attachments"] = [self._anhang_aus(a) for a in kopie["attachments"]]
        return kopie

    def _teil_ein(self, teil: dict) -> dict:
        if not isinstance(teil, dict):
            return teil
        kopie = dict(teil)
        for feld in ("text", "preview"):
            wert = kopie.get(feld)
            if isinstance(wert, str) and wert:
                kopie[feld] = _ein(wert, self._key)
        return kopie

    def _teil_aus(self, teil: dict) -> dict:
        if not isinstance(teil, dict):
            return teil
        kopie = dict(teil)
        for feld in ("text", "preview"):
            wert = kopie.get(feld)
            if isinstance(wert, str) and wert:
                kopie[feld] = _aus(wert, self._key)
        return kopie

    def _anhang_ein(self, anhang: dict) -> dict:
        if not isinstance(anhang, dict):
            return anhang
        kopie = dict(anhang)
        # Dateiname und eingebetteter Text verraten den Inhalt; Groesse und
        # Sorte nicht.
        for feld in ("name", "text", "path"):
            wert = kopie.get(feld)
            if isinstance(wert, str) and wert:
                kopie[feld] = _ein(wert, self._key)
        return kopie

    def _anhang_aus(self, anhang: dict) -> dict:
        if not isinstance(anhang, dict):
            return anhang
        kopie = dict(anhang)
        for feld in ("name", "text", "path"):
            wert = kopie.get(feld)
            if isinstance(wert, str) and wert:
                kopie[feld] = _aus(wert, self._key)
        return kopie

    def _info_aus(self, info: ChatInfo) -> ChatInfo:
        try:
            return replace(info, title=_aus(info.title, self._key))
        except Exception:  # noqa: BLE001
            # Ein Chat aus einer anderen Passwort-Aera. Ihn stumm zu
            # verschlucken waere schlimmer als ein sichtbarer Platzhalter.
            return replace(info, title="[locked]")

    def _chat_aus(self, chat: StoredChat) -> StoredChat:
        return replace(
            chat,
            info=self._info_aus(chat.info),
            messages=[self._nachricht_aus(n) for n in chat.messages],
        )


# Dieselbe Regel wie in der Ablage -- nur eben auf dem Klartext.
MAX_TITEL = 60
FALLBACK_TITEL = "New chat"


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
