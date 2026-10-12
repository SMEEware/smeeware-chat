from __future__ import annotations

import re
import uuid
from pathlib import Path

import httpx

from src.core.config import TTSSettings
from src.core.logging import get_logger
from src.services.events import EventBus
from src.services.speech.base import SpeechError, TextToSpeechService
from src.services.speech.catalog import resolve
from src.services.speech.elevenlabs import ElevenLabsTTS
from src.services.speech.free import FreeTTS
from src.services.speech.runtime import get_choice
from src.services.tools.base import ToolError
from src.services.tools.local.base import LocalTool

logger = get_logger(__name__)


class ReadAloudTool(LocalTool):
    name = "read_aloud"
    description = (
        "Speaks text out loud to the user: turns it into audio that plays in "
        "their browser with a live speaking indicator. "
        "Offer this when your answer is long, when it reads well aloud (a "
        "story, an explanation, a summary), or whenever the user asks you to "
        "read, say, narrate or 'tell' them something. A good way to offer is a "
        "short 'Want me to read this to you?' at the end of a longer answer -- "
        "then call this if they say yes. "
        "Write the SPOKEN text yourself, and write it to be heard, not read: "
        "no markdown, no bullet stars, no code, no URLs, no file paths, no "
        "tables -- only what a person would actually say out loud. Rewrite the "
        "gist of your answer into clean sentences rather than pasting it. "
        "For hard-to-pronounce words -- names, loanwords, chemistry, medical "
        "terms -- you MAY drop an IPA transcription in slashes right in the "
        "text, e.g. The medication /ˌɪnsjəˈlɪn/ manages /ˌdaɪəˈbiːtiːz/. Use "
        "several in one text when it helps; they are read as the sound, not "
        "spelled out. "
        "Do NOT pick the voice -- the user sets that. Just pass the text."
    )
    parameters = {
        "type": "object",
        "properties": {
            "text": {
                "type": "string",
                "description": (
                    "The spoken text. Plain, speakable sentences in the user's "
                    "language. IPA in /slashes/ is allowed for tricky words. No "
                    "markdown, code, URLs or anything you would not say aloud."
                ),
            },
        },
        "required": ["text"],
    }

    def __init__(
        self,
        *,
        settings: TTSSettings,
        uploads_dir: Path,
        bus: EventBus | None = None,
        http: httpx.AsyncClient | None = None,
    ) -> None:
        self._cfg = settings
        self._dir = uploads_dir
        self._bus = bus
        self._http = http

    @property
    def _has_elevenlabs(self) -> bool:
        return bool(self._cfg.api_key and self._cfg.api_key.get_secret_value())

    def _service(self, model_id: str) -> TextToSpeechService:
        entry = resolve(model_id, elevenlabs=self._has_elevenlabs)
        if entry.runtime == "elevenlabs":
            return ElevenLabsTTS(
                api_key=self._cfg.api_key.get_secret_value(),  # type: ignore[union-attr]
                base_url=self._cfg.base_url,
                default_voice=self._cfg.voice_id,
                output_format=self._cfg.output_format,
                timeout=self._cfg.timeout,
                http=self._http,
            )
        return FreeTTS(language=self._cfg.free_language, http=self._http)

    async def run(self, text: str) -> str:
        clean = _clean(text)
        if not clean:
            raise ToolError("There is nothing speakable in the text.")
        if len(clean) > self._cfg.max_chars:
            raise ToolError(
                f"The text is longer than {self._cfg.max_chars} characters. "
                f"Read a shorter piece, or split it."
            )

        choice = get_choice()
        model = choice.model or self._cfg.default_model
        service = self._service(model)
        voice = choice.voice or self._cfg.voice_id

        run = uuid.uuid4().hex
        await self._report({"type": "speech", "phase": "start", "run": run})

        try:
            output = await service.synthesize(clean, voice=voice, model=model)
        except SpeechError as exc:
            await self._report({"type": "speech", "phase": "error", "run": run})
            raise ToolError(str(exc)) from exc
        finally:
            await service.aclose()

        self._dir.mkdir(parents=True, exist_ok=True)
        path = self._dir / f"{uuid.uuid4().hex}.mp3"
        path.write_bytes(output.audio)
        url = f"/api/uploads/{path.stem}"

        await self._report(
            {
                "type": "speech",
                "phase": "done",
                "run": run,
                "url": url,
                "provider": output.provider,
                "text": clean,
            }
        )
        logger.info(
            "read_aloud",
            extra={"provider": output.provider, "bytes": len(output.audio),
                   "chars": len(clean)},
        )

        spoken = "ElevenLabs" if output.provider == "elevenlabs" else "the free voice"
        return (
            f"Now playing ({len(output.audio) // 1024} KB, {spoken}). The "
            f"user hears it and sees a speaking indicator. Do not repeat the "
            f"spoken text in your answer -- a brief note that you are reading it "
            f"aloud is enough."
        )

    async def _report(self, event: dict[str, object]) -> None:
        if self._bus is not None:
            await self._bus.publish(event)


def _clean(text: str) -> str:
    if not text:
        return ""
    text = re.sub(r"```.*?```", " ", text, flags=re.DOTALL)
    text = re.sub(r"`([^`]*)`", r"\1", text)
    text = re.sub(r"https?://\S+", " ", text)
    text = re.sub(r"(?m)^\s*[-*•]\s+", "", text)
    text = re.sub(r"[*_]{1,3}([^*_]+)[*_]{1,3}", r"\1", text)
    return " ".join(text.split()).strip()
