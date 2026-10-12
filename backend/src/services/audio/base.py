from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


class TranscriptionError(Exception):
    ...


@dataclass(frozen=True, slots=True)
class Transcript:
    text: str
    language: str | None
    duration_ms: int = 0


class TranscriptionService(ABC):
    @property
    @abstractmethod
    def model_name(self) -> str:
        ...

    @property
    @abstractmethod
    def available(self) -> bool:
        ...

    @abstractmethod
    def why_unavailable(self) -> str | None:
        ...

    @abstractmethod
    async def transcribe(
        self,
        audio: bytes,
        *,
        language: str | None = None,
        mime: str | None = None,
        filename: str | None = None,
    ) -> Transcript:
        ...

    async def aclose(self) -> None:
        ...
