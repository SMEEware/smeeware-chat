"""Der Rueckkanal: Ereignisse vom Server zum Browser.

Als Server-Sent Events und nicht als WebSocket -- die Begruendung steht im
Detail in der Antwort an den Nutzer, kurz: alles hier laeuft in eine
Richtung, und SSE geht durch denselben angemeldeten Proxy wie der Rest.
Ein WebSocket koennte das nicht und muesste am Proxy vorbei.

Der Strom haengt an derselben Sitzung wie die Chats. Wer nicht angemeldet
ist, bekommt keinen -- ein Hinweis kann Inhalte tragen.
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import APIRouter, Header, Request
from fastapi.responses import StreamingResponse

from src.api.deps import ProviderDep
from src.core.exceptions import UnauthorizedError
from src.core.logging import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/events", tags=["events"])

SSE_HEADERS = {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}

# Ohne Verkehr schliessen Proxies eine Verbindung irgendwann. Ein Doppelpunkt
# am Zeilenanfang ist ein SSE-Kommentar: kommt an, loest nichts aus.
HERZSCHLAG = 25.0

# So oft schaut der Strom nach, ob es ihn noch braucht. Feiner als der
# Herzschlag: sonst merkt er ein Herunterfahren oder einen verschwundenen
# Browser erst eine halbe Minute spaeter.
TAKT = 1.0


@router.get("", summary="Server events (SSE)")
async def events(
    request: Request,
    provider: ProviderDep,
    session: Annotated[str | None, Header(alias="X-Session-Id")] = None,
) -> StreamingResponse:
    if provider.sessions.holen(session) is None:
        raise UnauthorizedError("Not signed in.")

    return StreamingResponse(_strom(request, provider), headers=SSE_HEADERS)


async def _strom(request: Request, provider: ProviderDep) -> AsyncIterator[str]:
    bus = provider.events

    async with bus.subscribe() as schlange:
        # Ein erstes Frame sofort: so weiss der Client, dass die Verbindung
        # wirklich steht, statt auf das erste Ereignis zu warten.
        yield 'data: {"type":"ready"}\n\n'
        logger.info("Ereignis-Strom offen (%d Zuhoerer)", bus.listeners)

        seit_herzschlag = 0.0

        try:
            while not bus.beendet:
                if await request.is_disconnected():
                    break
                try:
                    ereignis = await asyncio.wait_for(schlange.get(), timeout=TAKT)
                except TimeoutError:
                    seit_herzschlag += TAKT
                    if seit_herzschlag >= HERZSCHLAG:
                        seit_herzschlag = 0.0
                        yield ": ping\n\n"
                    continue

                seit_herzschlag = 0.0

                # Weckruf beim Herunterfahren -- kein Ereignis fuer den
                # Client, nur das Zeichen zu gehen. Ohne diesen Ausgang
                # wartet uvicorn beim Neustart ewig auf diese Verbindung.
                if ereignis.get("type") == "__ende__":
                    break

                yield f"data: {json.dumps(ereignis, ensure_ascii=False)}\n\n"
        finally:
            logger.info("Ereignis-Strom zu")
