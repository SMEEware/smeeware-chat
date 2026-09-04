"""Verzeichnis-Browser fuer die Workspaces.

Zeigt die Ordner auf dem Host, auf dem das Backend laeuft -- dort, wo die
Werkzeuge des Agenten arbeiten. So zeigt ein gewaehlter Workspace-Pfad immer
auf ein Verzeichnis, das der Agent auch wirklich erreichen kann: lokal der
eigene Rechner, im Betrieb der Host des Agenten.

Nur Verzeichnisse, nur Lesen, und nur angemeldet: es werden keine
Dateiinhalte herausgegeben, nur die Namen der Unterordner. Die Schranke ist
dieselbe wie bei Chats und Prompts -- ohne Sitzung nichts.
"""

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

SitzungHeader = Annotated[str | None, Header(alias="X-Session-Id")]


def _home(provider: ProviderDep) -> Path:
    """Wo der Agent arbeitet -- der Startpunkt des Browsers.

    Das Arbeitsverzeichnis der Shell, falls gesetzt, sonst das Verzeichnis
    des laufenden Prozesses. So faellt der Startpunkt mit dem zusammen, in
    dem die Werkzeuge tatsaechlich laufen.
    """
    workdir = provider.settings.tools.shell_workdir
    return (workdir if workdir else Path.cwd()).resolve()


@router.get("", response_model=FsListing, summary="List directories on the agent host")
async def list_directory(
    provider: ProviderDep,
    session: SitzungHeader = None,
    path: Annotated[str, Query(description="Absolute path to list; empty = home")] = "",
    show_hidden: Annotated[bool, Query(alias="all")] = False,
) -> FsListing:
    if provider.sessions.holen(session) is None:
        raise UnauthorizedError("Not signed in.")

    home = _home(provider)
    ziel = Path(path).expanduser() if path.strip() else home
    try:
        ziel = ziel.resolve()
    except OSError:
        raise ValidationError("That path can't be read.")

    if not ziel.exists() or not ziel.is_dir():
        raise NotFoundError("No such directory.")

    entries: list[FsEntry] = []
    try:
        kinder = sorted(ziel.iterdir(), key=lambda p: p.name.lower())
    except PermissionError:
        raise UnauthorizedError("Permission denied for that directory.")
    except OSError:
        raise ValidationError("That directory can't be read.")

    for kind in kinder:
        try:
            if not kind.is_dir():
                continue
        except OSError:
            continue
        versteckt = kind.name.startswith(".")
        if versteckt and not show_hidden:
            continue
        entries.append(FsEntry(name=kind.name, path=str(kind), hidden=versteckt))

    parent = None if ziel.parent == ziel else str(ziel.parent)

    return FsListing(
        path=str(ziel),
        parent=parent,
        home=str(home),
        separator=os.sep,
        entries=entries,
    )
