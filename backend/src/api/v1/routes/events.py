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

HEARTBEAT = 25.0

TICK = 1.0


@router.get("", summary="Server events (SSE)")
async def events(
    request: Request,
    provider: ProviderDep,
    session: Annotated[str | None, Header(alias="X-Session-Id")] = None,
) -> StreamingResponse:
    if provider.sessions.fetch(session) is None:
        raise UnauthorizedError("Not signed in.")

    return StreamingResponse(_stream_events(request, provider), headers=SSE_HEADERS)


async def _stream_events(request: Request, provider: ProviderDep) -> AsyncIterator[str]:
    bus = provider.events

    async with bus.subscribe() as queue:
        yield 'data: {"type":"ready"}\n\n'
        logger.info("Event stream open (%d listeners)", bus.listeners)

        since_heartbeat = 0.0

        try:
            while not bus.finished:
                if await request.is_disconnected():
                    break
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=TICK)
                except TimeoutError:
                    since_heartbeat += TICK
                    if since_heartbeat >= HEARTBEAT:
                        since_heartbeat = 0.0
                        yield ": ping\n\n"
                    continue

                since_heartbeat = 0.0

                if event.get("type") == "__ende__":
                    break

                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
        finally:
            logger.info("Event stream closed")
