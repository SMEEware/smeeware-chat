from __future__ import annotations

import asyncio
import re
from urllib.parse import urlencode

import httpx

from src.core.logging import get_logger
from src.services.speech.base import SpeechError, SpeechOutput, TextToSpeechService

logger = get_logger(__name__)

ENDPOINT = "https://translate.google.com/translate_tts"
CHUNK = 190
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/122.0 Safari/537.36"
)


class FreeTTS(TextToSpeechService):
    def __init__(self, *, language: str, http: httpx.AsyncClient | None = None) -> None:
        self._lang = (language or "en").strip() or "en"
        self._http = http
        self._owns_client = http is None

    @property
    def provider(self) -> str:
        return "free"

    @property
    def available(self) -> bool:
        return True

    def _client(self) -> httpx.AsyncClient:
        if self._http is None:
            self._http = httpx.AsyncClient(timeout=30.0, follow_redirects=True)
        return self._http

    async def synthesize(
        self,
        text: str,
        *,
        voice: str | None = None,  # noqa: ARG002
        model: str | None = None,  # noqa: ARG002
    ) -> SpeechOutput:
        chunks = _split(text, CHUNK)
        if not chunks:
            raise SpeechError("Nothing to speak.")

        parts: list[bytes] = []
        for chunk in chunks:
            parts.append(await self._synthesize_one(chunk))
        audio = b"".join(parts)
        if not audio:
            raise SpeechError("The free speech service returned no audio.")
        return SpeechOutput(
            audio=audio, mime="audio/mpeg", provider="free", voice=None
        )

    async def _synthesize_one(self, chunk: str) -> bytes:
        params = urlencode(
            {
                "ie": "UTF-8",
                "q": chunk,
                "tl": self._lang,
                "client": "tw-ob",
                "total": 1,
                "idx": 0,
                "textlen": len(chunk),
            }
        )
        try:
            response = await self._client().get(
                f"{ENDPOINT}?{params}", headers={"User-Agent": UA}
            )
        except httpx.HTTPError as exc:
            raise SpeechError(f"The free speech service is unreachable: {exc}") from exc

        if response.status_code != 200:
            raise SpeechError(
                f"The free speech service refused a chunk (HTTP "
                f"{response.status_code}). Add an ELEVENLABS_API_KEY for reliable "
                f"speech."
            )
        await asyncio.sleep(0.05)
        return response.content

    async def aclose(self) -> None:
        if self._owns_client and self._http is not None:
            await self._http.aclose()
            self._http = None


def _split(text: str, size: int) -> list[str]:
    text = " ".join((text or "").split())
    if not text:
        return []

    sentences = re.split(r"(?<=[.!?…])\s+", text)
    chunks: list[str] = []
    buffer = ""

    def flush() -> None:
        nonlocal buffer
        if buffer.strip():
            chunks.append(buffer.strip())
        buffer = ""

    for sentence in sentences:
        if len(sentence) > size:
            flush()
            for word in sentence.split(" "):
                if len(buffer) + len(word) + 1 > size:
                    flush()
                buffer = f"{buffer} {word}".strip()
            flush()
        elif len(buffer) + len(sentence) + 1 > size:
            flush()
            buffer = sentence
        else:
            buffer = f"{buffer} {sentence}".strip()
    flush()
    return chunks
