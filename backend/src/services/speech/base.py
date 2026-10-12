from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


class SpeechError(Exception):
    ...


@dataclass(frozen=True, slots=True)
class SpeechOutput:
    audio: bytes
    mime: str
    provider: str
    voice: str | None = None


class TextToSpeechService(ABC):
    @property
    @abstractmethod
    def provider(self) -> str:
        ...

    @property
    @abstractmethod
    def available(self) -> bool:
        ...

    @abstractmethod
    async def synthesize(
        self,
        text: str,
        *,
        voice: str | None = None,
        model: str | None = None,
    ) -> SpeechOutput:
        ...

    async def aclose(self) -> None:
        ...
