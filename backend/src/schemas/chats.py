from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, Field


class StoredMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str

    model_config = {"extra": "allow"}


class ChatUpsertRequest(BaseModel):
    messages: Annotated[list[StoredMessage], Field(max_length=500)]
    title: Annotated[str | None, Field(max_length=200)] = None
    model: Annotated[str | None, Field(max_length=100)] = None

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "messages": [
                        {"role": "user", "content": "hi", "id": "m1"},
                        {
                            "role": "assistant",
                            "content": "hallo",
                            "id": "m2",
                            "parts": [
                                {"type": "reasoning", "text": "denk"},
                                {"type": "content", "text": "hallo"},
                            ],
                            "model": "deepseek-v4-flash",
                            "durationMs": 1234,
                        },
                    ]
                }
            ]
        }
    }


class ChatShareResponse(BaseModel):
    id: str
    public: bool
    url: str | None = None


class ChatRenameRequest(BaseModel):
    title: Annotated[str, Field(min_length=1, max_length=200)]


class ChatSummary(BaseModel):
    id: str
    title: str
    model: str | None = None
    message_count: int
    created_at: str
    updated_at: str
    public: bool = False


class ChatDetail(ChatSummary):
    messages: list[StoredMessage]


class ChatListResponse(BaseModel):
    count: int
    chats: list[ChatSummary]
