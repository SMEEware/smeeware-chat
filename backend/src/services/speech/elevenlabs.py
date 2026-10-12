from __future__ import annotations

import httpx

from src.core.logging import get_logger
from src.services.speech.base import SpeechError, SpeechOutput, TextToSpeechService

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
        self._http = http
        self._owns_client = http is None

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
    ) -> SpeechOutput:
        voice_id = (voice or self._default_voice).strip()
        if not voice_id:
            raise SpeechError("No voice id configured for ElevenLabs.")

        url = f"{self._base}/text-to-speech/{voice_id}"
        body_rows: dict[str, object] = {
            "text": text,
            "model_id": model or "eleven_multilingual_v2",
        }
        try:
            response = await self._client().post(
                url,
                headers={
                    "xi-api-key": self._key,
                    "Content-Type": "application/json",
                    "Accept": "audio/mpeg",
                },
                json=body_rows,
                params={"output_format": self._format},
                timeout=self._timeout,
            )
        except httpx.HTTPError as exc:
            raise SpeechError(f"ElevenLabs is unreachable: {exc}") from exc

        if response.status_code != 200:
            raise SpeechError(_reason(response, voice_id))

        audio = response.content
        if not audio:
            raise SpeechError("ElevenLabs returned no audio.")
        return SpeechOutput(
            audio=audio, mime="audio/mpeg", provider="elevenlabs", voice=voice_id
        )

    async def aclose(self) -> None:
        if self._owns_client and self._http is not None:
            await self._http.aclose()
            self._http = None


def _reason(response: httpx.Response, voice_id: str) -> str:
    if response.status_code == 401:
        return "ElevenLabs rejected the API key (401). Check ELEVENLABS_API_KEY."
    if response.status_code == 404:
        return f"ElevenLabs does not know the voice id {voice_id!r} (404)."
    try:
        data = response.json()
        detail = data.get("detail")
        if isinstance(detail, dict):
            detail = detail.get("message") or detail.get("status")
        if detail:
            return f"ElevenLabs error (HTTP {response.status_code}): {detail}"
    except Exception:  # noqa: BLE001
        pass
    return f"ElevenLabs error (HTTP {response.status_code})."
