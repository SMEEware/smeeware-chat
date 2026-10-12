from __future__ import annotations

from contextvars import ContextVar
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class SpeechChoice:
    model: str | None = None
    voice: str | None = None


_CHOICE: ContextVar[SpeechChoice | None] = ContextVar("speech_choice", default=None)


def set_choice(model: str | None, voice: str | None) -> None:
    model = (model or "").strip() or None
    voice = (voice or "").strip() or None
    _CHOICE.set(SpeechChoice(model=model, voice=voice) if (model or voice) else None)


def get_choice() -> SpeechChoice:
    return _CHOICE.get() or SpeechChoice()
