from __future__ import annotations

import time
from typing import Any, TypeVar

import httpx

from src.core.config import DEFAULT_SECRET, Settings, get_settings
from src.core.exceptions import ConfigurationError
from src.core.logging import get_logger
from src.services.ai.agent import Agent
from src.services.prompts.library import PromptLibrary
from src.services.ai import catalog
from src.services.ai.base import LLMProvider
from src.services.ai.catalog import ModelEntry
from src.services.ai.providers import (
    create_ollama,
    create_openai,
    create_provider,
)
from src.services.ai.vision import VisionService
from src.services.account import AccountStore, SessionStore, crypto
from src.services.audio import (
    OpenAITranscribeService,
    TranscriptionService,
    WhisperService,
)
from src.services.audio import catalog as stt_catalog
from src.services.speech import catalog as tts_catalog
from src.services.chats import ChatStore, SqliteChatStore
from src.services.events import EventBus
from src.services.notifications import NotificationStore, EncryptedNotifications
from src.services.apikeys import ApiKeyStore
from src.services.chats.encrypted import EncryptedChatStore
from src.services.chats.public import PublicChatStore
from src.services.plugins import FilteredToolBox, PluginStore
from src.services.plugins.manifest import ALWAYS_AVAILABLE
from src.services.plugins.service import (
    allowed_tools,
    fingerprint,
    prompt_block,
    plugin_states,
)
from src.services.skills import SkillLibrary
from src.services.tools.base import ToolBox
from src.services.tools.composite import CompositeToolBox
from src.services.tools.local import create_local_toolbox, create_notify_toolbox
from src.services.tools.config import load_mcp_servers
from src.services.tools.mcp_toolbox import McpToolBox

logger = get_logger(__name__)

T = TypeVar("T")

TOOLS_OFF = """## No tools in this conversation

Tools are switched off. Everything above about web search, fetching pages,
looking at images, the shell, storage and skills does **not** apply in this
conversation. You do not have those abilities right now.

The only exception is `notify_user`. It is still available, and the same
high bar applies as always: almost never.

Do not pretend you have them:
- No call, no call-like notation, no placeholders such as `<search:...>`.
- No "let me quickly check", no "the tool is not returning anything right
  now", no offer to try again in a moment.

If someone asks for something that needs a tool (searching, looking
something up, opening a page, looking at an image, running something), do not
silently substitute your memory. That would be a different answer from the one
that was asked for, and nobody would know the difference.

In that case, say **first**, in one sentence, that tools are switched off and
can be turned on in the settings. After that you may offer what you know from
memory, clearly marked as such.

If the question can be answered without a tool anyway, just answer. Then the
notice is not needed.

Write all of this in the language you are currently answering in."""


