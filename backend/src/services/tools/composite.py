"""Fuehrt mehrere ToolBoxen zu einer zusammen.

Der Agent sieht eine einzige Sammlung; welcher Anbieter dahintersteckt --
MCP-Server oder lokaler Code -- entscheidet die Namenszuordnung hier.
"""

from __future__ import annotations

from collections.abc import Sequence

from src.core.logging import get_logger
from src.services.tools.base import ToolBox, ToolCall, ToolResult, ToolSpec

logger = get_logger(__name__)


class CompositeToolBox(ToolBox):
    def __init__(self, boxes: Sequence[ToolBox]) -> None:
        self._boxes = list(boxes)
        self._routes: dict[str, ToolBox] = {}

    async def specs(self) -> Sequence[ToolSpec]:
        collected: list[ToolSpec] = []
        routes: dict[str, ToolBox] = {}

        for box in self._boxes:
            for spec in await box.specs():
                if spec.name in routes:
                    logger.warning(
                        "Werkzeugname %r doppelt vergeben -- zweiter ignoriert",
                        spec.name,
                    )
                    continue
                routes[spec.name] = box
                collected.append(spec)

        self._routes = routes
        return tuple(collected)

    async def invoke(self, call: ToolCall) -> ToolResult:
        if not self._routes:
            await self.specs()

        box = self._routes.get(call.name)
        if box is None:
            return ToolResult(
                call_id=call.id,
                name=call.name,
                content=f"Unknown tool {call.name!r}.",
                is_error=True,
            )
        return await box.invoke(call)

    async def aclose(self) -> None:
        for box in self._boxes:
            await box.aclose()
        self._routes.clear()
