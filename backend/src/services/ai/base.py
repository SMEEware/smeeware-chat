from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator, Sequence
from dataclasses import dataclass, field
from typing import Any, Literal

from src.services.tools.base import ToolCall, ToolResult, ToolSpec

Role = Literal["system", "user", "assistant", "tool"]
ChunkKind = Literal["reasoning", "content", "tool_call", "tool_result", "steer"]


@dataclass(frozen=True, slots=True)
class Message:
    role: Role
    content: str
    tool_calls: tuple[ToolCall, ...] = ()
    tool_call_id: str | None = None
    reasoning: str | None = None

    def to_wire(self) -> dict[str, Any]:
        wire: dict[str, Any] = {"role": self.role, "content": self.content}
        if self.tool_calls:
            wire["tool_calls"] = [call.to_wire() for call in self.tool_calls]
        if self.tool_call_id is not None:
            wire["tool_call_id"] = self.tool_call_id
        return wire

    @classmethod
    def from_tool_result(cls, result: "ToolResult") -> "Message":
        return cls(role="tool", content=result.content, tool_call_id=result.call_id)


@dataclass(frozen=True, slots=True)
class CompletionOptions:
    model: str | None = None
    temperature: float | None = None
    max_tokens: int | None = None
    top_p: float | None = None
    stop: Sequence[str] | None = None
    tools: tuple[ToolSpec, ...] = ()
    extra: dict[str, Any] = field(default_factory=dict)

    def merged(self, **overrides: Any) -> "CompletionOptions":
        values = {
            "model": self.model,
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
            "top_p": self.top_p,
            "stop": self.stop,
            "tools": self.tools,
            "extra": self.extra,
        }
        values.update({k: v for k, v in overrides.items() if v is not None})
        return CompletionOptions(**values)


@dataclass(frozen=True, slots=True)
class Usage:
    prompt_tokens: int = 0
    completion_tokens: int = 0
    reasoning_tokens: int = 0

    @property
    def total_tokens(self) -> int:
        return self.prompt_tokens + self.completion_tokens


@dataclass(frozen=True, slots=True)
class Completion:
    content: str
    model: str
    finish_reason: str | None = None
    usage: Usage | None = None
    tool_calls: tuple[ToolCall, ...] = ()
    reasoning: str | None = None


@dataclass(frozen=True, slots=True)
class StreamChunk:
    kind: ChunkKind
    text: str
    tool_name: str | None = None
    tool_call_id: str | None = None
    is_error: bool = False
    ref: str | None = None
    attachments: tuple[dict[str, Any], ...] = ()


class LLMProvider(ABC):
    name: str = "unknown"

    @abstractmethod
    async def complete(
        self,
        messages: Sequence[Message],
        options: CompletionOptions | None = None,
    ) -> Completion:
        ...

    @abstractmethod
    def stream(
        self,
        messages: Sequence[Message],
        options: CompletionOptions | None = None,
    ) -> AsyncIterator[StreamChunk]:
        ...

    @abstractmethod
    async def aclose(self) -> None:
        ...

    async def health(self) -> bool:
        return True
