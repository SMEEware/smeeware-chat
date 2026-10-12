from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass

from src.core.logging import get_logger
from src.services.speech.base import SpeechError

logger = get_logger(__name__)


@dataclass(frozen=True, slots=True)
class Voice:
    id: str
    name: str
    description: str
    language: str


VOICES: tuple[Voice, ...] = (
    Voice("de-DE-SeraphinaMultilingualNeural", "Seraphina", "Warm, speaks every language", "de"),
    Voice("de-DE-FlorianMultilingualNeural", "Florian", "Calm, speaks every language", "de"),
    Voice("en-US-AvaMultilingualNeural", "Ava", "Bright, speaks every language", "en"),
    Voice("en-US-AndrewMultilingualNeural", "Andrew", "Relaxed, speaks every language", "en"),
    Voice("de-DE-KatjaNeural", "Katja", "Clear German", "de"),
    Voice("de-DE-ConradNeural", "Conrad", "Deep German", "de"),
)
STANDARD = VOICES[0].id
_ALLOWED = {s.id for s in VOICES}

MAX_CHARS = 2_000


async def stream_speech(text: str, *, voice: str | None = None, tempo: int = 0) -> AsyncIterator[bytes]:
    text = " ".join((text or "").split())
    if not text:
        raise SpeechError("Nothing to speak.")
    if len(text) > MAX_CHARS:
        text = text[:MAX_CHARS]

    try:
        import edge_tts
    except ImportError as exc:
        logger.error("Package 'edge-tts' missing -- pip install -r requirements.txt")
        raise SpeechError(
            "The call voice needs the 'edge-tts' package "
            "(pip install -r requirements.txt)."
        ) from exc

    choice = voice if voice in _ALLOWED else STANDARD
    tempo = max(-30, min(30, int(tempo)))
    communicate = edge_tts.Communicate(text, choice, rate=f"{tempo:+d}%")

    try:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio" and chunk.get("data"):
                yield chunk["data"]
    except Exception as exc:  # noqa: BLE001
        logger.warning("Neural voice failed: %s", exc)
        raise SpeechError(f"The voice service failed: {exc}") from exc
