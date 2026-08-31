"""Lokale Werkzeuge -- alles, was ohne MCP-Server im Prozess laeuft."""

from __future__ import annotations

import inspect
from abc import ABC, abstractmethod
from collections.abc import Sequence
from typing import Any

from src.core.logging import get_logger
from src.services.tools.base import ToolBox, ToolCall, ToolError, ToolResult, ToolSpec

logger = get_logger(__name__)


class LocalTool(ABC):
    """Ein einzelnes Werkzeug."""

    name: str = ""
    description: str = ""
    parameters: dict[str, Any] = {"type": "object", "properties": {}}

    @abstractmethod
    async def run(self, **kwargs: Any) -> str:
        """Fuehrt das Werkzeug aus und liefert Text fuers Modell."""

    async def aclose(self) -> None:
        """Optionales Aufraeumen."""

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
            "Lokale Werkzeuge: %d (%s)",
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

        # Das Modell erfindet gelegentlich Parameter. Unbekannte wegwerfen ist
        # freundlicher als ein TypeError, den es nicht deuten kann.
        accepted = _accepted_parameters(tool)
        arguments = {k: v for k, v in call.arguments.items() if k in accepted}
        verworfen = set(call.arguments) - set(arguments)
        if verworfen:
            logger.info("%s: unbekannte Parameter verworfen: %s", call.name, verworfen)

        try:
            content = await tool.run(**arguments)
        except ToolError as exc:
            # Vom Werkzeug bewusst gemeldeter Fehler -- Meldung unveraendert
            # weiterreichen, aber als Fehler markieren (is_error).
            logger.info("Werkzeug %s meldet Fehler: %s", call.name, str(exc)[:160])
            return _fehler(call, str(exc))
        except TypeError as exc:
            return _fehler(call, f"Wrong parameters: {exc}")
        except Exception as exc:  # noqa: BLE001 -- Fehler geht ans Modell
            logger.warning("Werkzeug %s fehlgeschlagen: %s", call.name, exc)
            return _fehler(call, f"{type(exc).__name__}: {exc}")

        return ToolResult(call_id=call.id, name=call.name, content=content)

    async def aclose(self) -> None:
        for tool in self._tools.values():
            await tool.aclose()


def _accepted_parameters(tool: LocalTool) -> set[str]:
    signature = inspect.signature(tool.run)
    if any(p.kind is p.VAR_KEYWORD for p in signature.parameters.values()):
        return set(tool.parameters.get("properties", {}))
    return {n for n in signature.parameters if n != "self"}


def _fehler(call: ToolCall, message: str) -> ToolResult:
    return ToolResult(call_id=call.id, name=call.name, content=message, is_error=True)


def truncate(text: str, limit: int, *, label: str = "chars") -> str:
    """Kappt lange Ausgaben und sagt dem Modell, dass gekappt wurde."""
    if len(text) <= limit:
        return text
    return f"{text[:limit]}\n\n[... truncated, {len(text) - limit} more {label}]"
