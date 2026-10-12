from __future__ import annotations

import json
from abc import ABC, abstractmethod
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any

NAME_SEPARATOR = "__"
MAX_NAME_LENGTH = 64


class ToolError(Exception):
    ...


@dataclass(frozen=True, slots=True)
class ToolSpec:
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
    call_id: str
    name: str
    content: str
    is_error: bool = False


class ToolBox(ABC):
    @abstractmethod
    async def specs(self) -> Sequence[ToolSpec]:
        ...

    @abstractmethod
    async def invoke(self, call: ToolCall) -> ToolResult:
        ...

    async def aclose(self) -> None:
        ...


class NullToolBox(ToolBox):
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
    safe = f"{_sanitize(server)}{NAME_SEPARATOR}{_sanitize(tool)}"
    return safe[:MAX_NAME_LENGTH]


def split_qualified(name: str) -> tuple[str, str]:
    server, _, tool = name.partition(NAME_SEPARATOR)
    return server, tool


def _sanitize(value: str) -> str:
    return "".join(ch if ch.isalnum() or ch in "_-" else "-" for ch in value)
