from __future__ import annotations

import asyncio
import shutil
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, File, Header, Response, UploadFile, status

from src.api.deps import ProviderDep
from src.core.exceptions import NotFoundError, UnauthorizedError, ValidationError
from src.core.logging import get_logger
from src.schemas.account import (
    AccountStatus,
    AccountUpdate,
    Credentials,
    Session,
)

logger = get_logger(__name__)

router = APIRouter(prefix="/account", tags=["account"])

IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif"}
IMAGE_MAX = 4_000_000

SessionHeader = Annotated[str | None, Header(alias="X-Session-Id")]


@router.get("", response_model=AccountStatus, summary="Account status")
async def status_(provider: ProviderDep, session: SessionHeader = None) -> AccountStatus:
    account = await provider.accounts.get()
    current_session = provider.sessions.fetch(session)
    return AccountStatus(
        configured=account is not None,
        username=account.username if account else None,
        has_avatar=account.has_avatar if account else False,
        authenticated=current_session is not None,
    )


@router.post(
    "/setup",
    response_model=Session,
    status_code=status.HTTP_201_CREATED,
    summary="Create the account (first run only)",
)
async def setup(payload: Credentials, provider: ProviderDep) -> Session:
    if await provider.accounts.get() is not None:
        raise ValidationError("The account already exists.")

    dek = await provider.accounts.create(payload.username, payload.password)
    identifier = provider.sessions.open(payload.username, dek)
    return Session(session_id=identifier, username=payload.username)


@router.post("/login", response_model=Session, summary="Sign in")
async def login(payload: Credentials, provider: ProviderDep) -> Session:
    dek = await provider.accounts.unlock(payload.username, payload.password)
    if dek is None:
        raise UnauthorizedError("Wrong username or password.")

    identifier = provider.sessions.open(payload.username, dek)
    logger.info("Sign-in: %s", payload.username)
    return Session(session_id=identifier, username=payload.username)


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Sign out",
)
async def logout(provider: ProviderDep, session: SessionHeader = None) -> Response:
    provider.sessions.close(session)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete(
    "",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Delete the account and all its data",
)
async def delete_account(
    provider: ProviderDep,
    session: SessionHeader = None,
) -> Response:
    if provider.sessions.fetch(session) is None:
        raise UnauthorizedError("Not signed in.")

    if provider.chats is not None:
        await provider.chats.delete_all()
    await provider.notifications.delete_all()
    await provider.api_keys.delete_all()
    await provider.plugins.remove_all()
    await asyncio.to_thread(_clear_attachments, provider.settings.uploads_dir)
    await provider.accounts.delete()
    provider.sessions.close_all()

    logger.info("Account and all related data deleted")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _clear_attachments(folder: Path) -> None:
    if not folder.is_dir():
        return
    for entry in folder.iterdir():
        try:
            if entry.is_dir() and not entry.is_symlink():
                shutil.rmtree(entry, ignore_errors=True)
            else:
                entry.unlink(missing_ok=True)
        except OSError as exc:
            logger.warning("Could not delete attachment %s: %s", entry, exc)


@router.patch("", response_model=AccountStatus, summary="Change name or password")
async def update(
    payload: AccountUpdate,
    provider: ProviderDep,
    session: SessionHeader = None,
) -> AccountStatus:
    current_session = provider.sessions.fetch(session)
    if current_session is None:
        raise UnauthorizedError("Not signed in.")

    if payload.new_password is not None:
        if not payload.current_password:
            raise ValidationError("The current password is required.")
        if not await provider.accounts.change_password(
            payload.current_password, payload.new_password
        ):
            raise UnauthorizedError("The current password is wrong.")

    if payload.username is not None:
        await provider.accounts.rename(payload.username)

    account = await provider.accounts.get()
    if account is None:
        raise NotFoundError("No account.")

    return AccountStatus(
        configured=True,
        username=account.username,
        has_avatar=account.has_avatar,
        authenticated=True,
    )


@router.put(
    "/avatar",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Set the profile picture",
)
async def set_avatar(
    provider: ProviderDep,
    file: Annotated[UploadFile, File(description="Image")],
    session: SessionHeader = None,
) -> Response:
    if provider.sessions.fetch(session) is None:
        raise UnauthorizedError("Not signed in.")

    media_type = (file.content_type or "").split(";")[0].strip().lower()
    if media_type not in IMAGE_TYPES:
        raise ValidationError(
            f"{media_type or 'unknown type'} is not an image. "
            f"Allowed: {', '.join(sorted(IMAGE_TYPES))}."
        )

    image = await file.read()
    if not image:
        raise ValidationError("The image is empty.")
    if len(image) > IMAGE_MAX:
        raise ValidationError(f"The image is larger than {IMAGE_MAX // 1_000_000} MB.")

    await provider.accounts.set_avatar(image, media_type)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete(
    "/avatar",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Remove the profile picture",
)
async def clear_avatar(
    provider: ProviderDep, session: SessionHeader = None
) -> Response:
    if provider.sessions.fetch(session) is None:
        raise UnauthorizedError("Not signed in.")

    await provider.accounts.clear_avatar()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/avatar", summary="The profile picture")
async def get_avatar(provider: ProviderDep, session: SessionHeader = None) -> Response:
    if provider.sessions.fetch(session) is None:
        raise UnauthorizedError("Not signed in.")

    image = await provider.accounts.get_avatar()
    if image is None:
        raise NotFoundError("No profile picture set.")

    data, media_type = image
    return Response(
        content=data,
        media_type=media_type,
        headers={"Cache-Control": "private, no-cache"},
    )
