"""Ein-/Ausgabe-Modelle der Chat-Persistenz.

Der Kern ist ``extra: "allow"`` in ``StoredMessage``: das Frontend schickt je
Nachricht mehr als role und content -- ``parts[]``, id, model, durationMs,
aborted -- und alles davon muss unveraendert durch die Validierung und
unveraendert wieder heraus. Ein engeres Modell wuerde genau die Felder
verschlucken, die den Verlauf ausmachen, ohne dass ein Test das merkt.
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, Field


class StoredMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str

    # Nicht anfassen: siehe Modul-Docstring.
    model_config = {"extra": "allow"}


class ChatUpsertRequest(BaseModel):
    # 500 Nachrichten sind reichlich fuer einen Verlauf und begrenzen zugleich,
    # was ein einzelnes PUT in die Datei schreiben kann.
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


class ChatRenameRequest(BaseModel):
    title: Annotated[str, Field(min_length=1, max_length=200)]


class ChatSummary(BaseModel):
    id: str
    title: str
    model: str | None = None
    message_count: int
    created_at: str
    updated_at: str


class ChatDetail(ChatSummary):
    messages: list[StoredMessage]


class ChatListResponse(BaseModel):
    count: int
    chats: list[ChatSummary]
