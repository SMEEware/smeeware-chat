"""ServiceProvider -- der Kompositionspunkt der Anwendung.

Genau eine Stelle weiss, wie Services zusammengesteckt werden. Alles andere
bekommt fertige Objekte gereicht und kennt keine Konstruktoren.

Services werden *lazy* erzeugt (erst beim ersten Zugriff) und danach als
Singleton gehalten. ``aclose`` raeumt beim Shutdown in umgekehrter Reihenfolge auf.
"""

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
from src.services.notifications import NotificationStore, VerschluesselteHinweise
from src.services.apikeys import ApiKeyStore
from src.services.chats.encrypted import EncryptedChatStore
from src.services.chats.public import PublicChatStore
from src.services.plugins import FilteredToolBox, PluginStore
from src.services.plugins.service import (
    erlaubte_werkzeuge,
    fingerabdruck,
    prompt_block,
    zustand,
)
from src.services.skills import SkillLibrary
from src.services.tools.base import ToolBox
from src.services.tools.composite import CompositeToolBox
from src.services.tools.local import create_local_toolbox, create_notify_toolbox
from src.services.tools.config import load_mcp_servers
from src.services.tools.mcp_toolbox import McpToolBox

logger = get_logger(__name__)

T = TypeVar("T")

WERKZEUGE_AUS = """## Keine Werkzeuge in diesem Gespräch

Die Werkzeuge sind abgeschaltet. Alles, was oben über Websuche, Seiten
abrufen, Bilder ansehen, Shell, Speicher und Skills steht, gilt in diesem
Gespräch **nicht**. Du hast diese Möglichkeiten gerade nicht.

Die einzige Ausnahme ist `notify_user`. Es steht dir weiterhin zur
Verfügung — und es gilt dafür dieselbe hohe Schwelle wie sonst: fast nie.

Tu nicht so, als hättest du sie:

- Kein Aufruf, keine aufruf-ähnliche Schreibweise, keine Platzhalter wie
  `<suche:...>`.
- Kein "ich schaue kurz nach", kein "das Tool liefert gerade nichts", kein
  Angebot, es gleich nochmal zu versuchen.

Bittet dich jemand um etwas, das ein Werkzeug braucht — suchen, nachschlagen,
eine Seite öffnen, ein Bild ansehen, etwas ausführen — dann schiebe nicht
stillschweigend dein Gedächtnis unter. Das wäre eine andere Antwort als die,
um die gebeten wurde, und niemand erführe den Unterschied.

Sage in dem Fall **zuerst** in einem Satz, dass die Werkzeuge abgeschaltet
sind und sich in den Einstellungen einschalten lassen. Danach darfst du
anbieten, was du aus dem Gedächtnis weißt — deutlich als das gekennzeichnet.

Ist die Frage ohne Werkzeug ohnehin zu beantworten, antworte einfach. Dann
braucht es den Hinweis nicht.

Schreibe alles davon in der Sprache, in der du gerade antwortest."""


