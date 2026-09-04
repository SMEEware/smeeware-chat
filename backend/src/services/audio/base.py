"""Gemeinsamer Vertrag der Transkriptions-Dienste.

Es gibt zwei Wege, Gesprochenes zu Text zu machen -- OpenAI und lokal ueber
whisper.cpp -- und die Route soll keinen davon kennen. Sie bekommt einen
Dienst, fragt ihn, ob er kann, und reicht ihm die Aufnahme.

``available``/``why_unavailable`` gehoeren mit in den Vertrag: ein Mikrofon,
das sicher scheitert, soll gar nicht erst angezeigt werden -- und der Grund
gehoert dorthin, wo er bekannt ist.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


class TranscriptionError(Exception):
    """Die Aufnahme war unbrauchbar oder ein Werkzeug hat gestreikt."""


@dataclass(frozen=True, slots=True)
class Transkript:
    text: str
    language: str | None
    duration_ms: int = 0


class TranscriptionService(ABC):
    """Ein Dienst, der eine Aufnahme in Text verwandelt."""

    @property
    @abstractmethod
    def model_name(self) -> str:
        """Was gerade transkribiert -- fuer die Anzeige."""

    @property
    @abstractmethod
    def available(self) -> bool:
        """Kann der Dienst gerade wirklich arbeiten?"""

    @abstractmethod
    def why_unavailable(self) -> str | None:
        """Der Grund, falls nicht -- sonst None."""

    @abstractmethod
    async def transcribe(
        self,
        audio: bytes,
        *,
        language: str | None = None,
        mime: str | None = None,
        filename: str | None = None,
    ) -> Transkript:
        """Rohe Aufnahme rein, Text raus.

        ``mime`` und ``filename`` sind Hinweise auf den Container, keine
        Zusicherung. Der lokale Weg braucht beide nicht -- ffmpeg sieht es
        der Datei an. Die gehostete API dagegen prueft die Endung des
        Namens, den sie bekommt, und lehnt eine Aufnahme mit falscher
        Endung ab, obwohl die Bytes in Ordnung sind.
        """

    async def aclose(self) -> None:
        """Optionales Aufraeumen."""
