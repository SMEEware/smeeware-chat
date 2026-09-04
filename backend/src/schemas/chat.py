"""Ein-/Ausgabe-Modelle der Chat-API.

Bewusst getrennt von den Domaenen-Typen in ``services.ai.base``: die API darf
sich stabil halten, waehrend sich die Domaene weiterentwickelt.
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, Field

from src.services.ai.base import CompletionOptions, Message


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: Annotated[str, Field(min_length=1, max_length=32_000)]

    def to_domain(self) -> Message:
        return Message(role=self.role, content=self.content)


class ChatRequest(BaseModel):
    messages: Annotated[list[ChatMessage], Field(min_length=1, max_length=100)]
    model: str | None = None
    prompt: Annotated[str | None, Field(max_length=64)] = None
    tools: bool = True
    temperature: Annotated[float | None, Field(ge=0.0, le=2.0)] = None
    max_tokens: Annotated[int | None, Field(ge=1, le=32_000)] = None
    top_p: Annotated[float | None, Field(gt=0.0, le=1.0)] = None
    voice_id: Annotated[str | None, Field(max_length=128)] = None
    tts_model: Annotated[str | None, Field(max_length=64)] = None

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "messages": [{"role": "user", "content": "Erklaer mir SSE in zwei Saetzen."}],
                    "temperature": 0.7,
                }
            ]
        }
    }

    def to_domain_messages(self) -> list[Message]:
        return [message.to_domain() for message in self.messages]

    def to_options(self) -> CompletionOptions:
        return CompletionOptions(
            model=self.model,
            temperature=self.temperature,
            max_tokens=self.max_tokens,
            top_p=self.top_p,
        )


class UsageResponse(BaseModel):
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    reasoning_tokens: int = 0


class ChatResponse(BaseModel):
    content: str
    model: str
    finish_reason: str | None = None
    usage: UsageResponse | None = None
    reasoning: str | None = None