class ServiceProvider:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self._instances: dict[str, Any] = {}
        self._skills_block = ""
        self._ollama_probe: tuple[float, bool] | None = None


    @property
    def llm(self) -> LLMProvider:
        return self._singleton("llm", lambda: create_provider(self.settings.llm))

    @property
    def ollama(self) -> LLMProvider | None:
        return self._singleton("ollama", self._create_ollama)

    @property
    def openai(self) -> LLMProvider | None:
        return self._singleton("openai", self._create_openai)

    def _create_openai(self) -> LLMProvider | None:
        cfg = self.settings.openai
        if not cfg.enabled:
            logger.info("OPENAI_ENABLED=false -- no OpenAI models")
            return None
        if cfg.api_key is None:
            logger.info("OPENAI_API_KEY missing -- no OpenAI models")
            return None
        return create_openai(cfg)

    def provider_for(self, runtime: str) -> LLMProvider:
        if runtime == "openai":
            if (remote := self.openai) is None:
                raise ConfigurationError(
                    "OpenAI models need OPENAI_API_KEY in backend/.env "
                    "(and OPENAI_ENABLED must not be false)."
                )
            return remote
        if runtime != "local":
            return self.llm
        if (local := self.ollama) is None:
            raise ConfigurationError(
                "Local models are disabled (OLLAMA_ENABLED=false)."
            )
        return local

    def agent_for(
        self,
        runtime: str,
        *,
        prompt: str | None = None,
        tools: bool = True,
        allowed: frozenset[str] | None = None,
        state: str | None = None,
    ) -> Agent:
        name = prompt or self.settings.default_prompt
        marker = fingerprint(allowed) if allowed is not None else "all"
        return self._singleton(
            f"agent:{name}:{runtime}:{'t' if tools else '-'}:{marker}",
            lambda: self.create_agent(
                name, runtime=runtime, tools=tools, allowed=allowed, state=state
            ),
        )

    def forget_agents(self, prompt: str | None = None) -> int:
        prefix = f"agent:{prompt}:" if prompt else "agent:"
        key = [k for k in self._instances if k.startswith(prefix)]
        for k in key:
            del self._instances[k]
        return len(key)

    def _create_ollama(self) -> LLMProvider | None:
        cfg = self.settings.ollama
        if not cfg.enabled:
            logger.info("OLLAMA_ENABLED=false -- no local models")
            return None
        if not cfg.model.strip():
            logger.info("OLLAMA_MODEL missing -- no local models")
            return None
        return create_ollama(cfg)

    @property
    def local_models(self) -> tuple[ModelEntry, ...]:
        return catalog.local_models(self.settings.ollama)

    async def local_models_visible(self) -> tuple[ModelEntry, ...]:
        entries = self.local_models
        if not entries:
            return ()
        return entries if await self._ollama_reachable() else ()

    async def _ollama_reachable(self) -> bool:
        now = time.monotonic()
        if self._ollama_probe is not None and now - self._ollama_probe[0] < 15.0:
            return self._ollama_probe[1]

        basis = self.settings.ollama.base_url.rstrip("/")
        ok = False
        try:
            async with httpx.AsyncClient(timeout=1.5) as client:
                response = await client.get(f"{basis}/models")
            ok = response.status_code < 500
        except Exception:  # noqa: BLE001
            ok = False
        self._ollama_probe = (now, ok)
        return ok

    @property
    def prompts(self) -> PromptLibrary:
        return self._singleton(
            "prompts",
            lambda: PromptLibrary(
                self.settings.prompts_dir,
                variables={"SECRET": self.settings.secret.get_secret_value()},
            ),
        )

    @property
    def vision(self) -> VisionService | None:
        return self._singleton("vision", self._create_vision)

    @property
    def events(self) -> EventBus:
        return self._singleton("events", EventBus)

    @property
    def accounts(self) -> AccountStore:
        return self._singleton(
            "accounts", lambda: AccountStore(self.settings.chats_db_path)
        )

    @property
    def sessions(self) -> SessionStore:
        return self._singleton(
            "sessions",
            lambda: SessionStore(ttl_seconds=self.settings.session_ttl),
        )

    @property
    def notifications(self) -> NotificationStore:
        return self._singleton(
            "notifications", lambda: NotificationStore(self.settings.chats_db_path)
        )

    @property
    def api_keys(self) -> ApiKeyStore:
        return self._singleton(
            "api_keys", lambda: ApiKeyStore(self.settings.chats_db_path)
        )

    def notifications_for(
        self, session_id: str | None
    ) -> EncryptedNotifications | None:
        session = self.sessions.fetch(session_id)
        if session is None:
            return None
        return EncryptedNotifications(self.notifications, session.dek)

    def notifications_internal(self) -> EncryptedNotifications | None:
        key = self.sessions.active_key()
        if key is None:
            return None
        return EncryptedNotifications(self.notifications, key)

    def chats_for(self, session_id: str | None) -> ChatStore | None:
        memory = self.chats
        if memory is None:
            return None
        session = self.sessions.fetch(session_id)
        if session is None:
            return None
        return EncryptedChatStore(memory, session.dek)

    @property
    def plugins(self) -> PluginStore:
        return self._singleton(
            "plugins", lambda: PluginStore(self.settings.chats_db_path)
        )

    async def tool_selection(self) -> frozenset[str]:
        existing = [spec.name for spec in await self.toolbox.specs()]
        return allowed_tools(existing, await self.plugins.installed())

    async def tool_state(self) -> tuple[frozenset[str], str]:
        existing = [spec.name for spec in await self.toolbox.specs()]
        installed = await self.plugins.installed()
        states = plugin_states(existing, installed)
        always = sorted(ALWAYS_AVAILABLE & set(existing))
        return (
            allowed_tools(existing, installed),
            prompt_block(states, always),
        )

    @property
    def public_chats(self) -> PublicChatStore | None:
        if self.chats is None:
            return None
        return self._singleton(
            "public_chats",
            lambda: PublicChatStore(
                self.settings.chats_db_path,
                crypto.app_key(self.settings.secret.get_secret_value()),
            ),
        )

    @property
    def can_share(self) -> bool:
        return self.settings.secret.get_secret_value() not in ("", DEFAULT_SECRET)

    @property
    def transcribe(self) -> TranscriptionService | None:
        return self.transcribe_for(None)

    def transcribe_for(self, model_id: str | None) -> TranscriptionService | None:
        if not self.settings.transcribe.enabled:
            logger.info("TRANSCRIBE_ENABLED=false -- no voice input")
            return None

        entry = stt_catalog.resolve(self.stt_choice(model_id))
        return self._singleton(
            f"transcribe:{entry.id}", lambda: self._create_transcribe(entry)
        )

    def stt_models(self) -> tuple[stt_catalog.SttEntry, ...]:
        local = WhisperService(
            binary=self.settings.transcribe.binary,
            model=self.settings.transcribe.model,
            ffmpeg=self.settings.transcribe.ffmpeg,
        ).available
        return stt_catalog.available(
            openai=self.settings.openai.api_key is not None, local=local
        )

    def stt_choice(self, model_id: str | None) -> str:
        usable = {entry.id for entry in self.stt_models()}
        return model_id if model_id in usable else self.stt_default()

    def stt_default(self) -> str:
        preferred = self.settings.transcribe.default_model
        entries = self.stt_models()
        if not entries or any(entry.id == preferred for entry in entries):
            return preferred
        return entries[0].id

    @property
    def _has_elevenlabs(self) -> bool:
        return self.settings.tts.api_key is not None

    def tts_models(self) -> tuple[tts_catalog.TtsEntry, ...]:
        return tts_catalog.available(elevenlabs=self._has_elevenlabs)

    def tts_default(self) -> str:
        preferred = self.settings.tts.default_model
        return tts_catalog.resolve(
            preferred, elevenlabs=self._has_elevenlabs
        ).id

    @property
    def skills(self) -> SkillLibrary | None:
        return self._singleton("skills", self._create_skills)

    @property
    def chats(self) -> ChatStore | None:
        return self._singleton("chats", self._create_chats)

    @property
    def toolbox(self) -> ToolBox:
        return self._singleton("toolbox", self._create_toolbox)

    @property
    def agent(self) -> Agent:
        return self.agent_for("hosted")

    def create_agent(
        self,
        prompt: str,
        *,
        runtime: str = "hosted",
        tools: bool = True,
        allowed: frozenset[str] | None = None,
        state: str | None = None,
    ) -> Agent:
        system_prompt = self.prompts.get(prompt).text
        if tools:
            if self._skills_block:
                system_prompt = f"{system_prompt}\n\n{self._skills_block}"
            if state:
                system_prompt = f"{system_prompt}\n\n{state}"
        else:
            system_prompt = f"{system_prompt}\n\n{TOOLS_OFF}"
        return Agent(
            self.provider_for(runtime),
            system_prompt=system_prompt,
            toolbox=self._tools(tools, allowed),
            max_tool_rounds=self.settings.mcp_max_tool_rounds,
        )

    def _tools(self, tools: bool, allowed: frozenset[str] | None) -> ToolBox:
        if not tools:
            return self.notify_toolbox
        if allowed is None:
            return self.toolbox
        return FilteredToolBox(self.toolbox, allowed)

    def _create_vision(self) -> VisionService | None:
        vision = self.settings.vision
        if not vision.enabled:
            logger.info("VISION_ENABLED=false -- no vision model")
            return None

        key = vision.api_key or self.settings.llm.api_key
        return VisionService(
            api_key=key.get_secret_value(),
            model=vision.model,
            base_url=vision.base_url or self.settings.llm.base_url,
            http=httpx.AsyncClient(
                timeout=vision.timeout,
                headers={"User-Agent": self.settings.tools.user_agent},
                follow_redirects=True,
            ),
            detail=vision.detail,
            max_images=vision.max_images,
            max_bytes=vision.max_bytes,
            max_tokens=vision.max_tokens,
            timeout=vision.timeout,
            cache_ttl=vision.cache_ttl,
        )

    def _create_transcribe(
        self, entry: stt_catalog.SttEntry
    ) -> TranscriptionService:
        cfg = self.settings.transcribe
        if entry.runtime == "local":
            return WhisperService(
                binary=cfg.binary,
                model=cfg.model,
                ffmpeg=cfg.ffmpeg,
                threads=cfg.threads,
                timeout=cfg.timeout,
                max_bytes=cfg.max_bytes,
            )

        key = self.settings.openai.api_key
        if key is None:
            raise ConfigurationError(
                f"{entry.name} needs OPENAI_API_KEY in backend/.env."
            )
        return OpenAITranscribeService(
            api_key=key.get_secret_value(),
            model=entry.upstream,
            base_url=self.settings.openai.base_url,
            timeout=cfg.timeout,
            max_bytes=cfg.max_bytes,
        )

    def _create_skills(self) -> SkillLibrary | None:
        cfg = self.settings.tools
        if not cfg.skills_enabled:
            logger.info("SKILLS_ENABLED=false -- no skills")
            return None
        cfg.skills_data_dir.mkdir(parents=True, exist_ok=True)
        return SkillLibrary(
            local_dir=cfg.skills_dir,
            managed_dir=cfg.skills_data_dir,
            cache_ttl=cfg.skills_cache_ttl,
        )

    def _create_chats(self) -> ChatStore | None:
        if not self.settings.chats_enabled:
            logger.info("CHATS_ENABLED=false -- chat history is not saved")
            return None
        return SqliteChatStore(self.settings.chats_db_path)

    @property
    def notify_toolbox(self) -> ToolBox:
        return self._singleton(
            "notify_toolbox",
            lambda: create_notify_toolbox(self.events, self.notifications_internal),
        )

    def _create_toolbox(self) -> ToolBox:
        boxes: list[ToolBox] = [
            create_local_toolbox(
                self.settings.tools,
                vision=self.vision,
                skills=self.skills,
                bus=self.events,
                notices=self.notifications_internal,
                ollama_url=(
                    self.settings.ollama.base_url
                    if self.settings.ollama.enabled
                    else None
                ),
                images=self.settings.images,
                openai_key=(
                    self.settings.openai.api_key.get_secret_value()
                    if self.settings.openai.api_key
                    else None
                ),
                openai_base_url=self.settings.openai.base_url,
                uploads_dir=self.settings.uploads_dir,
                tts=self.settings.tts,
            )
        ]

        if self.settings.mcp_enabled:
            servers = load_mcp_servers(self.settings.mcp_config_path)
            if servers:
                boxes.append(
                    McpToolBox(
                        servers, call_timeout=self.settings.mcp_call_timeout
                    )
                )
        else:
            logger.info("MCP is disabled (MCP_ENABLED=false)")

        return CompositeToolBox(boxes) if len(boxes) > 1 else boxes[0]


    async def startup(self) -> None:
        if (chats := self.chats) is not None:
            await chats.ensure_schema()
            await self.accounts.ensure_schema()
            await self.notifications.ensure_schema()
            await self.api_keys.ensure_schema()
            if (public := self.public_chats) is not None:
                await public.ensure_schema()
            await self.plugins.ensure_schema()
        if self.skills is not None:
            self._skills_block = await _render_skills(self.skills)
        _ = self.agent
        for box in _mcp_boxes(self.toolbox):
            await box.start()
        logger.info(
            "ServiceProvider ready (env=%s, llm=%s, model=%s)",
            self.settings.environment,
            self.settings.llm.provider,
            self.settings.llm.default_model,
        )

    async def aclose(self) -> None:
        if (bus := self._instances.get("events")) is not None:
            bus.shutdown()

        for key in reversed(list(self._instances)):
            instance = self._instances[key]
            closer = getattr(instance, "aclose", None)
            if closer is None:
                continue
            try:
                await closer()
            except Exception:  # noqa: BLE001
                logger.exception("Error while closing %s", key)
        self._instances.clear()
        logger.info("ServiceProvider shut down")


    def override(self, **services: Any) -> None:
        self._instances.update(services)

    def _singleton(self, key: str, factory: Any) -> Any:
        if key not in self._instances:
            self._instances[key] = factory()
        return self._instances[key]


async def lifespan_provider(settings: Settings | None = None) -> ServiceProvider:
    provider = ServiceProvider(settings)
    await provider.startup()
    return provider


async def _render_skills(skills: "SkillLibrary") -> str:
    try:
        metas = await skills.index()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Skill index unreadable at startup: %s", exc)
        return ""

    lines = [
        "# Your skills",
        "",
        "Saved working instructions for recurring tasks. If one of them fits the "
        "task, load it first with use_skill and follow it. Create new ones with "
        "skill_save; skill_list always shows the current state.",
        "",
    ]
    if metas:
        lines += [m.row() for m in metas]
    else:
        lines.append("(none yet -- create some with skill_save when it makes sense)")
    return "\n".join(lines)


def _mcp_boxes(toolbox: ToolBox) -> list[McpToolBox]:
    if isinstance(toolbox, McpToolBox):
        return [toolbox]
    if isinstance(toolbox, CompositeToolBox):
        return [b for b in toolbox._boxes if isinstance(b, McpToolBox)]  # noqa: SLF001
    return []
