"""Ereignisse vom Server zum Browser.

Bisher lief alles in eine Richtung: der Browser fragt, das Backend antwortet.
Ein Hinweis, der waehrend eines Turns entsteht -- oder spaeter ein Fenster mit
einem Stream --, hat diesen Weg nicht. Dafuer dieser Bus.

Jeder verbundene Client bekommt eine eigene Warteschlange. Ist sie voll,
faellt das aelteste Ereignis heraus, statt dass der Absender wartet: ein
langsamer Browser darf einen laufenden Turn nicht ausbremsen. Ein verpasster
Hinweis ist ein kleineres Uebel als ein haengender Chat.

Prozessweit und nicht je Sitzung: die Anwendung hat genau ein Konto, und der
Stream selbst verlangt eine gueltige Sitzung. Wer nicht angemeldet ist,
kommt gar nicht erst an den Bus.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from src.core.logging import get_logger

logger = get_logger(__name__)

# Genug fuer einen Schwall, klein genug, dass nichts Altes lange liegt.
WARTESCHLANGE = 32

Ereignis = dict[str, Any]


# Wird beim Herunterfahren in jede Warteschlange gelegt. Kein echtes
# Ereignis -- es geht nie an einen Client, es beendet nur dessen Strom.
ENDE: Ereignis = {"type": "__ende__"}


class EventBus:
    def __init__(self, maxsize: int = WARTESCHLANGE) -> None:
        self._maxsize = maxsize
        self._abonnenten: set[asyncio.Queue[Ereignis]] = set()
        self._beendet = False

    @property
    def listeners(self) -> int:
        return len(self._abonnenten)

    @property
    def beendet(self) -> bool:
        return self._beendet

    def stilllegen(self) -> None:
        """Alle offenen Stroeme beenden.

        Ohne das haengt jeder Neustart: ein SSE-Strom laeuft endlos, und
        uvicorn wartet beim Herunterfahren auf offene Verbindungen. Im
        Betrieb mit ``--reload`` heisst das, dass die erste Dateiaenderung
        nach dem ersten verbundenen Browser den Server stehen laesst.

        Ein Weckruf je Warteschlange genuegt -- die Stroeme erkennen ihn und
        gehen von selbst.
        """
        self._beendet = True
        for schlange in list(self._abonnenten):
            try:
                schlange.put_nowait(ENDE)
            except asyncio.QueueFull:
                # Voll heisst: der Strom hat ohnehin gleich etwas zu tun und
                # sieht dabei ``beendet``.
                pass

    @asynccontextmanager
    async def subscribe(self) -> AsyncIterator[asyncio.Queue[Ereignis]]:
        schlange: asyncio.Queue[Ereignis] = asyncio.Queue(maxsize=self._maxsize)
        self._abonnenten.add(schlange)
        try:
            yield schlange
        finally:
            self._abonnenten.discard(schlange)

    async def publish(self, ereignis: Ereignis) -> int:
        """An alle Verbundenen. Gibt zurueck, wie viele es erreicht hat."""
        zugestellt = 0
        for schlange in list(self._abonnenten):
            try:
                schlange.put_nowait(ereignis)
                zugestellt += 1
            except asyncio.QueueFull:
                # Aeltestes wegwerfen und neu versuchen -- ein Hinweis von
                # jetzt ist mehr wert als einer von vor einer Minute.
                try:
                    schlange.get_nowait()
                    schlange.put_nowait(ereignis)
                    zugestellt += 1
                except (asyncio.QueueEmpty, asyncio.QueueFull):
                    logger.warning("Ereignis verworfen -- Abonnent haengt")
        return zugestellt
