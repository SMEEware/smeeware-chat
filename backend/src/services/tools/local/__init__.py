"""Zusammenbau der lokalen Werkzeuge.

Ein Werkzeug, dessen Voraussetzung fehlt (kein API-Schluessel, abgeschaltet),
wird schlicht weggelassen -- das Modell sieht dann nur, was wirklich geht,
statt an einer Fehlermeldung zu scheitern.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import httpx

from pathlib import Path

from src.core.config import ImageSettings, ToolSettings, TTSSettings
from src.services.ai.vision import VisionService
from src.core.logging import get_logger

if TYPE_CHECKING:
    from src.services.events import EventBus
    from src.services.skills import SkillLibrary
    from src.services.tools.local.notify import HinweisQuelle
from src.services.tools.local.base import LocalTool, LocalToolBox
from src.services.tools.local.context import ContextTool, LocationService
from src.services.tools.local.search import (
    AmazonSearchTool,
    BraveAnswersTool,
    BraveSearchTool,
    ImageSearchTool,
    VideoSearchTool,
    MapsSearchTool,
    SerpApiSearchTool,
    SocialProfileTool,
    YoutubeSearchTool,
    YoutubeTranscriptTool,
)
from src.services.tools.local.shell import ShellTool
from src.services.tools.local.storage import (
    create_mc_client,
    create_storage_tools,
)
from src.services.tools.local.vision import AnalyzeImageTool
from src.services.tools.local.weather import WeatherTool
from src.services.tools.local.web import create_web_tools

logger = get_logger(__name__)


class _ClosingToolBox(LocalToolBox):
    """LocalToolBox, die zusaetzlich den geteilten HTTP-Client schliesst."""

    def __init__(self, tools: list[LocalTool], client: httpx.AsyncClient) -> None:
        super().__init__(tools)
        self._client = client

    async def aclose(self) -> None:
        await super().aclose()
        await self._client.aclose()


def create_notify_toolbox(
    bus: "EventBus",
    hinweise: "HinweisQuelle | None" = None,
) -> LocalToolBox:
    """Die Toolbox fuer abgeschaltete Werkzeuge -- nicht ganz leer.

    Zwei bleiben: ``notify_user`` ruft nichts ab und veraendert nichts, es
    sagt nur etwas. ``ask_user`` haelt an und fragt. Beides ist keine
    Faehigkeit, die man abwaehlen wuerde, sondern Gespraechsfuehrung; sie
    abzuschalten hiesse, dem Modell die Stimme zu nehmen.
    """
    from src.services.tools.local.ask import AskUserTool
    from src.services.tools.local.notify import NotifyUserTool

    return LocalToolBox([NotifyUserTool(bus, hinweise), AskUserTool()])


def create_local_toolbox(
    settings: ToolSettings,
    *,
    vision: VisionService | None = None,
    skills: SkillLibrary | None = None,
    bus: "EventBus | None" = None,
    hinweise: "HinweisQuelle | None" = None,
    ollama_url: str | None = None,
    images: ImageSettings | None = None,
    openai_key: str | None = None,
    openai_base_url: str | None = None,
    uploads_dir: Path | None = None,
    tts: TTSSettings | None = None,
) -> LocalToolBox:
    client = httpx.AsyncClient(
        timeout=settings.http_timeout if settings.http_timeout > 0 else None,
        headers={"User-Agent": settings.user_agent},
        follow_redirects=True,
    )
    from src.services.tools.local.ask import AskUserTool

    locations = LocationService(client)

    tools: list[LocalTool] = [
        AskUserTool(),
        ContextTool(locations),
        WeatherTool(client, locations),
        *create_web_tools(client, settings),
    ]

    if bus is not None:
        from src.services.system import SystemProbe
        from src.services.tools.local.notify import NotifyUserTool
        from src.services.tools.local.system_check import SystemCheckTool

        tools.append(NotifyUserTool(bus, hinweise))
        tools.append(SystemCheckTool(SystemProbe(ollama_base_url=ollama_url), bus))

    if settings.brave_api_key:
        brave_key = settings.brave_api_key.get_secret_value()
        tools.append(BraveSearchTool(client, brave_key))
        tools.append(ImageSearchTool(client, brave_key))
        tools.append(VideoSearchTool(client, brave_key))
    else:
        logger.info("BRAVE_API_KEY fehlt -- web_search/image_search nicht verfuegbar")

    if settings.serpapi_api_key:
        serp_key = settings.serpapi_api_key.get_secret_value()
        tools.append(SerpApiSearchTool(client, serp_key))
        tools.append(SocialProfileTool(client, serp_key))
        tools.append(AmazonSearchTool(client, serp_key))
        tools.append(MapsSearchTool(client, serp_key))
        tools.append(YoutubeSearchTool(client, serp_key))
        tools.append(YoutubeTranscriptTool(client, serp_key))
    else:
        logger.info(
            "SERPAPI_API_KEY fehlt -- google_search/social_profile/amazon_search/"
            "maps_search/youtube_search/youtube_transcript nicht verfuegbar"
        )

    if settings.brave_answers_enabled and settings.brave_answers_api_key:
        tools.append(
            BraveAnswersTool(
                client, settings.brave_answers_api_key.get_secret_value()
            )
        )
    elif not settings.brave_answers_enabled:
        logger.info("BRAVE_ANSWERS_ENABLED=false -- brave_answers nicht verfuegbar")
    else:
        logger.info("BRAVE_ANSWERS_API_KEY fehlt -- brave_answers nicht verfuegbar")

    if settings.hackerone_api_token:
        from src.services.tools.local.hackerone import create_hackerone_tools

        tools += create_hackerone_tools(
            client,
            settings.hackerone_api_username or "",
            settings.hackerone_api_token.get_secret_value(),
            allow_submit=settings.hackerone_allow_submit,
        )
    else:
        logger.info("HACKERONE_API_TOKEN fehlt -- hackerone_* nicht verfuegbar")

    if vision is not None:
        tools.append(AnalyzeImageTool(vision))
    else:
        logger.info("Vision ist deaktiviert -- analyze_image nicht verfuegbar")

    mc = create_mc_client(settings) if settings.storage_enabled else None

    if images is not None and images.enabled and openai_key and uploads_dir:
        from src.services.tools.local.image_gen import GenerateImageTool

        tools.append(
            GenerateImageTool(
                api_key=openai_key,
                settings=images,
                uploads_dir=uploads_dir,
                bus=bus,
                base_url=openai_base_url,
                http=client,
                mc=mc,
            )
        )
    elif images is not None and images.enabled and not openai_key:
        logger.info("OPENAI_API_KEY fehlt -- generate_image nicht verfuegbar")
    else:
        logger.info("IMAGE_ENABLED=false -- generate_image nicht verfuegbar")

    if tts is not None and tts.enabled and uploads_dir is not None:
        from src.services.tools.local.read_aloud import ReadAloudTool

        tools.append(
            ReadAloudTool(
                settings=tts,
                uploads_dir=uploads_dir,
                bus=bus,
                http=client,
            )
        )
    elif tts is not None and not tts.enabled:
        logger.info("TTS_ENABLED=false -- read_aloud nicht verfuegbar")

    if skills is not None:
        from src.services.tools.local.skills import create_skill_tools

        tools += create_skill_tools(skills, client)
    else:
        logger.info("Skills sind deaktiviert -- skill_* nicht verfuegbar")

    if settings.storage_enabled:
        tools += create_storage_tools(settings, mc)
    else:
        logger.info("STORAGE_ENABLED=false -- Speicher-Werkzeuge nicht verfuegbar")

    if settings.shell_enabled:
        tools.append(
            ShellTool(
                timeout=settings.shell_timeout,
                workdir=settings.shell_workdir,
                max_output=settings.shell_max_output,
            )
        )
    else:
        logger.info("SHELL_ENABLED=false -- run_shell nicht verfuegbar")

    return _ClosingToolBox(tools, client)


__all__ = ["LocalTool", "LocalToolBox", "create_local_toolbox"]
