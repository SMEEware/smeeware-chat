"""Versioned, stateless IDE tool handoff. Separate from desktop/web ChatRequest."""
from __future__ import annotations

import json
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from src.services.ai.base import Message
from src.services.tools.base import ToolCall

CallId = Annotated[str, Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_.:-]+$")]
ToolName = Annotated[str, Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")]


class IdeCall(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: CallId
    name: ToolName
    arguments: dict[str, Any] = Field(default_factory=dict)

    def to_domain(self) -> ToolCall:
        return ToolCall(id=self.id, name=self.name, arguments=self.arguments)


class IdeMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: Literal["user", "assistant", "tool"]
    content: str = Field(default="", max_length=180_000)
    tool_calls: list[IdeCall] = Field(default_factory=list, max_length=8)
    tool_call_id: CallId | None = None
    reasoning: str | None = Field(default=None, max_length=180_000)

    @model_validator(mode="after")
    def _shape(self):
        if self.tool_calls and self.role != "assistant":
            raise ValueError("Only assistant messages can request tools.")
        if (self.role == "tool") != (self.tool_call_id is not None):
            raise ValueError("Tool results require a tool_call_id; other roles cannot set one.")
        if self.reasoning is not None and self.role != "assistant":
            raise ValueError("Only assistant messages can carry provider reasoning.")
        return self

    def to_domain(self) -> Message:
        return Message(role=self.role, content=self.content, reasoning=self.reasoning,
                       tool_calls=tuple(call.to_domain() for call in self.tool_calls),
                       tool_call_id=self.tool_call_id)


class IdeChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    protocol: Literal[1] = 1
    messages: list[IdeMessage] = Field(min_length=1, max_length=200)
    environment: dict[str, Any] = Field(default_factory=dict)
    model: str | None = Field(default=None, max_length=128)
    web: bool = True
    reasoning_effort: Literal["low", "medium", "high"] = "low"
    max_tokens: int = Field(default=16_384, ge=1024, le=65_536)

    @model_validator(mode="after")
    def _conversation(self):
        if len(json.dumps(self.environment, ensure_ascii=False)) > 12_000:
            raise ValueError("IDE environment is too large.")
        if len(self.model_dump_json()) > 260_000:
            raise ValueError("IDE context is too large; trim complete exchanges first.")
        if self.messages[0].role != "user":
            raise ValueError("IDE context must start with a user message.")
        pending: set[str] = set()
        seen: set[str] = set()
        for message in self.messages:
            if message.role == "tool":
                if message.tool_call_id not in pending:
                    raise ValueError("Orphan or duplicate IDE tool result.")
                pending.remove(message.tool_call_id)
                continue
            if pending:
                raise ValueError("Every requested tool needs a result before the next message.")
            for call in message.tool_calls:
                if call.id in seen:
                    raise ValueError("Duplicate IDE tool call ID.")
                seen.add(call.id)
                pending.add(call.id)
        if pending:
            raise ValueError("Unresolved tool requests cannot start another model turn.")
        return self


class IdeWebRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    protocol: Literal[1] = 1
    tool: ToolName
    arguments: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _size(self):
        if len(self.model_dump_json()) > 16_000:
            raise ValueError("Web arguments are too large.")
        return self


class IdeCompletionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    protocol: Literal[1] = 1
    model: str | None = Field(default=None, max_length=128)
    language: str = Field(max_length=80)
    file: str = Field(max_length=1024)
    prefix: str = Field(max_length=10_000)
    suffix: str = Field(default="", max_length=4000)
    max_tokens: int = Field(default=512, ge=32, le=2048)
