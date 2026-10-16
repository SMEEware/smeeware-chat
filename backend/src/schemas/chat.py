from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, Field, model_validator

from src.core.exceptions import ValidationError
from src.services.ai.base import CompletionOptions, Message

MAX_CHARS = 400_000
MAX_MESSAGES = 1_000


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: Annotated[str, Field(max_length=MAX_CHARS)]
    attachment_ids: Annotated[
        list[Annotated[str, Field(pattern=r"^[0-9a-f]{32}$")]], Field(max_length=50)
    ] = Field(default_factory=list)

    def to_domain(self) -> Message:
        return Message(role=self.role, content=self.content)


class ChatRequest(BaseModel):
    messages: Annotated[
        list[ChatMessage], Field(min_length=1, max_length=MAX_MESSAGES)
    ]
    model: str | None = None
    reasoning_effort: Annotated[str | None, Field(max_length=32)] = None
    chat_id: Annotated[
        str | None, Field(max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    ] = None
    prompt: Annotated[str | None, Field(max_length=64)] = None
    tools: bool = True
    temperature: Annotated[float | None, Field(ge=0.0, le=2.0)] = None
    max_tokens: Annotated[int | None, Field(ge=1, le=393_216)] = None
    top_p: Annotated[float | None, Field(gt=0.0, le=1.0)] = None
    voice_id: Annotated[str | None, Field(max_length=128)] = None
    tts_model: Annotated[str | None, Field(max_length=64)] = None
    stream_id: Annotated[
        str | None, Field(max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    ] = None
    mode: Literal["chat", "call"] = "chat"

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "messages": [{"role": "user", "content": "Explain SSE to me in two sentences."}],
                    "temperature": 0.7,
                }
            ]
        }
    }

    @model_validator(mode="after")
    def _attachment_scope(self) -> "ChatRequest":
        if any(message.attachment_ids for message in self.messages) and not self.chat_id:
            raise ValueError("File attachments require chat_id.")
        if any(message.attachment_ids and message.role != "user" for message in self.messages):
            raise ValueError("Only user messages can attach files.")
        return self

    def to_domain_messages(self, attachment_blocks: dict[int, str] | None = None) -> list[Message]:
        blocks = attachment_blocks or {}
        return _normalize([
            Message(
                role=message.role,
                content=f"{message.content}\n\n{blocks[index]}" if index in blocks else message.content,
            )
            for index, message in enumerate(self.messages)
        ])

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


def _normalize(messages: list[Message]) -> list[Message]:
    clean: list[Message] = []
    for message in messages:
        text = message.content.strip()
        if not text:
            continue
        if clean and message.role in ("user", "assistant") and clean[-1].role == message.role:
            prior = clean[-1]
            clean[-1] = Message(role=prior.role, content=f"{prior.content}\n\n{text}")
            continue
        clean.append(Message(role=message.role, content=text))

    first_question = next((i for i, m in enumerate(clean) if m.role == "user"), None)
    if first_question is None:
        raise ValidationError("The conversation has no question to answer.")
    system_messages = [m for m in clean[:first_question] if m.role == "system"]
    return [*system_messages, *clean[first_question:]]
