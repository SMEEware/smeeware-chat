"""FastAPI-Dependencies -- die Bruecke vom Request zum ServiceProvider.

Routen deklarieren, *was* sie brauchen; woher es kommt, steht nur hier.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Header, Request

from src.core.config import Settings
from src.core.container import ServiceProvider
from src.core.exceptions import ConfigurationError, UnauthorizedError
from src.services.ai.agent import Agent
from src.services.chats import ChatStore
from src.services.chats.public import PublicChatStore
from src.services.plugins import PluginStore


def get_provider(request: Request) -> ServiceProvider:
    return request.app.state.provider


def get_settings_dep(
    provider: Annotated[ServiceProvider, Depends(get_provider)],
) -> Settings:
    return provider.settings


def get_agent(
    provider: Annotated[ServiceProvider, Depends(get_provider)],
) -> Agent:
    return provider.agent


def get_chats(
    provider: Annotated[ServiceProvider, Depends(get_provider)],
    session: Annotated[str | None, Header(alias="X-Session-Id")] = None,
) -> ChatStore:
    """Der Chat-Speicher -- oder ein klarer Fehler.

    Die Routen sollen nicht mit ``None`` hantieren: ist die Persistenz
    abgeschaltet, ist ein stilles Wegwerfen des Verlaufs das schlechtere
    Verhalten als eine deutliche Antwort.

    Und ohne Anmeldung gibt es hier nichts zu holen: die Verlaeufe liegen
    verschluesselt, der Schluessel haengt an der Sitzung. Was zurueckkommt,
    ist deshalb keine nackte Ablage, sondern eine mit dem Schluessel dieser
    Sitzung -- oder ein 401.
    """
    if provider.chats is None:
        raise ConfigurationError("Chat history is disabled (CHATS_ENABLED=false).")
    if (chats := provider.chats_for(session)) is None:
        raise UnauthorizedError("Not signed in.")
    return chats


def get_public_chats(
    provider: Annotated[ServiceProvider, Depends(get_provider)],
) -> PublicChatStore:
    """Die geteilten Chats -- **ohne** Anmeldung.

    Das Fehlen eines Session-Headers ist hier kein Versehen, sondern der
    Zweck: geteilte Chats werden von Leuten gelesen, die kein Konto haben.
    Wer diese Dependency benutzt, liefert bewusst oeffentlich aus. Fuer alles
    andere gilt weiterhin ``get_chats``.
    """
    if (oeffentlich := provider.public_chats) is None:
        raise ConfigurationError("Chat history is disabled (CHATS_ENABLED=false).")
    return oeffentlich


def get_plugins(
    provider: Annotated[ServiceProvider, Depends(get_provider)],
    session: Annotated[str | None, Header(alias="X-Session-Id")] = None,
) -> PluginStore:
    """Die Plugin-Auswahl -- nur fuer Angemeldete.

    Sie ist zwar unverschluesselt, gehoert aber zum Konto: wer sie aendert,
    aendert, was das Modell im naechsten Turn tun darf.
    """
    if provider.sessions.holen(session) is None:
        raise UnauthorizedError("Not signed in.")
    return provider.plugins


def _bearer(authorization: str | None) -> str | None:
    """Den Schluessel aus ``Authorization: Bearer <key>`` ziehen.

    Grosszuegig beim Schema (``bearer``/``Bearer``), streng beim Rest: ohne
    genau ein Leerzeichen und einen nichtleeren Wert ist es keiner.
    """
    if not authorization:
        return None
    teile = authorization.split(" ", 1)
    if len(teile) != 2 or teile[0].lower() != "bearer":
        return None
    return teile[1].strip() or None


async def require_api_access(
    provider: Annotated[ServiceProvider, Depends(get_provider)],
    session: Annotated[str | None, Header(alias="X-Session-Id")] = None,
    authorization: Annotated[str | None, Header()] = None,
) -> None:
    """Der Tuersteher der Inferenz-Endpunkte.

    Solange ``REQUIRE_API_KEY`` aus ist -- die Vorgabe --, laesst er jeden
    durch: lokal, hinter localhost, soll nichts im Weg stehen. Steht das
    Backend oeffentlich und ist die Schranke an, kommt durch, wer eines von
    beiden vorweist: eine offene Sitzung (das eigene Frontend reicht seine
    Kennung durch) oder einen gueltigen API-Schluessel als Bearer-Token.

    Deklariert als ``Depends`` ohne Rueckgabewert: die Routen wollen kein
    Ergebnis, nur die Gewissheit, dass geprueft wurde -- oder ein 401.
    """
    if not provider.settings.require_api_key:
        return
    if provider.sessions.holen(session) is not None:
        return
    if await provider.api_keys.verify(_bearer(authorization) or ""):
        return
    raise UnauthorizedError(
        "This endpoint needs an API key. Send it as 'Authorization: Bearer <key>'."
    )


ProviderDep = Annotated[ServiceProvider, Depends(get_provider)]
SettingsDep = Annotated[Settings, Depends(get_settings_dep)]
AgentDep = Annotated[Agent, Depends(get_agent)]
ChatStoreDep = Annotated[ChatStore, Depends(get_chats)]
PublicChatStoreDep = Annotated[PublicChatStore, Depends(get_public_chats)]
PluginStoreDep = Annotated[PluginStore, Depends(get_plugins)]
ApiAccessDep = Annotated[None, Depends(require_api_access)]
