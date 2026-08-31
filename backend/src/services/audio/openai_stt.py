"""Gesprochenes zu Text -- ueber die Audio-API von OpenAI.

Der Gegenpart zu ``whisper.py``. Beide erfuellen denselben Vertrag, also
sieht die Route keinen Unterschied; der Unterschied liegt woanders:

* Kein ``ffmpeg``, kein Unterprozess. Die API nimmt webm/opus, mp4 und ogg
  direkt -- also genau das, was die Browser aufnehmen. Die halbe Mechanik
  von whisper.cpp faellt damit weg.
* Dafuer verlaesst die Aufnahme die Maschine. Das ist der Preis, und es ist
  der Grund, warum der lokale Weg im Katalog bleibt.

``language`` bleibt optional und wird normalerweise nicht gesetzt: die
Modelle erkennen die Sprache selbst, und genau darum geht es bei
mehrsprachiger Eingabe. ``gpt-transcribe`` meldet sie sogar zurueck.
"""

from __future__ import annotations

from typing import Any

import openai
from openai import AsyncOpenAI

from src.core.logging import get_logger
from src.services.audio.base import (
    Transkript,
    TranscriptionError,
    TranscriptionService,
)

logger = get_logger(__name__)

# Was die API annimmt -- und woran sie den Container erkennt: an der Endung
# des Namens, den wir mitschicken. Steckt in einer .webm getauften Datei ein
# mp3, antwortet sie mit "Audio file might be corrupted or unsupported",
# obwohl die Bytes in Ordnung sind.
ENDUNGEN = frozenset({"webm", "ogg", "oga", "mp4", "m4a", "mp3", "mpga", "mpeg", "wav", "flac"})

# Der Rueckweg ueber den gemeldeten Medientyp, falls der Name nichts hergibt.
AUS_TYP: dict[str, str] = {
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

# Was der Browser aufnimmt, wenn nichts anderes bekannt ist.
STANDARD_ENDUNG = "webm"


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
        # Der Schluessel wurde beim Bauen geprueft -- mehr laesst sich ohne
        # einen bezahlten Aufruf nicht feststellen.
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
    ) -> Transkript:
        if not audio:
            raise TranscriptionError("The recording is empty.")
        if len(audio) > self._max_bytes:
            raise TranscriptionError(
                f"The recording is larger than {self._max_bytes // 1_000_000} MB."
            )

        name = f"recording.{_endung(mime, filename)}"

        argumente: dict[str, Any] = {"file": (name, audio), "model": self._model}
        if language:
            argumente["language"] = language

        try:
            antwort = await self._client.audio.transcriptions.create(**argumente)
        except openai.APIStatusError as exc:
            # Der Nutzer sieht diese Meldung neben dem Mikrofon -- sie soll
            # sagen, was zu tun ist, nicht bloss eine Nummer nennen.
            logger.warning("OpenAI-Transkription fehlgeschlagen: %s", exc)
            raise TranscriptionError(
                f"{self._model} rejected the recording (HTTP {exc.status_code})."
            ) from exc
        except openai.APIError as exc:
            logger.warning("OpenAI-Transkription fehlgeschlagen: %s", exc)
            raise TranscriptionError("Transcription failed.") from exc

        return Transkript(
            text=(antwort.text or "").strip(),
            language=_sprache_von(antwort),
            duration_ms=int((getattr(antwort, "duration", 0) or 0) * 1000),
        )

    async def aclose(self) -> None:
        await self._client.close()


def _endung(mime: str | None, filename: str | None) -> str:
    """Die Endung, unter der die Aufnahme bei der API ankommt.

    Der Name des Clients kommt zuerst: er stammt vom Aufnehmenden selbst
    und ist damit die beste Auskunft ueber den Container. Der Medientyp ist
    der Rueckweg -- manche Clients schicken nur
    ``application/octet-stream``, und darauf laesst sich nichts gruenden.
    """
    if filename and "." in filename:
        endung = filename.rsplit(".", 1)[1].strip().lower()
        if endung in ENDUNGEN:
            return endung

    basis = (mime or "").split(";")[0].strip().lower()
    return AUS_TYP.get(basis, STANDARD_ENDUNG)


def _sprache_von(antwort: Any) -> str | None:
    """Die erkannte Sprache -- je nach Modell an einem anderen Feld.

    ``gpt-transcribe`` liefert eine Liste ``languages`` (es kann in einer
    Aufnahme mehrere hoeren), die aelteren Modelle ein einzelnes
    ``language``, und ``whisper-1`` im schlichten JSON gar keines.
    """
    if mehrere := getattr(antwort, "languages", None):
        erste = mehrere[0]
        return getattr(erste, "code", None) or str(erste)
    if (eine := getattr(antwort, "language", None)) is not None:
        return str(eine)
    return None
