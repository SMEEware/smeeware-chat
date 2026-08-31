"""Vorlesen -- das Modell spricht, der Browser zeigt es an.

Wie die Bilderzeugung ist das Besondere nicht der Aufruf, sondern der
Rueckkanal: das fertige MP3 wird als Datei abgelegt und ueber den
Ereignis-Bus im Browser angekuendigt, wo eine Sprechanzeige es abspielt und
zum Ton ausschlaegt. Das Modell bekommt am Ende nur einen Satz zurueck, kein
Audio.

Zwei Anbieter, ein Werkzeug: liegt ein ElevenLabs-Schluessel vor, spricht
ElevenLabs in der eingestellten Stimme; fehlt er, faellt es auf den gratis
Dienst zurueck. Welches Modell und welche Stimme gelten, entscheidet nicht das
Modell, sondern der Nutzer -- die Wahl kommt ueber ``runtime.hole_wahl`` aus
der Anfrage. Das Modell liefert nur den Text.

Der Text soll sprechbar sein: kein Code, keine Adressen, keine Aufzaehlungs-
Sternchen -- nur, was man laut sagen wuerde. Fuer schwer auszusprechende
Woerter darf Lautschrift in Schraegstrichen stehen (``/ɡluːˈkoʊs/``);
ElevenLabs liest sie als Lautung.
"""

from __future__ import annotations

import re
import uuid
from pathlib import Path

import httpx

from src.core.config import TTSSettings
from src.core.logging import get_logger
from src.services.events import EventBus
from src.services.speech.base import SpeechError, TextToSpeechService
from src.services.speech.catalog import resolve
from src.services.speech.elevenlabs import ElevenLabsTTS
from src.services.speech.free import FreeTTS
from src.services.speech.runtime import hole_wahl
from src.services.tools.base import ToolError
from src.services.tools.local.base import LocalTool

logger = get_logger(__name__)


