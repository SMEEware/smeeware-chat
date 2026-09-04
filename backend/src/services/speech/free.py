"""Sprache ohne Schluessel -- der Rueckfall.

Wenn kein ElevenLabs-Schluessel vorliegt, soll das Vorlesen trotzdem
funktionieren. Diese Stimme kommt vom oeffentlichen TTS-Endpunkt des
Google-Uebersetzers: kostenlos, ohne Anmeldung, liefert ein MP3.

Zwei Eigenheiten, die den Code praegen:

- Er nimmt pro Anfrage nur ein kurzes Stueck Text (rund 200 Zeichen). Laengeres
  quittiert er mit HTTP 400. Also wird der Text in Stuecke an Satz- und
  Wortgrenzen zerlegt und die MP3-Teile hintereinandergehaengt -- MP3 laesst
  sich so verketten, und jeder Browser spielt das Ergebnis am Stueck.
- Er will einen browserartigen ``User-Agent``, sonst blockt er.

Kein Ersatz fuer ElevenLabs: eine feste Stimme, nur die eingestellte Sprache,
keine Lautschrift. Aber eine, die spricht, wenn sonst nichts da ist.
"""

from __future__ import annotations

import asyncio
import re
from urllib.parse import urlencode

import httpx

from src.core.logging import get_logger
from src.services.speech.base import SpeechError, Sprachausgabe, TextToSpeechService

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
        self._eigen = http is None

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
        voice: str | None = None,  # noqa: ARG002 -- keine waehlbaren Stimmen
        model: str | None = None,  # noqa: ARG002
    ) -> Sprachausgabe:
        stuecke = _zerlegen(text, CHUNK)
        if not stuecke:
            raise SpeechError("Nothing to speak.")

        teile: list[bytes] = []
        for stueck in stuecke:
            teile.append(await self._eins(stueck))
        audio = b"".join(teile)
        if not audio:
            raise SpeechError("The free speech service returned no audio.")
        return Sprachausgabe(
            audio=audio, mime="audio/mpeg", provider="free", voice=None
        )

    async def _eins(self, stueck: str) -> bytes:
        params = urlencode(
            {
                "ie": "UTF-8",
                "q": stueck,
                "tl": self._lang,
                "client": "tw-ob",
                "total": 1,
                "idx": 0,
                "textlen": len(stueck),
            }
        )
        try:
            antwort = await self._client().get(
                f"{ENDPOINT}?{params}", headers={"User-Agent": UA}
            )
        except httpx.HTTPError as exc:
            raise SpeechError(f"The free speech service is unreachable: {exc}") from exc

        if antwort.status_code != 200:
            raise SpeechError(
                f"The free speech service refused a chunk (HTTP "
                f"{antwort.status_code}). Add an ELEVENLABS_API_KEY for reliable "
                f"speech."
            )
        await asyncio.sleep(0.05)
        return antwort.content

    async def aclose(self) -> None:
        if self._eigen and self._http is not None:
            await self._http.aclose()
            self._http = None


def _zerlegen(text: str, groesse: int) -> list[str]:
    """Text in sprechbare Stuecke unter ``groesse`` Zeichen.

    Erst an Satzzeichen, dann -- wenn ein Satz zu lang ist -- an Wortgrenzen.
    Ein hartes Abschneiden mitten im Wort waere hoerbar.
    """
    text = " ".join((text or "").split())
    if not text:
        return []

    saetze = re.split(r"(?<=[.!?…])\s+", text)
    stuecke: list[str] = []
    puffer = ""

    def schieben() -> None:
        nonlocal puffer
        if puffer.strip():
            stuecke.append(puffer.strip())
        puffer = ""

    for satz in saetze:
        if len(satz) > groesse:
            schieben()
            for wort in satz.split(" "):
                if len(puffer) + len(wort) + 1 > groesse:
                    schieben()
                puffer = f"{puffer} {wort}".strip()
            schieben()
        elif len(puffer) + len(satz) + 1 > groesse:
            schieben()
            puffer = satz
        else:
            puffer = f"{puffer} {satz}".strip()
    schieben()
    return stuecke
