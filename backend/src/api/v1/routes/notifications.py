"""Die Hinweise, die der Toast hinterlassen hat.

Verschluesselt abgelegt und deshalb nur mit gueltiger Sitzung lesbar --
derselbe Weg wie bei den Chats.
"""

from __future__ import annotations

from dataclasses import asdict
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query, Response, status

from src.api.deps import ProviderDep
from src.core.exceptions import NotFoundError, UnauthorizedError
from src.schemas.notifications import NotificationItem, NotificationListResponse
from src.services.notifications import VerschluesselteHinweise

router = APIRouter(prefix="/notifications", tags=["notifications"])

SitzungHeader = Annotated[str | None, Header(alias="X-Session-Id")]


def get_hinweise(
    provider: ProviderDep, session: SitzungHeader = None
) -> VerschluesselteHinweise:
    if (hinweise := provider.notifications_for(session)) is None:
        raise UnauthorizedError("Not signed in.")
    return hinweise


HinweiseDep = Annotated[VerschluesselteHinweise, Depends(get_hinweise)]


@router.get("", response_model=NotificationListResponse, summary="Stored notices")
async def list_notifications(
    hinweise: HinweiseDep,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
) -> NotificationListResponse:
    """Neueste zuerst."""
    eintraege = await hinweise.list(limit)
    return NotificationListResponse(
        count=len(eintraege),
        unread=sum(1 for e in eintraege if e.read_at is None),
        # asdict statt vars: Hinweis ist ein slots-Dataclass und hat
        # gar kein __dict__.
        notifications=[NotificationItem(**asdict(e)) for e in eintraege],
    )


@router.post(
    "/read",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Mark everything as read",
)
async def mark_read(hinweise: HinweiseDep) -> Response:
    await hinweise.mark_read()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("", status_code=status.HTTP_200_OK, summary="Delete all notices")
async def delete_all(hinweise: HinweiseDep) -> dict[str, int]:
    """Wie beim Leeren der Chats: kein 404, sondern eine Zahl."""
    return {"deleted": await hinweise.delete_all()}


@router.delete(
    "/{notification_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Delete one notice",
)
async def delete_one(notification_id: str, hinweise: HinweiseDep) -> Response:
    if not await hinweise.delete(notification_id):
        raise NotFoundError(f"Notification {notification_id!r} does not exist.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
