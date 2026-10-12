from __future__ import annotations

from collections.abc import Sequence

from src.core.logging import get_logger
from src.services.tools.base import ToolBox, ToolCall, ToolResult, ToolSpec

logger = get_logger(__name__)


class FilteredToolBox(ToolBox):
    def __init__(self, inner: ToolBox, allowed: frozenset[str]) -> None:
        self._inner = inner
        self._allowed = allowed

    async def specs(self) -> Sequence[ToolSpec]:
        return tuple(
            spec for spec in await self._inner.specs() if spec.name in self._allowed
        )

    async def invoke(self, call: ToolCall) -> ToolResult:
        if call.name not in self._allowed:
            logger.warning("Tool %r not installed -- call rejected", call.name)
            return ToolResult(
                call_id=call.id,
                name=call.name,
                content=(
                    f"The tool {call.name!r} is not installed. "
                    "Install its plugin first."
                ),
                is_error=True,
            )
        return await self._inner.invoke(call)

    async def aclose(self) -> None:
        ...
