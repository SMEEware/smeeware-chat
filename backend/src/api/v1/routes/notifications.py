from __future__ import annotations

from dataclasses import asdict
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query, Response, status

from src.api.deps import ProviderDep
from src.core.exceptions import NotFoundError, UnauthorizedError
from src.schemas.notifications import NotificationItem, NotificationListResponse
from src.services.notifications import EncryptedNotifications

router = APIRouter(prefix="/notifications", tags=["notifications"])

SessionHeader = Annotated[str | None, Header(alias="X-Session-Id")]


def get_notifications(
    provider: ProviderDep, session: SessionHeader = None
) -> EncryptedNotifications:
    if (notices := provider.notifications_for(session)) is None:
        raise UnauthorizedError("Not signed in.")
    return notices


NotificationsDep = Annotated[EncryptedNotifications, Depends(get_notifications)]


@router.get("", response_model=NotificationListResponse, summary="Stored notices")
async def list_notifications(
    notices: NotificationsDep,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
) -> NotificationListResponse:
    entries = await notices.list(limit)
    return NotificationListResponse(
        count=len(entries),
        unread=sum(1 for e in entries if e.read_at is None),
        notifications=[NotificationItem(**asdict(e)) for e in entries],
    )


@router.post(
    "/read",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Mark everything as read",
)
async def mark_read(notices: NotificationsDep) -> Response:
    await notices.mark_read()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("", status_code=status.HTTP_200_OK, summary="Delete all notices")
async def delete_all(notices: NotificationsDep) -> dict[str, int]:
    return {"deleted": await notices.delete_all()}


@router.delete(
    "/{notification_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Delete one notice",
)
async def delete_one(notification_id: str, notices: NotificationsDep) -> Response:
    if not await notices.delete(notification_id):
        raise NotFoundError(f"Notification {notification_id!r} does not exist.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
