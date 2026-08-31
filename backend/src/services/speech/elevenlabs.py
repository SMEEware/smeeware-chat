"""Sprache ueber ElevenLabs.

Ein Aufruf, eine Stimme, ein fertiges MP3. Die Stimme steht in der Adresse
(``/text-to-speech/{voice_id}``), das Modell im Rumpf -- so verlangt es die
API. Der Schluessel geht als ``xi-api-key`` mit.

Warum ElevenLabs die Vorgabe ist, sobald ein Schluessel vorliegt: es spricht
in vielen Sprachen natuerlich und versteht Lautschrift. Ein in Schraegstriche
gesetztes IPA-Stueck -- ``/ɡluːˈkoʊs/`` -- liest es als genau diese Lautung,
nicht als Buchstabenfolge. Das Werkzeug nutzt das; siehe seine Beschreibung.
"""

from __future__ import annotations

import httpx

from src.core.logging import get_logger
from src.services.speech.base import SpeechError, Sprachausgabe, TextToSpeechService

logger = get_logger(__name__)


class ElevenLabsTTS(TextToSpeechService):
    def __init__(
        self,
        *,
        api_key: str,
        base_url: str,
        default_voice: str,
        output_format: str,
        timeout: float,
        http: httpx.AsyncClient | None = None,
    ) -> None:
        self._key = api_key
        self._base = base_url.rstrip("/")
        self._default_voice = default_voice
        self._format = output_format
        self._timeout = timeout if timeout > 0 else None
        # Ein eigener Client, falls keiner geteilt wird -- dann muss er auch
        # wieder geschlossen werden (siehe aclose).
        self._http = http
        self._eigen = http is None

    @property
    def provider(self) -> str:
        return "elevenlabs"

    @property
    def available(self) -> bool:
        return bool(self._key)

    def _client(self) -> httpx.AsyncClient:
        if self._http is None:
            self._http = httpx.AsyncClient(timeout=self._timeout)
        return self._http

    async def synthesize(
        self,
        text: str,
        *,
        voice: str | None = None,
        model: str | None = None,
    ) -> Sprachausgabe:
        stimme = (voice or self._default_voice).strip()
        if not stimme:
            raise SpeechError("No voice id configured for ElevenLabs.")

        url = f"{self._base}/text-to-speech/{stimme}"
        rumpf: dict[str, object] = {
            "text": text,
            "model_id": model or "eleven_multilingual_v2",
        }
        try:
            antwort = await self._client().post(
                url,
                headers={
                    "xi-api-key": self._key,
                    "Content-Type": "application/json",
                    "Accept": "audio/mpeg",
                },
                json=rumpf,
                params={"output_format": self._format},
                timeout=self._timeout,
            )
        except httpx.HTTPError as exc:
            raise SpeechError(f"ElevenLabs is unreachable: {exc}") from exc

        if antwort.status_code != 200:
            raise SpeechError(_grund(antwort, stimme))

        audio = antwort.content
        if not audio:
            raise SpeechError("ElevenLabs returned no audio.")
        return Sprachausgabe(
            audio=audio, mime="audio/mpeg", provider="elevenlabs", voice=stimme
        )

    async def aclose(self) -> None:
        if self._eigen and self._http is not None:
            await self._http.aclose()
            self._http = None


def _grund(antwort: httpx.Response, stimme: str) -> str:
    """Die Meldung des Anbieters lesbar machen -- meist Schluessel oder Stimme."""
    if antwort.status_code == 401:
        return "ElevenLabs rejected the API key (401). Check ELEVENLABS_API_KEY."
    if antwort.status_code == 404:
        return f"ElevenLabs does not know the voice id {stimme!r} (404)."
    try:
        daten = antwort.json()
        detail = daten.get("detail")
        if isinstance(detail, dict):
            detail = detail.get("message") or detail.get("status")
        if detail:
            return f"ElevenLabs error (HTTP {antwort.status_code}): {detail}"
    except Exception:  # noqa: BLE001 -- dann eben nur der Status
        pass
    return f"ElevenLabs error (HTTP {antwort.status_code})."