class ServiceProvider:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self._instances: dict[str, Any] = {}
        self._skills_block = ""
        self._ollama_probe: tuple[float, bool] | None = None


    @property
    def llm(self) -> LLMProvider:
        """Der gehostete Anbieter aus ``LLM_PROVIDER``."""
        return self._singleton("llm", lambda: create_provider(self.settings.llm))

    @property
    def ollama(self) -> LLMProvider | None:
        """Die lokalen Modelle -- None, wenn abgeschaltet."""
        return self._singleton("ollama", self._create_ollama)

    @property
    def openai(self) -> LLMProvider | None:
        """Die Responses-API -- None, wenn abgeschaltet oder ohne Schluessel."""
        return self._singleton("openai", self._create_openai)

    def _create_openai(self) -> LLMProvider | None:
        cfg = self.settings.openai
        if not cfg.enabled:
            logger.info("OPENAI_ENABLED=false -- keine OpenAI-Modelle")
            return None
        if cfg.api_key is None:
            logger.info("OPENAI_API_KEY fehlt -- keine OpenAI-Modelle")
            return None
        return create_openai(cfg)

    def provider_for(self, runtime: str) -> LLMProvider:
        """Laufzeit rein, Anbieter raus -- und zwar immer derselbe.

        Der HTTP-Client dahinter haelt Verbindungen offen; ihn pro Anfrage
        neu zu bauen hiesse, bei jedem Turn einen TCP- und TLS-Handschlag zu
        bezahlen. Deshalb Singleton je Laufzeit, nicht je Aufruf.
        """
        if runtime == "openai":
            if (fern := self.openai) is None:
                raise ConfigurationError(
                    "OpenAI models need OPENAI_API_KEY in backend/.env "
                    "(and OPENAI_ENABLED must not be false)."
                )
            return fern
        if runtime != "local":
            return self.llm
        if (lokal := self.ollama) is None:
            raise ConfigurationError(
                "Local models are disabled (OLLAMA_ENABLED=false)."
            )
        return lokal

    def agent_for(
        self,
        runtime: str,
        *,
        prompt: str | None = None,
        tools: bool = True,
        erlaubt: frozenset[str] | None = None,
        lage: str | None = None,
    ) -> Agent:
        """Ein Agent je Laufzeit, ebenfalls gehalten.

        Ein Agent ist zwar duenn, sein Bau liest aber den System-Prompt aus
        der Sammlung und haengt den Skill-Block an -- Arbeit, die sich pro
        Anfrage nicht lohnt, wenn sich am Ergebnis nichts aendert.

        ``erlaubt`` gehoert in den Schluessel, nicht nur in den Bau: der Agent
        traegt seine Toolbox in sich. Ohne diesen Anteil antwortete nach dem
        Umschalten eines Plugins weiter der alte Agent mit der alten
        Werkzeugliste -- ohne Fehlermeldung, was den Fehler teuer macht.
        """
        name = prompt or self.settings.default_prompt
        marke = fingerabdruck(erlaubt) if erlaubt is not None else "alle"
        return self._singleton(
            f"agent:{name}:{runtime}:{'t' if tools else '-'}:{marke}",
            lambda: self.create_agent(
                name, runtime=runtime, tools=tools, erlaubt=erlaubt, lage=lage
            ),
        )

    def vergiss_agenten(self, prompt: str | None = None) -> int:
        """Zwischengespeicherte Agenten wegwerfen.

        Noetig, sobald sich ein Prompt auf der Platte aendert: der Agent
        traegt seinen System-Prompt als Text in sich, gebaut beim ersten
        Aufruf. Ohne dieses Vergessen antwortete er nach einer Aenderung
        weiter mit der alten Persona -- und niemand kaeme darauf, warum.
        """
        praefix = f"agent:{prompt}:" if prompt else "agent:"
        schluessel = [k for k in self._instances if k.startswith(praefix)]
        for k in schluessel:
            del self._instances[k]
        return len(schluessel)

    def _create_ollama(self) -> LLMProvider | None:
        cfg = self.settings.ollama
        if not cfg.enabled:
            logger.info("OLLAMA_ENABLED=false -- keine lokalen Modelle")
            return None
        if not cfg.model.strip():
            logger.info("OLLAMA_MODEL fehlt -- keine lokalen Modelle")
            return None
        return create_ollama(cfg)

    @property
    def lokale_modelle(self) -> tuple[ModelEntry, ...]:
        """Die lokalen Katalogeintraege aus ``OLLAMA_MODEL`` -- ohne Ping.

        Fuer ``/chat``: waehlt jemand das lokale Modell ausdruecklich, soll der
        Aufruf es versuchen, auch wenn ein Erreichbarkeits-Ping gerade
        danebenlaege. Die Liste blendet Unerreichbares aus, ``resolve`` nicht.
        """
        return catalog.lokale_modelle(self.settings.ollama)

    async def lokale_modelle_sichtbar(self) -> tuple[ModelEntry, ...]:
        """Wie ``lokale_modelle``, aber nur wenn Ollama gerade antwortet.

        So verschwindet der lokale Eintrag aus dem Auswahlfeld, wenn zwar
        konfiguriert, aber kein Ollama laeuft -- statt einer Auswahl, die beim
        Klick scheitert.
        """
        eintraege = self.lokale_modelle
        if not eintraege:
            return ()
        return eintraege if await self._ollama_erreichbar() else ()

    async def _ollama_erreichbar(self) -> bool:
        """Kurzer, gecachter Ping an den OpenAI-kompatiblen ``/models``.

        15 Sekunden Cache in beide Richtungen: ein frisch gestartetes Ollama
        taucht von selbst wieder auf, und eine offene Modell-Liste wartet nicht
        bei jedem Aufruf auf das Netz. Jeder Fehler heisst "nicht erreichbar" --
        ein fehlender Dienst ist kein Serverfehler.
        """
        jetzt = time.monotonic()
        if self._ollama_probe is not None and jetzt - self._ollama_probe[0] < 15.0:
            return self._ollama_probe[1]

        basis = self.settings.ollama.base_url.rstrip("/")
        ok = False
        try:
            async with httpx.AsyncClient(timeout=1.5) as client:
                antwort = await client.get(f"{basis}/models")
            ok = antwort.status_code < 500
        except Exception:  # noqa: BLE001 -- ein Dienst weniger ist kein Fehler
            ok = False
        self._ollama_probe = (jetzt, ok)
        return ok

    @property
    def prompts(self) -> PromptLibrary:
        return self._singleton(
            "prompts",
            lambda: PromptLibrary(
                self.settings.prompts_dir,
                variables={"GEHEIMNIS": self.settings.secret.get_secret_value()},
            ),
        )

    @property
    def vision(self) -> VisionService | None:
        """Das Vision-Modell -- None, wenn abgeschaltet."""
        return self._singleton("vision", self._create_vision)

    @property
    def events(self) -> EventBus:
        """Der Rueckkanal zum Browser -- prozessweit, wie die Sitzungen."""
        return self._singleton("events", EventBus)

    @property
    def accounts(self) -> AccountStore:
        """Das eine Konto -- in derselben Datei wie die Chats."""
        return self._singleton(
            "accounts", lambda: AccountStore(self.settings.chats_db_path)
        )

    @property
    def sessions(self) -> SessionStore:
        """Offene Sitzungen samt Datenschluessel -- nur im Speicher."""
        return self._singleton(
            "sessions",
            lambda: SessionStore(ttl_seconds=self.settings.session_ttl),
        )

    @property
    def notifications(self) -> NotificationStore:
        """Hinweise -- in derselben Datei wie Chats und Konto."""
        return self._singleton(
            "notifications", lambda: NotificationStore(self.settings.chats_db_path)
        )

    @property
    def api_keys(self) -> ApiKeyStore:
        """API-Schluessel -- in derselben Datei wie Konto und Chats."""
        return self._singleton(
            "api_keys", lambda: ApiKeyStore(self.settings.chats_db_path)
        )

    def notifications_for(
        self, session_id: str | None
    ) -> VerschluesselteHinweise | None:
        """Die Hinweise, wie sie fuer diese Sitzung aussehen."""
        sitzung = self.sessions.holen(session_id)
        if sitzung is None:
            return None
        return VerschluesselteHinweise(self.notifications, sitzung.dek)

    def notifications_intern(self) -> VerschluesselteHinweise | None:
        """Fuer Stellen ohne Anfrage -- das Werkzeug im Agenten.

        Ohne offene Sitzung gibt es keinen Schluessel. Dann wird nicht
        gespeichert, und das ist richtig so: es gaebe auch niemanden, der
        den Hinweis je zu sehen bekaeme.
        """
        schluessel = self.sessions.aktiver_schluessel()
        if schluessel is None:
            return None
        return VerschluesselteHinweise(self.notifications, schluessel)

    def chats_for(self, session_id: str | None) -> ChatStore | None:
        """Die Ablage, wie sie fuer diese Sitzung aussieht.

        Ohne gueltige Sitzung gibt es keinen Datenschluessel und damit
        nichts zu lesen -- None heisst hier "nicht angemeldet", nicht
        "abgeschaltet". Die Routen machen daraus ein 401.
        """
        speicher = self.chats
        if speicher is None:
            return None
        sitzung = self.sessions.holen(session_id)
        if sitzung is None:
            return None
        return EncryptedChatStore(speicher, sitzung.dek)

    @property
    def plugins(self) -> PluginStore:
        """Welche Plugins installiert sind -- in derselben Datei wie das Konto."""
        return self._singleton(
            "plugins", lambda: PluginStore(self.settings.chats_db_path)
        )

    async def werkzeug_auswahl(self) -> frozenset[str]:
        """Die Werkzeugnamen, die nach der Plugin-Auswahl uebrig bleiben."""
        vorhanden = [spec.name for spec in await self.toolbox.specs()]
        return erlaubte_werkzeuge(vorhanden, await self.plugins.installiert())

    async def werkzeug_lage(self) -> tuple[frozenset[str], str]:
        """Was erlaubt ist -- und was das Modell darueber lesen soll.

        Beides zusammen, weil beides aus derselben Abfrage faellt und
        auseinanderlaufen wuerde, wenn es zwei Wege gaebe.
        """
        vorhanden = [spec.name for spec in await self.toolbox.specs()]
        installiert = await self.plugins.installiert()
        zustaende = zustand(vorhanden, installiert)
        return (
            erlaubte_werkzeuge(vorhanden, installiert),
            prompt_block(zustaende),
        )

    @property
    def public_chats(self) -> PublicChatStore | None:
        """Geteilte Chats -- ohne Sitzung lesbar, deshalb eigener Schluessel.

        Anders als ``chats_for`` haengt das hier an keiner Anmeldung: genau
        das ist der Zweck. Wer diesen Speicher benutzt, liefert bewusst an
        Unangemeldete aus.
        """
        if self.chats is None:
            return None
        return self._singleton(
            "public_chats",
            lambda: PublicChatStore(
                self.settings.chats_db_path,
                crypto.app_schluessel(self.settings.secret.get_secret_value()),
            ),
        )

    @property
    def teilen_moeglich(self) -> bool:
        """Steht ein echtes SECRET -- oder noch der Wert aus dem Beispiel?

        Der Schluessel fuer geteilte Chats stammt aus SECRET. Laeuft die
        Instanz mit dem Vorgabewert, ist er aus einer Zeichenkette abgeleitet,
        die im Repository steht -- die Verschluesselung waere dann Zierde.
        Lieber das Teilen verweigern als eine Zusage geben, die nicht traegt.
        """
        return self.settings.secret.get_secret_value() not in ("", DEFAULT_SECRET)

    @property
    def transcribe(self) -> TranscriptionService | None:
        """Spracheingabe im eingestellten Standard -- None, wenn abgeschaltet."""
        return self.transcribe_for(None)

    def transcribe_for(self, model_id: str | None) -> TranscriptionService | None:
        """Der Dienst zu einem Transkriptions-Modell.

        Das Modell steht in den Einstellungen des Browsers und kommt pro
        Anfrage mit -- der Server haelt je Modell einen Dienst und keinen
        Zustand darueber, welcher gerade "der richtige" ist. Zwei Reiter mit
        verschiedenen Einstellungen kaemen sich sonst in die Quere.
        """
        if not self.settings.transcribe.enabled:
            logger.info("TRANSCRIBE_ENABLED=false -- keine Spracheingabe")
            return None

        eintrag = stt_catalog.resolve(model_id or self.settings.transcribe.default_model)
        return self._singleton(
            f"transcribe:{eintrag.id}", lambda: self._create_transcribe(eintrag)
        )

    def stt_modelle(self) -> tuple[stt_catalog.SttEntry, ...]:
        """Was in den Einstellungen zur Auswahl steht.

        Der lokale Eintrag faellt weg, wenn whisper.cpp gar nicht
        installiert ist -- eine Auswahl, die sicher scheitert, ist keine.
        """
        lokal = WhisperService(
            binary=self.settings.transcribe.binary,
            model=self.settings.transcribe.model,
            ffmpeg=self.settings.transcribe.ffmpeg,
        ).available
        return stt_catalog.verfuegbar(
            openai=self.settings.openai.api_key is not None, lokal=lokal
        )

    @property
    def _hat_elevenlabs(self) -> bool:
        return self.settings.tts.api_key is not None

    def tts_modelle(self) -> tuple[tts_catalog.TtsEntry, ...]:
        """Was in den Einstellungen zur Auswahl steht.

        Ohne ElevenLabs-Schluessel bleibt der gratis Eintrag -- die Liste ist
        nie leer, sonst haette der Nutzer eine Auswahl ohne Wahl.
        """
        return tts_catalog.verfuegbar(elevenlabs=self._hat_elevenlabs)

    def tts_default(self) -> str:
        """Welches Modell die Vorgabe ist -- haengt am Schluessel."""
        gewuenscht = self.settings.tts.default_model
        return tts_catalog.resolve(
            gewuenscht, elevenlabs=self._hat_elevenlabs
        ).id

    @property
    def skills(self) -> SkillLibrary | None:
        """Skill-Speicher -- None, wenn abgeschaltet."""
        return self._singleton("skills", self._create_skills)

    @property
    def chats(self) -> ChatStore | None:
        """Speicher fuer Chat-Verlaeufe -- None, wenn abgeschaltet."""
        return self._singleton("chats", self._create_chats)

    @property
    def toolbox(self) -> ToolBox:
        return self._singleton("toolbox", self._create_toolbox)

    @property
    def agent(self) -> Agent:
        """Der Agent der App -- Prompt aus ``DEFAULT_PROMPT``, ferner Anbieter.

        Delegiert bewusst an ``agent_for``: sonst laege derselbe Agent unter
        zwei Schluesseln im Cache und wuerde zweimal gebaut.
        """
        return self.agent_for("hosted")

    def create_agent(
        self,
        prompt: str,
        *,
        runtime: str = "hosted",
        tools: bool = True,
        erlaubt: frozenset[str] | None = None,
        lage: str | None = None,
    ) -> Agent:
        """Baut einen Agenten mit einem beliebigen Prompt aus der Sammlung.

        ``prompt`` ist der Dateiname ohne Endung aus ``prompts/``. Ein
        unbekannter Name wirft, statt still ohne Persona zu starten::

            agent = provider.create_agent("raetsel")

        Der Prompt steht danach fest -- ein Agent ist eine Persona.
        """
        system_prompt = self.prompts.get(prompt).text
        if tools:
            if self._skills_block:
                system_prompt = f"{system_prompt}\n\n{self._skills_block}"
            if lage:
                system_prompt = f"{system_prompt}\n\n{lage}"
        else:
            system_prompt = f"{system_prompt}\n\n{WERKZEUGE_AUS}"
        return Agent(
            self.provider_for(runtime),
            system_prompt=system_prompt,
            toolbox=self._werkzeuge(tools, erlaubt),
            max_tool_rounds=self.settings.mcp_max_tool_rounds,
        )

    def _werkzeuge(self, tools: bool, erlaubt: frozenset[str] | None) -> ToolBox:
        """Was der Agent zu sehen bekommt.

        ``tools=False`` schlaegt alles -- die Wahl am Request bleibt staerker
        als die installierten Plugins. ``erlaubt=None`` heisst "ungefiltert"
        und ist der Weg fuer Aufrufer ohne Sitzung, etwa interne Werkzeuge.
        """
        if not tools:
            return self.notify_toolbox
        if erlaubt is None:
            return self.toolbox
        return FilteredToolBox(self.toolbox, erlaubt)

    def _create_vision(self) -> VisionService | None:
        vision = self.settings.vision
        if not vision.enabled:
            logger.info("VISION_ENABLED=false -- kein Vision-Modell")
            return None

        schluessel = vision.api_key or self.settings.llm.api_key
        return VisionService(
            api_key=schluessel.get_secret_value(),
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
        self, eintrag: stt_catalog.SttEntry
    ) -> TranscriptionService:
        cfg = self.settings.transcribe
        if eintrag.runtime == "local":
            return WhisperService(
                binary=cfg.binary,
                model=cfg.model,
                ffmpeg=cfg.ffmpeg,
                threads=cfg.threads,
                timeout=cfg.timeout,
                max_bytes=cfg.max_bytes,
            )

        schluessel = self.settings.openai.api_key
        if schluessel is None:
            raise ConfigurationError(
                f"{eintrag.name} needs OPENAI_API_KEY in backend/.env."
            )
        return OpenAITranscribeService(
            api_key=schluessel.get_secret_value(),
            model=eintrag.upstream,
            base_url=self.settings.openai.base_url,
            timeout=cfg.timeout,
            max_bytes=cfg.max_bytes,
        )

    def _create_skills(self) -> SkillLibrary | None:
        cfg = self.settings.tools
        if not cfg.skills_enabled:
            logger.info("SKILLS_ENABLED=false -- keine Skills")
            return None
        cfg.skills_data_dir.mkdir(parents=True, exist_ok=True)
        return SkillLibrary(
            local_dir=cfg.skills_dir,
            managed_dir=cfg.skills_data_dir,
            cache_ttl=cfg.skills_cache_ttl,
        )

    def _create_chats(self) -> ChatStore | None:
        if not self.settings.chats_enabled:
            logger.info("CHATS_ENABLED=false -- Verlaeufe werden nicht gespeichert")
            return None
        return SqliteChatStore(self.settings.chats_db_path)

    @property
    def notify_toolbox(self) -> ToolBox:
        """Die Toolbox fuer abgeschaltete Werkzeuge -- nur notify_user.

        ``hinweise`` gehoert hier genauso hin wie in die grosse Box: ohne
        die Quelle veroeffentlicht ``notify_user`` seinen Toast, legt ihn
        aber nirgends ab. Sieben Sekunden spaeter waere er endgueltig weg,
        und das Megafon in der Sidebar zeigte nie, dass es ihn gab -- fuer
        jeden, der seine Werkzeuge abgeschaltet hat.
        """
        return self._singleton(
            "notify_toolbox",
            lambda: create_notify_toolbox(self.events, self.notifications_intern),
        )

    def _create_toolbox(self) -> ToolBox:
        boxes: list[ToolBox] = [
            create_local_toolbox(
                self.settings.tools,
                vision=self.vision,
                skills=self.skills,
                bus=self.events,
                hinweise=self.notifications_intern,
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
            logger.info("MCP ist deaktiviert (MCP_ENABLED=false)")

        return CompositeToolBox(boxes) if len(boxes) > 1 else boxes[0]


    async def startup(self) -> None:
        """Eifrig erzeugen, was beim ersten Request nicht scheitern soll.

        Die MCP-Sitzungen werden bewusst hier geoeffnet und in ``aclose``
        wieder geschlossen -- beides in derselben Task, sonst raeumt anyio
        die Cancel-Scopes an der falschen Stelle ab.
        """
        if (chats := self.chats) is not None:
            await chats.ensure_schema()
            await self.accounts.ensure_schema()
            await self.notifications.ensure_schema()
            await self.api_keys.ensure_schema()
            if (oeffentlich := self.public_chats) is not None:
                await oeffentlich.ensure_schema()
            await self.plugins.ensure_schema()
        if self.skills is not None:
            self._skills_block = await _render_skills(self.skills)
        _ = self.agent
        for box in _mcp_boxes(self.toolbox):
            await box.start()
        logger.info(
            "ServiceProvider bereit (env=%s, llm=%s, model=%s)",
            self.settings.environment,
            self.settings.llm.provider,
            self.settings.llm.default_model,
        )

    async def aclose(self) -> None:
        """Gibt alle erzeugten Services frei -- zuletzt erzeugte zuerst."""
        if (bus := self._instances.get("events")) is not None:
            bus.stilllegen()

        for key in reversed(list(self._instances)):
            instance = self._instances[key]
            closer = getattr(instance, "aclose", None)
            if closer is None:
                continue
            try:
                await closer()
            except Exception:  # noqa: BLE001 -- Shutdown darf nie werfen
                logger.exception("Fehler beim Schliessen von %s", key)
        self._instances.clear()
        logger.info("ServiceProvider heruntergefahren")


    def override(self, **services: Any) -> None:
        """Ersetzt Services durch Fakes -- ausschliesslich fuer Tests."""
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
    """Der Skill-Block fuer den System-Prompt (progressive disclosure).

    Nur Name + Beschreibung -- der volle Text kommt bei Bedarf ueber use_skill.
    """
    try:
        metas = await skills.index()
    except Exception as exc:  # noqa: BLE001 -- Skills duerfen den Start nicht kippen
        logger.warning("Skill-Index beim Start nicht lesbar: %s", exc)
        return ""

    zeilen = [
        "# Deine Skills",
        "",
        "Gespeicherte Arbeitsanweisungen fuer wiederkehrende Aufgaben. Passt eine "
        "davon zur Aufgabe, lade sie zuerst mit use_skill und folge ihr. Neue legst "
        "du mit skill_save an; skill_list zeigt jederzeit den aktuellen Stand.",
        "",
    ]
    if metas:
        zeilen += [m.zeile() for m in metas]
    else:
        zeilen.append("(noch keine -- lege bei Gelegenheit welche mit skill_save an)")
    return "\n".join(zeilen)


def _mcp_boxes(toolbox: ToolBox) -> list[McpToolBox]:
    """Findet die MCP-Boxen, egal ob einzeln oder in einer Composite."""
    if isinstance(toolbox, McpToolBox):
        return [toolbox]
    if isinstance(toolbox, CompositeToolBox):
        return [b for b in toolbox._boxes if isinstance(b, McpToolBox)]  # noqa: SLF001
    return []
