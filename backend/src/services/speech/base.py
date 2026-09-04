"""Gemeinsamer Vertrag der Sprach-Dienste.

Es gibt zwei Wege, Text zu Sprache zu machen -- ElevenLabs und ein
schluesselloser Rueckfall -- und das Werkzeug soll keinen davon kennen. Es
bekommt einen Dienst und reicht ihm den Text plus die gewuenschte Stimme.

Zurueck kommen immer fertige Audiobytes samt MIME-Typ. Kein Stream: die
Sprechanzeige im Browser laeuft ohnehin auf der fertigen Datei, und ein
halbes MP3 laesst sich nicht sinnvoll analysieren.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


class SpeechError(Exception):
    """Der Text liess sich nicht in Sprache verwandeln."""


@dataclass(frozen=True, slots=True)
class Sprachausgabe:
    audio: bytes
    mime: str
    provider: str
    voice: str | None = None


class TextToSpeechService(ABC):
    """Ein Dienst, der Text in Sprache verwandelt."""

    @property
    @abstractmethod
    def provider(self) -> str:
        """Kurzer Name des Anbieters -- "elevenlabs", "free"."""

    @property
    @abstractmethod
    def available(self) -> bool:
        """Kann der Dienst gerade wirklich arbeiten?"""

    @abstractmethod
    async def synthesize(
        self,
        text: str,
        *,
        voice: str | None = None,
        model: str | None = None,
    ) -> Sprachausgabe:
        """Text rein, Audio raus.

        ``voice`` und ``model`` sind Wuensche: der ElevenLabs-Dienst nimmt
        beide, der gratis Rueckfall kennt keine frei waehlbaren Stimmen und
        ignoriert sie.
        """

    async def aclose(self) -> None:
        """Optionales Aufraeumen."""
