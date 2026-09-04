"""Anwendungs-Konfiguration.

Eine einzige, typisierte Quelle der Wahrheit. Wird beim Start einmal aus der
Umgebung gelesen und danach unveraendert durch den ServiceProvider gereicht --
kein Modul greift selbst auf ``os.getenv`` zu.
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from pydantic import BaseModel, Field, SecretStr, field_validator

BASE_DIR = Path(__file__).resolve().parents[2]

Environment = Literal["development", "staging", "production"]


DEFAULT_SECRET = "0815"


class LLMSettings(BaseModel):
    """Konfiguration des aktiven LLM-Providers."""

    provider: str = "deepseek"
    api_key: SecretStr
    base_url: str = "https://api.deepseek.com"
    default_model: str = "deepseek-chat"
    timeout: float = Field(default=60.0, ge=0)
    max_retries: int = Field(default=2, ge=0)


class ToolSettings(BaseModel):
    """Lokale Werkzeuge (kein MCP)."""

    brave_api_key: SecretStr | None = None
    serpapi_api_key: SecretStr | None = None
    brave_answers_api_key: SecretStr | None = None
    brave_answers_enabled: bool = True

    hackerone_api_username: str | None = None
    hackerone_api_token: SecretStr | None = None
    hackerone_allow_submit: bool = False

    http_timeout: float = Field(default=20.0, ge=0)
    user_agent: str = "SmeewareBot/0.1 (+https://smeeware.local)"

    scrape_max_bytes: int = Field(default=2_000_000, ge=10_000)
    scrape_max_chars: int = Field(default=12_000, ge=500)
    scrape_cache_ttl: float = Field(default=300.0, ge=0)
    scrape_concurrency: int = Field(default=4, ge=1, le=32)
    scrape_host_delay: float = Field(default=0.25, ge=0)

    storage_enabled: bool = True
    storage_mc_binary: str = "mc"
    storage_alias: str = "smeeware"
    storage_bucket: str = "llm"
    storage_prefix: str = ""
    storage_public_base: str = "https://storage.smeeware.com"
    storage_config_dir: Path | None = None
    storage_timeout: float = Field(default=120.0, ge=0)
    storage_max_inline: int = Field(default=200_000, ge=1_000)
    storage_max_bytes: int = Field(default=50_000_000, ge=10_000)
    storage_local_root: Path | None = None

    skills_enabled: bool = True
    skills_dir: Path = BASE_DIR / "skills"
    skills_data_dir: Path = BASE_DIR / "data" / "skills"
    skills_cache_ttl: float = Field(default=300.0, ge=0)

    shell_enabled: bool = True
    shell_timeout: float = Field(default=30.0, ge=0)
    shell_workdir: Path | None = None
    shell_max_output: int = Field(default=8000, ge=200)


class OllamaSettings(BaseModel):
    """Lokale Modelle -- laufen neben dem gehosteten Anbieter, nicht statt ihm.

    Deshalb eigene Einstellungen statt eines zweiten ``LLM_PROVIDER``: welches
    Modell wohin geht, entscheidet der Katalog in ``services/ai/catalog.py``.
    """

    enabled: bool = False
    base_url: str = "http://localhost:11434/v1"
    api_key: str = "ollama"
    model: str = ""
    default_model: str = "llama3.2"
    timeout: float = Field(default=600.0, ge=0)
    max_retries: int = Field(default=0, ge=0)

    @property
    def konfiguriert(self) -> bool:
        """An UND ein Modell benannt -- beides noetig, damit lokal etwas laeuft.

        Genau die Bedingung, unter der ein lokales Modell im Auswahlfeld
        auftauchen darf: ``OLLAMA_ENABLED=true`` allein reicht nicht, ohne
        ``OLLAMA_MODEL`` gaebe es nichts anzubieten.
        """
        return self.enabled and bool(self.model.strip())


class OpenAISettings(BaseModel):
    """OpenAI -- laeuft neben DeepSeek und Ollama, nicht statt ihnen.

    Eigener Abschnitt statt eines Zweigs in ``LLMSettings``: die starken
    Modelle sprechen nicht Chat-Completions, sondern die Responses-API.
    Der Grund ist keine Vorliebe, sondern eine Einschraenkung des Anbieters
    -- auf Chat-Completions schliessen sich Werkzeuge und Reasoning bei
    gpt-5.6 gegenseitig aus, sofern der Aufwand nicht auf "none" steht.
    Genau beides zusammen ist aber der Sinn dieser Modelle.

    ``reasoning_summary`` steht auf "detailed" und nicht auf "auto": "auto"
    liefert bei diesen Modellen in der Praxis gar keinen Gedankengang, und
    ein leeres Denkfenster ist schlechter als keines.
    """

    enabled: bool = True
    api_key: SecretStr | None = None
    base_url: str = "https://api.openai.com/v1"
    default_model: str = "gpt-5.6-terra"
    reasoning_effort: str = "medium"
    reasoning_summary: str = "detailed"
    timeout: float = Field(default=600.0, ge=0)
    max_retries: int = Field(default=1, ge=0)


class ImageSettings(BaseModel):
    """Bilder erzeugen -- ueber die Images-API von OpenAI.

    ``partial_images`` ist der ganze Reiz: der Anbieter schickt waehrend der
    Generierung Zwischenstaende, und die wandern ueber den Ereignis-Bus in
    den Browser. Ohne sie stuende man knapp eine halbe Minute vor einem
    leeren Kasten.

    ``output_format`` bleibt png, und das ist keine Geschmacksfrage: mit
    webp liefert die API ueberhaupt keine Zwischenstaende, nur das fertige
    Bild. Wer hier umstellt, schaltet die Live-Vorschau stumm ab.
    """

    enabled: bool = True
    model: str = "gpt-image-2"
    size: str = "1024x1024"
    quality: str = "high"
    output_format: str = "png"
    partial_images: int = Field(default=3, ge=0, le=3)
    moderation: str = "auto"
    timeout: float = Field(default=300.0, ge=0)

    max_references: int = Field(default=4, ge=0, le=10)
    reference_max_bytes: int = Field(default=50_000_000, ge=10_000)

    archive: bool = True
    archive_prefix: str = "generated"


class TranscribeSettings(BaseModel):
    """Gesprochenes zu Text -- ueber OpenAI oder lokal ueber whisper.cpp.

    Zwei Wege, einer davon zur Laufzeit waehlbar: ``default_model`` nennt
    einen Eintrag aus ``services/audio/catalog.py``, und dessen ``runtime``
    entscheidet, wer die Aufnahme bekommt. Das Frontend darf pro Anfrage ein
    anderes Modell schicken -- die Einstellung ist eine Vorliebe, keine
    Verdrahtung.

    Die whisper.cpp-Felder bleiben, weil der lokale Weg bleibt: er ist der
    einzige, bei dem die Aufnahme die Maschine nicht verlaesst.
    """

    enabled: bool = True
    default_model: str = "gpt-transcribe"
    binary: str = "whisper-cli"
    ffmpeg: str = "ffmpeg"
    model: Path = BASE_DIR / "data" / "models" / "ggml-large-v3-turbo.bin"
    threads: int = Field(default=0, ge=0)
    timeout: float = Field(default=120.0, gt=0)
    max_bytes: int = Field(default=25_000_000, ge=10_000)


class TTSSettings(BaseModel):
    """Text zu Sprache -- ueber ElevenLabs, oder als Rueckfall gratis.

    Zwei Wege wie bei der Transkription, und dieselbe Trennung: ``default_model``
    nennt einen Eintrag aus ``services/speech/catalog.py``, und dessen
    ``runtime`` entscheidet, wer spricht. Liegt ein ElevenLabs-Schluessel vor,
    ist das die Vorgabe; fehlt er, faellt die Auswahl auf den schluessellosen
    Dienst zurueck -- Google-Uebersetzer-Stimme, gechunkt. Keine Stimme so gut
    wie ElevenLabs, aber eine, die ohne Anmeldung spricht.

    Die Stimme (``voice_id``) gilt nur fuer ElevenLabs und ist zur Laufzeit
    ueberschreibbar: das Frontend schickt pro Anfrage eine mit, die Einstellung
    hier ist nur die Vorgabe.
    """

    enabled: bool = True
    api_key: SecretStr | None = None
    base_url: str = "https://api.elevenlabs.io/v1"
    default_model: str = "eleven_multilingual_v2"
    voice_id: str = "DDpANZ8PLYsm2RvgHVlV"
    output_format: str = "mp3_44100_128"
    free_language: str = "en"
    timeout: float = Field(default=120.0, gt=0)
    max_chars: int = Field(default=5000, ge=100)


class VisionSettings(BaseModel):
    """Das Vision-Modell -- eigener Aufruf, eigenes Modell.

    Ohne eigenen Schluessel/Basis-URL wird der des Hauptproviders genommen:
    bei DeepSeek ist es dieselbe API, nur ein anderer Modellname.
    """

    enabled: bool = True
    model: str = "deepseek-v4-flash-vision-exp"
    api_key: SecretStr | None = None
    base_url: str | None = None
    detail: str = "auto"
    max_images: int = Field(default=8, ge=1, le=600)
    max_bytes: int = Field(default=32 * 1024 * 1024, ge=10_000)
    max_tokens: int = Field(default=2000, ge=64)
    timeout: float = Field(default=120.0, gt=0)
    cache_ttl: float = Field(default=900.0, ge=0)


class SupabaseSettings(BaseModel):
    """Optional -- nur gesetzt, wenn Supabase konfiguriert ist."""

    url: str
    key: SecretStr
    jwt_secret: SecretStr | None = None


class Settings(BaseModel):
    model_config = {"frozen": True}

    app_name: str = "Smeeware API"
    version: str = "0.1.0"
    environment: Environment = "development"
    debug: bool = False

    host: str = "127.0.0.1"
    port: int = 8000

    api_prefix: str = "/api/v1"
    cors_origins: list[str] = Field(default_factory=lambda: ["*"])

    llm: LLMSettings
    vision: VisionSettings = Field(default_factory=VisionSettings)
    tools: ToolSettings = Field(default_factory=ToolSettings)
    openai: OpenAISettings = Field(default_factory=OpenAISettings)
    images: ImageSettings = Field(default_factory=ImageSettings)
    supabase: SupabaseSettings | None = None

    secret: SecretStr = SecretStr(DEFAULT_SECRET)

    prompts_dir: Path = BASE_DIR / "prompts"
    default_prompt: str = "default"

    chats_enabled: bool = True
    chats_db_path: Path = BASE_DIR / "data" / "chats.db"

    session_ttl: float = Field(default=12 * 3600, gt=0)

    require_api_key: bool = False

    transcribe: TranscribeSettings = Field(default_factory=TranscribeSettings)

    tts: TTSSettings = Field(default_factory=TTSSettings)

    ollama: OllamaSettings = Field(default_factory=OllamaSettings)

    uploads_enabled: bool = True
    uploads_dir: Path = BASE_DIR / "data" / "uploads"
    uploads_max_bytes: int = Field(default=20_000_000, ge=10_000)
    uploads_max_files: int = Field(default=8, ge=1, le=50)

    mcp_enabled: bool = True
    mcp_config_path: Path = BASE_DIR / "mcp.json"
    mcp_call_timeout: float = Field(default=60.0, ge=0)
    mcp_max_tool_rounds: int = Field(default=8, ge=1, le=1000)

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @classmethod
    def from_env(cls) -> "Settings":
        load_dotenv(BASE_DIR / ".env")

        api_key = os.getenv("DEEPSEEK_API_KEY")
        if not api_key:
            raise RuntimeError(
                "DEEPSEEK_API_KEY is missing. Create backend/.env (see .env.example)."
            )

        openai_key = os.getenv("OPENAI_API_KEY")

        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_KEY")

        return cls(
            environment=os.getenv("ENVIRONMENT", "development"),  # type: ignore[arg-type]
            debug=_as_bool(os.getenv("DEBUG"), default=False),
            host=os.getenv("HOST", "127.0.0.1"),
            port=int(os.getenv("PORT", "8000")),
            cors_origins=os.getenv("CORS_ORIGINS", "*"),  # type: ignore[arg-type]
            secret=SecretStr(os.getenv("SECRET", DEFAULT_SECRET)),
            tools=ToolSettings(
                brave_api_key=_secret(os.getenv("BRAVE_API_KEY")),
                serpapi_api_key=_secret(os.getenv("SERPAPI_API_KEY")),
                brave_answers_api_key=_secret(os.getenv("BRAVE_ANSWERS_API_KEY")),
                brave_answers_enabled=_as_bool(
                    os.getenv("BRAVE_ANSWERS_ENABLED"), default=True
                ),
                hackerone_api_username=os.getenv("HACKERONE_API_USERNAME") or None,
                hackerone_api_token=_secret(os.getenv("HACKERONE_API_TOKEN")),
                hackerone_allow_submit=_as_bool(
                    os.getenv("HACKERONE_ALLOW_SUBMIT"), default=False
                ),
                http_timeout=float(os.getenv("TOOL_HTTP_TIMEOUT", "20")),
                scrape_max_bytes=int(os.getenv("SCRAPE_MAX_BYTES", "2000000")),
                scrape_max_chars=int(os.getenv("SCRAPE_MAX_CHARS", "12000")),
                scrape_cache_ttl=float(os.getenv("SCRAPE_CACHE_TTL", "300")),
                scrape_concurrency=int(os.getenv("SCRAPE_CONCURRENCY", "4")),
                scrape_host_delay=float(os.getenv("SCRAPE_HOST_DELAY", "0.25")),
                storage_enabled=_as_bool(os.getenv("STORAGE_ENABLED"), default=True),
                storage_mc_binary=os.getenv("MC_BINARY", "mc"),
                storage_alias=os.getenv("STORAGE_ALIAS", "smeeware"),
                storage_bucket=os.getenv("STORAGE_BUCKET", "llm"),
                storage_prefix=os.getenv("STORAGE_PREFIX", ""),
                storage_public_base=os.getenv(
                    "STORAGE_PUBLIC_BASE", "https://storage.smeeware.com"
                ),
                storage_config_dir=(
                    Path(mcdir) if (mcdir := os.getenv("MC_CONFIG_DIR")) else None
                ),
                storage_timeout=float(os.getenv("STORAGE_TIMEOUT", "120")),
                storage_max_inline=int(os.getenv("STORAGE_MAX_INLINE", "200000")),
                storage_max_bytes=int(os.getenv("STORAGE_MAX_BYTES", "50000000")),
                storage_local_root=(
                    Path(root) if (root := os.getenv("STORAGE_LOCAL_ROOT")) else None
                ),
                skills_enabled=_as_bool(os.getenv("SKILLS_ENABLED"), default=True),
                skills_dir=Path(os.getenv("SKILLS_DIR", str(BASE_DIR / "skills"))),
                skills_data_dir=Path(
                    os.getenv("SKILLS_DATA_DIR", str(BASE_DIR / "data" / "skills"))
                ),
                skills_cache_ttl=float(os.getenv("SKILLS_CACHE_TTL", "300")),
                shell_enabled=_as_bool(os.getenv("SHELL_ENABLED"), default=True),
                shell_timeout=float(os.getenv("SHELL_TIMEOUT", "30")),
                shell_workdir=(
                    Path(workdir) if (workdir := os.getenv("SHELL_WORKDIR")) else None
                ),
                shell_max_output=int(os.getenv("SHELL_MAX_OUTPUT", "8000")),
            ),
            prompts_dir=Path(os.getenv("PROMPTS_DIR", str(BASE_DIR / "prompts"))),
            default_prompt=os.getenv("DEFAULT_PROMPT", "default"),
            chats_enabled=_as_bool(os.getenv("CHATS_ENABLED"), default=True),
            require_api_key=_as_bool(os.getenv("REQUIRE_API_KEY"), default=False),
            tts=TTSSettings(
                enabled=_as_bool(os.getenv("TTS_ENABLED"), default=True),
                api_key=_secret(os.getenv("ELEVENLABS_API_KEY")),
                base_url=os.getenv("ELEVENLABS_BASE_URL", "https://api.elevenlabs.io/v1"),
                default_model=os.getenv("TTS_MODEL", "eleven_multilingual_v2"),
                voice_id=os.getenv("ELEVENLABS_VOICE_ID", "DDpANZ8PLYsm2RvgHVlV"),
                output_format=os.getenv("ELEVENLABS_OUTPUT_FORMAT", "mp3_44100_128"),
                free_language=os.getenv("TTS_FREE_LANGUAGE", "en"),
                timeout=float(os.getenv("TTS_TIMEOUT", "120")),
                max_chars=int(os.getenv("TTS_MAX_CHARS", "5000")),
            ),
            chats_db_path=Path(
                os.getenv("CHATS_DB_PATH", str(BASE_DIR / "data" / "chats.db"))
            ),
            transcribe=TranscribeSettings(
                enabled=_as_bool(os.getenv("TRANSCRIBE_ENABLED"), default=True),
                default_model=os.getenv("TRANSCRIBE_MODEL", "gpt-transcribe"),
                binary=os.getenv("WHISPER_BINARY", "whisper-cli"),
                ffmpeg=os.getenv("FFMPEG_BINARY", "ffmpeg"),
                model=Path(
                    os.getenv(
                        "WHISPER_MODEL",
                        str(BASE_DIR / "data" / "models" / "ggml-large-v3-turbo.bin"),
                    )
                ),
                threads=int(os.getenv("WHISPER_THREADS", "0")),
                timeout=float(os.getenv("TRANSCRIBE_TIMEOUT", "120")),
                max_bytes=int(os.getenv("TRANSCRIBE_MAX_BYTES", "25000000")),
            ),
            ollama=OllamaSettings(
                enabled=_as_bool(os.getenv("OLLAMA_ENABLED"), default=False),
                base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1"),
                api_key=os.getenv("OLLAMA_API_KEY", "ollama"),
                model=(os.getenv("OLLAMA_MODEL") or os.getenv("OLLAMA_DEFAULT_MODEL") or ""),
                default_model=(
                    os.getenv("OLLAMA_MODEL")
                    or os.getenv("OLLAMA_DEFAULT_MODEL")
                    or "llama3.2"
                ),
                timeout=float(os.getenv("OLLAMA_TIMEOUT", "600")),
                max_retries=int(os.getenv("OLLAMA_MAX_RETRIES", "0")),
            ),
            session_ttl=float(os.getenv("SESSION_TTL", str(12 * 3600))),
            uploads_enabled=_as_bool(os.getenv("UPLOADS_ENABLED"), default=True),
            uploads_dir=Path(
                os.getenv("UPLOADS_DIR", str(BASE_DIR / "data" / "uploads"))
            ),
            uploads_max_bytes=int(os.getenv("UPLOADS_MAX_BYTES", "20000000")),
            uploads_max_files=int(os.getenv("UPLOADS_MAX_FILES", "8")),
            mcp_enabled=_as_bool(os.getenv("MCP_ENABLED"), default=True),
            mcp_config_path=Path(os.getenv("MCP_CONFIG", str(BASE_DIR / "mcp.json"))),
            mcp_call_timeout=float(os.getenv("MCP_CALL_TIMEOUT", "60")),
            mcp_max_tool_rounds=int(os.getenv("MCP_MAX_TOOL_ROUNDS", "8")),
            llm=LLMSettings(
                provider=os.getenv("LLM_PROVIDER", "deepseek"),
                api_key=SecretStr(api_key),
                base_url=os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
                default_model=os.getenv("DEFAULT_MODEL", "deepseek-chat"),
                timeout=float(os.getenv("LLM_TIMEOUT", "60")),
                max_retries=int(os.getenv("LLM_MAX_RETRIES", "2")),
            ),
            openai=OpenAISettings(
                enabled=_as_bool(os.getenv("OPENAI_ENABLED"), default=True),
                api_key=_secret(openai_key),
                base_url=os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
                default_model=os.getenv("OPENAI_DEFAULT_MODEL", "gpt-5.6-terra"),
                reasoning_effort=os.getenv("OPENAI_REASONING_EFFORT", "medium"),
                reasoning_summary=os.getenv("OPENAI_REASONING_SUMMARY", "detailed"),
                timeout=float(os.getenv("OPENAI_TIMEOUT", "600")),
                max_retries=int(os.getenv("OPENAI_MAX_RETRIES", "1")),
            ),
            images=ImageSettings(
                enabled=_as_bool(os.getenv("IMAGE_ENABLED"), default=True),
                model=os.getenv("IMAGE_MODEL", "gpt-image-2"),
                size=os.getenv("IMAGE_SIZE", "1024x1024"),
                quality=os.getenv("IMAGE_QUALITY", "high"),
                output_format=os.getenv("IMAGE_FORMAT", "png"),
                partial_images=int(os.getenv("IMAGE_PARTIALS", "3")),
                moderation=os.getenv("IMAGE_MODERATION", "auto"),
                timeout=float(os.getenv("IMAGE_TIMEOUT", "300")),
                max_references=int(os.getenv("IMAGE_MAX_REFERENCES", "4")),
                reference_max_bytes=int(
                    os.getenv("IMAGE_REFERENCE_MAX_BYTES", "50000000")
                ),
                archive=_as_bool(os.getenv("IMAGE_ARCHIVE"), default=True),
                archive_prefix=os.getenv("IMAGE_ARCHIVE_PREFIX", "generated"),
            ),
            vision=VisionSettings(
                enabled=_as_bool(os.getenv("VISION_ENABLED"), default=True),
                model=os.getenv("VISION_MODEL", "deepseek-v4-flash-vision-exp"),
                api_key=_secret(os.getenv("VISION_API_KEY")),
                base_url=os.getenv("VISION_BASE_URL") or None,
                detail=os.getenv("VISION_DETAIL", "auto"),
                max_images=int(os.getenv("VISION_MAX_IMAGES", "8")),
                max_bytes=int(os.getenv("VISION_MAX_BYTES", str(32 * 1024 * 1024))),
                max_tokens=int(os.getenv("VISION_MAX_TOKENS", "2000")),
                timeout=float(os.getenv("VISION_TIMEOUT", "120")),
                cache_ttl=float(os.getenv("VISION_CACHE_TTL", "900")),
            ),
            supabase=(
                SupabaseSettings(
                    url=supabase_url,
                    key=SecretStr(supabase_key),
                    jwt_secret=(
                        SecretStr(secret)
                        if (secret := os.getenv("SUPABASE_JWT_SECRET"))
                        else None
                    ),
                )
                if supabase_url and supabase_key
                else None
            ),
        )


def _secret(value: str | None) -> SecretStr | None:
    return SecretStr(value) if value else None


def _as_bool(value: str | None, *, default: bool) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Prozessweiter Cache -- die Env wird genau einmal gelesen."""
    return Settings.from_env()
