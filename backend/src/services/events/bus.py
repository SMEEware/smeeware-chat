from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from src.core.logging import get_logger

logger = get_logger(__name__)

QUEUE_SIZE = 32

Event = dict[str, Any]


END: Event = {"type": "__ende__"}


class EventBus:
    def __init__(self, maxsize: int = QUEUE_SIZE) -> None:
        self._maxsize = maxsize
        self._subscribers: set[asyncio.Queue[Event]] = set()
        self._finished = False

    @property
    def listeners(self) -> int:
        return len(self._subscribers)

    @property
    def finished(self) -> bool:
        return self._finished

    def shutdown(self) -> None:
        self._finished = True
        for queue in list(self._subscribers):
            try:
                queue.put_nowait(END)
            except asyncio.QueueFull:
                pass

    @asynccontextmanager
    async def subscribe(self) -> AsyncIterator[asyncio.Queue[Event]]:
        queue: asyncio.Queue[Event] = asyncio.Queue(maxsize=self._maxsize)
        self._subscribers.add(queue)
        try:
            yield queue
        finally:
            self._subscribers.discard(queue)

    async def publish(self, event: Event) -> int:
        delivered = 0
        for queue in list(self._subscribers):
            try:
                queue.put_nowait(event)
                delivered += 1
            except asyncio.QueueFull:
                try:
                    queue.get_nowait()
                    queue.put_nowait(event)
                    delivered += 1
                except (asyncio.QueueEmpty, asyncio.QueueFull):
                    logger.warning("Event dropped -- subscriber is stuck")
        return delivered
