from __future__ import annotations

import inspect
from abc import ABC, abstractmethod
from collections.abc import Sequence
from typing import Any

from src.core.logging import get_logger
from src.services.tools.base import ToolBox, ToolCall, ToolError, ToolResult, ToolSpec

logger = get_logger(__name__)


class LocalTool(ABC):
    name: str = ""
    description: str = ""
    parameters: dict[str, Any] = {"type": "object", "properties": {}}

    @abstractmethod
    async def run(self, **kwargs: Any) -> str:
        ...

    async def aclose(self) -> None:
        ...

    def spec(self) -> ToolSpec:
        return ToolSpec(
            name=self.name,
            description=self.description,
            parameters=self.parameters,
        )


class LocalToolBox(ToolBox):
    def __init__(self, tools: Sequence[LocalTool]) -> None:
        self._tools = {tool.name: tool for tool in tools}
        logger.info(
            "Local tools: %d (%s)",
            len(self._tools),
            ", ".join(sorted(self._tools)) or "-",
        )

    async def specs(self) -> Sequence[ToolSpec]:
        return tuple(tool.spec() for tool in self._tools.values())

    async def invoke(self, call: ToolCall) -> ToolResult:
        tool = self._tools.get(call.name)
        if tool is None:
            return ToolResult(
                call_id=call.id,
                name=call.name,
                content=f"Unknown tool {call.name!r}.",
                is_error=True,
            )

        accepted = _accepted_parameters(tool)
        arguments = {k: v for k, v in call.arguments.items() if k in accepted}
        dropped = set(call.arguments) - set(arguments)
        if dropped:
            logger.info("%s: dropped unknown parameters: %s", call.name, dropped)

        try:
            content = await tool.run(**arguments)
        except ToolError as exc:
            logger.info("Tool %s reported an error: %s", call.name, str(exc)[:160])
            return _error(call, str(exc))
        except TypeError as exc:
            return _error(call, f"Wrong parameters: {exc}")
        except Exception as exc:  # noqa: BLE001
            logger.warning("Tool %s failed: %s", call.name, exc)
            return _error(call, f"{type(exc).__name__}: {exc}")

        return ToolResult(call_id=call.id, name=call.name, content=content)

    async def aclose(self) -> None:
        for tool in self._tools.values():
            await tool.aclose()


def _accepted_parameters(tool: LocalTool) -> set[str]:
    signature = inspect.signature(tool.run)
    if any(p.kind is p.VAR_KEYWORD for p in signature.parameters.values()):
        return set(tool.parameters.get("properties", {}))
    return {n for n in signature.parameters if n != "self"}


def _error(call: ToolCall, message: str) -> ToolResult:
    return ToolResult(call_id=call.id, name=call.name, content=message, is_error=True)


def truncate(text: str, limit: int, *, label: str = "chars") -> str:
    if len(text) <= limit:
        return text
    return f"{text[:limit]}\n\n[... truncated, {len(text) - limit} more {label}]"