class ReadAloudTool(LocalTool):
    name = "read_aloud"
    description = (
        "Speaks text out loud to the user: turns it into audio that plays in "
        "their browser with a live speaking indicator. "
        "Offer this when your answer is long, when it reads well aloud (a "
        "story, an explanation, a summary), or whenever the user asks you to "
        "read, say, narrate or 'tell' them something. A good way to offer is a "
        "short 'Want me to read this to you?' at the end of a longer answer -- "
        "then call this if they say yes. "
        "Write the SPOKEN text yourself, and write it to be heard, not read: "
        "no markdown, no bullet stars, no code, no URLs, no file paths, no "
        "tables -- only what a person would actually say out loud. Rewrite the "
        "gist of your answer into clean sentences rather than pasting it. "
        "For hard-to-pronounce words -- names, loanwords, chemistry, medical "
        "terms -- you MAY drop an IPA transcription in slashes right in the "
        "text, e.g. The medication /ˌɪnsjəˈlɪn/ manages /ˌdaɪəˈbiːtiːz/. Use "
        "several in one text when it helps; they are read as the sound, not "
        "spelled out. "
        "Do NOT pick the voice -- the user sets that. Just pass the text."
    )
    parameters = {
        "type": "object",
        "properties": {
            "text": {
                "type": "string",
                "description": (
                    "The spoken text. Plain, speakable sentences in the user's "
                    "language. IPA in /slashes/ is allowed for tricky words. No "
                    "markdown, code, URLs or anything you would not say aloud."
                ),
            },
        },
        "required": ["text"],
    }

    def __init__(
        self,
        *,
        settings: TTSSettings,
        uploads_dir: Path,
        bus: EventBus | None = None,
        http: httpx.AsyncClient | None = None,
    ) -> None:
        self._cfg = settings
        self._dir = uploads_dir
        self._bus = bus
        self._http = http

    @property
    def _hat_elevenlabs(self) -> bool:
        return bool(self._cfg.api_key and self._cfg.api_key.get_secret_value())

    def _dienst(self, model_id: str) -> TextToSpeechService:
        eintrag = resolve(model_id, elevenlabs=self._hat_elevenlabs)
        if eintrag.runtime == "elevenlabs":
            return ElevenLabsTTS(
                api_key=self._cfg.api_key.get_secret_value(),  # type: ignore[union-attr]
                base_url=self._cfg.base_url,
                default_voice=self._cfg.voice_id,
                output_format=self._cfg.output_format,
                timeout=self._cfg.timeout,
                http=self._http,
            )
        return FreeTTS(language=self._cfg.free_language, http=self._http)

    async def run(self, text: str) -> str:
        sauber = _saeubern(text)
        if not sauber:
            raise ToolError("There is nothing speakable in the text.")
        if len(sauber) > self._cfg.max_chars:
            raise ToolError(
                f"The text is longer than {self._cfg.max_chars} characters. "
                f"Read a shorter piece, or split it."
            )

        wahl = hole_wahl()
        model = wahl.model or self._cfg.default_model
        dienst = self._dienst(model)
        stimme = wahl.voice or self._cfg.voice_id

        lauf = uuid.uuid4().hex
        await self._melde({"type": "speech", "phase": "start", "run": lauf})

        try:
            ausgabe = await dienst.synthesize(sauber, voice=stimme, model=model)
        except SpeechError as exc:
            await self._melde({"type": "speech", "phase": "error", "run": lauf})
            raise ToolError(str(exc)) from exc
        finally:
            await dienst.aclose()

        self._dir.mkdir(parents=True, exist_ok=True)
        pfad = self._dir / f"{uuid.uuid4().hex}.mp3"
        pfad.write_bytes(ausgabe.audio)
        url = f"/api/uploads/{pfad.stem}"

        await self._melde(
            {
                "type": "speech",
                "phase": "done",
                "run": lauf,
                "url": url,
                "provider": ausgabe.provider,
                # Der ganze gesprochene Text: die Anzeige laesst ihn aufklappen
                # und mitlesen. Er steht nicht im Chat-Verlauf (das Modell soll
                # ihn dort nicht wiederholen), also ist das seine einzige
                # sichtbare Fassung.
                "text": sauber,
            }
        )
        logger.info(
            "read_aloud",
            extra={"provider": ausgabe.provider, "bytes": len(ausgabe.audio),
                   "chars": len(sauber)},
        )

        gesprochen = "ElevenLabs" if ausgabe.provider == "elevenlabs" else "the free voice"
        return (
            f"Now playing ({len(ausgabe.audio) // 1024} KB, {gesprochen}). The "
            f"user hears it and sees a speaking indicator. Do not repeat the "
            f"spoken text in your answer -- a brief note that you are reading it "
            f"aloud is enough."
        )

    async def _melde(self, ereignis: dict[str, object]) -> None:
        if self._bus is not None:
            await self._bus.publish(ereignis)


def _saeubern(text: str) -> str:
    """Was nicht sprechbar ist, hier noch herausnehmen.

    Das Modell ist angewiesen, gleich sprechbaren Text zu liefern -- aber ein
    Netz darunter schadet nicht: Code-Zaeune, rohe Adressen und Aufzaehlungs-
    Sternchen sollen nie vorgelesen werden. Die Lautschrift in Schraegstrichen
    bleibt bewusst stehen; sie ist genau der Zweck.
    """
    if not text:
        return ""
    # Ganze Code-Bloecke raus.
    text = re.sub(r"```.*?```", " ", text, flags=re.DOTALL)
    text = re.sub(r"`([^`]*)`", r"\1", text)
    # Rohe URLs raus -- niemand hoert sich ein "h-t-t-p-s-doppelpunkt" an.
    text = re.sub(r"https?://\S+", " ", text)
    # Fuehrende Aufzaehlungszeichen zeilenweise entfernen.
    text = re.sub(r"(?m)^\s*[-*•]\s+", "", text)
    # Markdown-Betonung ohne die Sternchen/Unterstriche.
    text = re.sub(r"[*_]{1,3}([^*_]+)[*_]{1,3}", r"\1", text)
    return " ".join(text.split()).strip()
