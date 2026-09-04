"""Provider-unabhaengiger Vertrag fuer Werkzeuge.

Der Agent kennt nur diese Typen. Ob ein Werkzeug per MCP, per HTTP oder
lokal in Python laeuft, sieht er nicht.
"""

from __future__ import annotations

import json
from abc import ABC, abstractmethod
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any

NAME_SEPARATOR = "__"
MAX_NAME_LENGTH = 64


class ToolError(Exception):
    """Ein Werkzeug ist an seiner Aufgabe gescheitert.

    Unterschied zum blossen Rueckgabetext: was ueber ``raise ToolError`` kommt,
    markiert die ``ToolBox`` als ``is_error`` -- das Frontend zeigt den Aufruf
    dann als fehlgeschlagen, und das Modell weiss, dass nichts Brauchbares kam.
    Ein leeres, aber gueltiges Ergebnis ("keine Treffer") ist *kein* Fehler und
    wird weiterhin normal zurueckgegeben.
    """


@dataclass(frozen=True, slots=True)
class ToolSpec:
    """Was ein Werkzeug kann -- in der Form, die das Modell versteht."""

    name: str
    description: str
    parameters: dict[str, Any] = field(default_factory=dict)

    def to_wire(self) -> dict[str, Any]:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters or {"type": "object", "properties": {}},
            },
        }


@dataclass(frozen=True, slots=True)
class ToolCall:
    """Ein vom Modell angeforderter Aufruf."""

    id: str
    name: str
    arguments: dict[str, Any] = field(default_factory=dict)

    def to_wire(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "type": "function",
            "function": {
                "name": self.name,
                "arguments": json.dumps(self.arguments, ensure_ascii=False),
            },
        }


@dataclass(frozen=True, slots=True)
class ToolResult:
    """Das Ergebnis eines Aufrufs, so wie es zurueck ins Gespraech geht."""

    call_id: str
    name: str
    content: str
    is_error: bool = False


class ToolBox(ABC):
    """Eine Sammlung aufrufbarer Werkzeuge."""

    @abstractmethod
    async def specs(self) -> Sequence[ToolSpec]:
        """Alle verfuegbaren Werkzeuge."""

    @abstractmethod
    async def invoke(self, call: ToolCall) -> ToolResult:
        """Fuehrt einen Aufruf aus. Wirft nicht -- Fehler kommen als Ergebnis
        zurueck, damit das Modell darauf reagieren kann."""

    async def aclose(self) -> None:
        """Gibt Ressourcen frei."""


class NullToolBox(ToolBox):
    """Kein Werkzeug verfuegbar.

    Existiert, damit der Agent nie gegen ``None`` pruefen muss.
    """

    async def specs(self) -> Sequence[ToolSpec]:
        return ()

    async def invoke(self, call: ToolCall) -> ToolResult:
        return ToolResult(
            call_id=call.id,
            name=call.name,
            content=f"Unknown tool {call.name!r}.",
            is_error=True,
        )


def qualified_name(server: str, tool: str) -> str:
    """Setzt einen kollisionsfreien Werkzeugnamen zusammen."""
    safe = f"{_sanitize(server)}{NAME_SEPARATOR}{_sanitize(tool)}"
    return safe[:MAX_NAME_LENGTH]


def split_qualified(name: str) -> tuple[str, str]:
    server, _, tool = name.partition(NAME_SEPARATOR)
    return server, tool


def _sanitize(value: str) -> str:
    return "".join(ch if ch.isalnum() or ch in "_-" else "-" for ch in value)
