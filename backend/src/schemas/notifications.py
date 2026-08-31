"""Ein-/Ausgabe-Modelle der Hinweise."""

from __future__ import annotations

from pydantic import BaseModel


class NotificationItem(BaseModel):
    id: str
    level: str
    title: str
    body: str | None = None
    created_at: str
    read_at: str | None = None


class NotificationListResponse(BaseModel):
    count: int
    unread: int
    notifications: list[NotificationItem]
