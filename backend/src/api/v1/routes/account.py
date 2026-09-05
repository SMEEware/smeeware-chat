"""Das Konto -- einrichten, anmelden, Profilbild.

Der Datenschluessel der Chats haengt am Passwort und lebt nur in der Sitzung
im Speicher. Deshalb gibt es hier keinen Weg, ihn zu erfragen: was ein
Aufrufer bekommt, ist eine Sitzungskennung, und die entschluesselt fuer sich
genommen nichts.
"""

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

BILD_TYPEN = {"image/png", "image/jpeg", "image/webp", "image/gif"}
BILD_MAX = 4_000_000

SitzungHeader = Annotated[str | None, Header(alias="X-Session-Id")]


@router.get("", response_model=AccountStatus, summary="Account status")
async def status_(provider: ProviderDep, session: SitzungHeader = None) -> AccountStatus:
    """Ohne Anmeldung erreichbar -- die Anmeldeseite braucht das zuerst."""
    konto = await provider.accounts.get()
    sitzung = provider.sessions.holen(session)
    return AccountStatus(
        configured=konto is not None,
        username=konto.username if konto else None,
        has_avatar=konto.has_avatar if konto else False,
        authenticated=sitzung is not None,
    )


@router.post(
    "/setup",
    response_model=Session,
    status_code=status.HTTP_201_CREATED,
    summary="Create the account (first run only)",
)
async def setup(payload: Credentials, provider: ProviderDep) -> Session:
    """Genau einmal.

    Ein zweiter Aufruf waere sonst der einfachste Weg, das Konto zu
    uebernehmen -- und mit ihm einen neuen Datenschluessel zu setzen, hinter
    dem die alten Chats fuer immer verschwinden.
    """
    if await provider.accounts.get() is not None:
        raise ValidationError("The account already exists.")

    dek = await provider.accounts.create(payload.username, payload.password)
    kennung = provider.sessions.oeffnen(payload.username, dek)
    return Session(session_id=kennung, username=payload.username)


@router.post("/login", response_model=Session, summary="Sign in")
async def login(payload: Credentials, provider: ProviderDep) -> Session:
    dek = await provider.accounts.unlock(payload.username, payload.password)
    if dek is None:
        raise UnauthorizedError("Wrong username or password.")

    kennung = provider.sessions.oeffnen(payload.username, dek)
    logger.info("Anmeldung: %s", payload.username)
    return Session(session_id=kennung, username=payload.username)


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Sign out",
)
async def logout(provider: ProviderDep, session: SitzungHeader = None) -> Response:
    provider.sessions.schliessen(session)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete(
    "",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Delete the account and all its data",
)
async def delete_account(
    provider: ProviderDep,
    session: SitzungHeader = None,
) -> Response:
    """Setzt die Installation auf den Auslieferungszustand zurueck.

    Weg sind: das Konto (Name, Passwort-Hash, eingepackter Schluessel,
    Profilbild), alle Chats, alle Hinweise, die Plugin-Auswahl und die
    hochgeladenen Anhaenge.
    Es bleibt, was nicht am Konto haengt -- die Skills etwa. Danach ist keine
    Sitzung mehr offen, und die Anmeldeseite fuehrt wieder durchs Einrichten.

    Reihenfolge mit Bedacht: erst die Daten, die am Datenschluessel haengen,
    dann das Konto (und damit der Schluessel), zuletzt die Sitzungen. Bricht
    es dazwischen ab, ist im schlimmsten Fall etwas zu viel geloescht -- nie
    ein Konto ohne seine Daten zurueckgeblieben.
    """
    if provider.sessions.holen(session) is None:
        raise UnauthorizedError("Not signed in.")

    if provider.chats is not None:
        await provider.chats.delete_all()
    await provider.notifications.delete_all()
    await provider.api_keys.delete_all()
    await provider.plugins.alle_entfernen()
    await asyncio.to_thread(_anhaenge_leeren, provider.settings.uploads_dir)
    await provider.accounts.delete()
    provider.sessions.alle_schliessen()

    logger.info("Konto und alle zugehoerigen Daten geloescht")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _anhaenge_leeren(ordner: Path) -> None:
    """Raeumt das Upload-Verzeichnis leer, laesst das Verzeichnis selbst stehen.

    Die Anhaenge liegen unverschluesselt auf der Platte -- anders als die
    Chats verschwinden sie also nicht schon dadurch, dass der Schluessel weg
    ist. Beim Zuruecksetzen muessen sie mit.
    """
    if not ordner.is_dir():
        return
    for eintrag in ordner.iterdir():
        try:
            if eintrag.is_dir() and not eintrag.is_symlink():
                shutil.rmtree(eintrag, ignore_errors=True)
            else:
                eintrag.unlink(missing_ok=True)
        except OSError as exc:
            logger.warning("Anhang %s liess sich nicht loeschen: %s", eintrag, exc)


@router.patch("", response_model=AccountStatus, summary="Change name or password")
async def update(
    payload: AccountUpdate,
    provider: ProviderDep,
    session: SitzungHeader = None,
) -> AccountStatus:
    """Beides einzeln oder zusammen."""
    sitzung = provider.sessions.holen(session)
    if sitzung is None:
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

    konto = await provider.accounts.get()
    if konto is None:
        raise NotFoundError("No account.")

    return AccountStatus(
        configured=True,
        username=konto.username,
        has_avatar=konto.has_avatar,
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
    session: SitzungHeader = None,
) -> Response:
    if provider.sessions.holen(session) is None:
        raise UnauthorizedError("Not signed in.")

    medientyp = (file.content_type or "").split(";")[0].strip().lower()
    if medientyp not in BILD_TYPEN:
        raise ValidationError(
            f"{medientyp or 'unknown type'} is not an image. "
            f"Allowed: {', '.join(sorted(BILD_TYPEN))}."
        )

    bild = await file.read()
    if not bild:
        raise ValidationError("The image is empty.")
    if len(bild) > BILD_MAX:
        raise ValidationError(f"The image is larger than {BILD_MAX // 1_000_000} MB.")

    await provider.accounts.set_avatar(bild, medientyp)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete(
    "/avatar",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Remove the profile picture",
)
async def clear_avatar(
    provider: ProviderDep, session: SitzungHeader = None
) -> Response:
    """Kein 404, wenn keins gesetzt war.

    Das Ziel ist "danach ohne Bild", und das gilt dann bereits -- ein Fehler
    waere hier nur laut, nicht nuetzlich.
    """
    if provider.sessions.holen(session) is None:
        raise UnauthorizedError("Not signed in.")

    await provider.accounts.clear_avatar()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/avatar", summary="The profile picture")
async def get_avatar(provider: ProviderDep, session: SitzungHeader = None) -> Response:
    if provider.sessions.holen(session) is None:
        raise UnauthorizedError("Not signed in.")

    bild = await provider.accounts.get_avatar()
    if bild is None:
        raise NotFoundError("No profile picture set.")

    daten, medientyp = bild
    return Response(
        content=daten,
        media_type=medientyp,
        headers={"Cache-Control": "private, no-cache"},
    )
