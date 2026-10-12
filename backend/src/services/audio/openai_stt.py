from __future__ import annotations

from typing import Any

import openai
from openai import AsyncOpenAI

from src.core.logging import get_logger
from src.services.audio.base import (
    Transcript,
    TranscriptionError,
    TranscriptionService,
)

logger = get_logger(__name__)

EXTENSIONS = frozenset({"webm", "ogg", "oga", "mp4", "m4a", "mp3", "mpga", "mpeg", "wav", "flac"})

TYPE_FROM_EXTENSION: dict[str, str] = {
    "audio/webm": "webm",
    "video/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mp4": "mp4",
    "video/mp4": "mp4",
    "audio/x-m4a": "m4a",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/wave": "wav",
    "audio/flac": "flac",
    "audio/x-flac": "flac",
}

DEFAULT_EXTENSION = "webm"


class OpenAITranscribeService(TranscriptionService):
    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        base_url: str | None = None,
        timeout: float = 120.0,
        max_bytes: int = 25_000_000,
    ) -> None:
        self._model = model
        self._max_bytes = max_bytes
        self._client = AsyncOpenAI(
            api_key=api_key,
            base_url=base_url or "https://api.openai.com/v1",
            timeout=timeout if timeout and timeout > 0 else None,
            max_retries=1,
        )

    @property
    def model_name(self) -> str:
        return self._model

    @property
    def available(self) -> bool:
        return True

    def why_unavailable(self) -> str | None:
        return None

    async def transcribe(
        self,
        audio: bytes,
        *,
        language: str | None = None,
        mime: str | None = None,
        filename: str | None = None,
    ) -> Transcript:
        if not audio:
            raise TranscriptionError("The recording is empty.")
        if len(audio) > self._max_bytes:
            raise TranscriptionError(
                f"The recording is larger than {self._max_bytes // 1_000_000} MB."
            )

        name = f"recording.{_extension(mime, filename)}"

        arguments: dict[str, Any] = {"file": (name, audio), "model": self._model}
        if language:
            arguments["language"] = language

        try:
            response = await self._client.audio.transcriptions.create(**arguments)
        except openai.APIStatusError as exc:
            logger.warning("OpenAI transcription failed: %s", exc)
            raise TranscriptionError(
                f"{self._model} rejected the recording (HTTP {exc.status_code})."
            ) from exc
        except openai.APIError as exc:
            logger.warning("OpenAI transcription failed: %s", exc)
            raise TranscriptionError("Transcription failed.") from exc

        return Transcript(
            text=(response.text or "").strip(),
            language=_language_of(response),
            duration_ms=int((getattr(response, "duration", 0) or 0) * 1000),
        )

    async def aclose(self) -> None:
        await self._client.close()


def _extension(mime: str | None, filename: str | None) -> str:
    if filename and "." in filename:
        extension = filename.rsplit(".", 1)[1].strip().lower()
        if extension in EXTENSIONS:
            return extension

    basis = (mime or "").split(";")[0].strip().lower()
    return TYPE_FROM_EXTENSION.get(basis, DEFAULT_EXTENSION)


def _language_of(response: Any) -> str | None:
    if languages := getattr(response, "languages", None):
        first = languages[0]
        return getattr(first, "code", None) or str(first)
    if (single := getattr(response, "language", None)) is not None:
        return str(single)
    return None
