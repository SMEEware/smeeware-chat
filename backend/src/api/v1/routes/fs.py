from __future__ import annotations

import os
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Header, Query

from src.api.deps import ProviderDep
from src.core.exceptions import NotFoundError, UnauthorizedError, ValidationError
from src.core.logging import get_logger
from src.schemas.fs import FsEntry, FsListing

logger = get_logger(__name__)

router = APIRouter(prefix="/fs", tags=["fs"])

SessionHeader = Annotated[str | None, Header(alias="X-Session-Id")]


def _home(provider: ProviderDep) -> Path:
    workdir = provider.settings.tools.shell_workdir
    return (workdir if workdir else Path.cwd()).resolve()


@router.get("", response_model=FsListing, summary="List directories on the agent host")
async def list_directory(
    provider: ProviderDep,
    session: SessionHeader = None,
    path: Annotated[str, Query(description="Absolute path to list; empty = home")] = "",
    show_hidden: Annotated[bool, Query(alias="all")] = False,
) -> FsListing:
    if provider.sessions.fetch(session) is None:
        raise UnauthorizedError("Not signed in.")

    home = _home(provider)
    target = Path(path).expanduser() if path.strip() else home
    try:
        target = target.resolve()
    except OSError:
        raise ValidationError("That path can't be read.")

    if not target.exists() or not target.is_dir():
        raise NotFoundError("No such directory.")

    entries: list[FsEntry] = []
    try:
        children = sorted(target.iterdir(), key=lambda p: p.name.lower())
    except PermissionError:
        raise UnauthorizedError("Permission denied for that directory.")
    except OSError:
        raise ValidationError("That directory can't be read.")

    for child in children:
        try:
            if not child.is_dir():
                continue
        except OSError:
            continue
        hidden = child.name.startswith(".")
        if hidden and not show_hidden:
            continue
        entries.append(FsEntry(name=child.name, path=str(child), hidden=hidden))

    parent = None if target.parent == target else str(target.parent)

    return FsListing(
        path=str(target),
        parent=parent,
        home=str(home),
        separator=os.sep,
        entries=entries,
    )
