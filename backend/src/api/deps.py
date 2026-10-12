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
    if provider.chats is None:
        raise ConfigurationError("Chat history is disabled (CHATS_ENABLED=false).")
    if (chats := provider.chats_for(session)) is None:
        raise UnauthorizedError("Not signed in.")
    return chats


def get_public_chats(
    provider: Annotated[ServiceProvider, Depends(get_provider)],
) -> PublicChatStore:
    if (public := provider.public_chats) is None:
        raise ConfigurationError("Chat history is disabled (CHATS_ENABLED=false).")
    return public


def get_plugins(
    provider: Annotated[ServiceProvider, Depends(get_provider)],
    session: Annotated[str | None, Header(alias="X-Session-Id")] = None,
) -> PluginStore:
    if provider.sessions.fetch(session) is None:
        raise UnauthorizedError("Not signed in.")
    return provider.plugins


def _bearer(authorization: str | None) -> str | None:
    if not authorization:
        return None
    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    return parts[1].strip() or None


async def require_api_access(
    provider: Annotated[ServiceProvider, Depends(get_provider)],
    session: Annotated[str | None, Header(alias="X-Session-Id")] = None,
    authorization: Annotated[str | None, Header()] = None,
) -> None:
    if not provider.settings.require_api_key:
        return
    if provider.sessions.fetch(session) is not None:
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
