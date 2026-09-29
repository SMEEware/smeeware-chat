"""Die Stimme des Telefonats.

``POST /voice/speak`` liefert einen Satz als MP3-Strom, ``GET /voice/voices``
die waehlbaren Stimmen. Getrennt vom Vorlesen im Chat (``read_aloud``), weil
das Telefonat eine andere Rechnung hat: viele kurze Saetze, fortlaufend --
mit ElevenLabs waere das schnell teuer, hier kostet es nichts.

Nur angemeldet: ohne Sitzung waere das ein offener Sprach-Proxy fuer jeden,
der das Backend erreicht.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Header
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from src.api.deps import ProviderDep
from src.core.exceptions import ProviderError, UnauthorizedError
from src.services.speech.base import SpeechError
from src.services.speech.neural import MAX_ZEICHEN, STANDARD, STIMMEN, sprechen

router = APIRouter(prefix="/voice", tags=["voice"])

SitzungHeader = Annotated[str | None, Header(alias="X-Session-Id")]


class SpeakIn(BaseModel):
    text: Annotated[str, Field(min_length=1, max_length=MAX_ZEICHEN * 2)]
    voice: Annotated[str | None, Field(max_length=64)] = None
    rate: Annotated[int, Field(ge=-30, le=30)] = 0


class VoiceOut(BaseModel):
    id: str
    name: str
    description: str
    language: str


class VoiceListOut(BaseModel):
    default: str
    voices: list[VoiceOut]


def _angemeldet(provider: ProviderDep, session: str | None) -> None:
    if provider.sessions.holen(session) is None:
        raise UnauthorizedError("Not signed in.")


@router.get("/voices", response_model=VoiceListOut, summary="Voices for the call")
async def voices() -> VoiceListOut:
    return VoiceListOut(
        default=STANDARD,
        voices=[
            VoiceOut(id=s.id, name=s.name, description=s.beschreibung, language=s.sprache)
            for s in STIMMEN
        ],
    )


@router.post("/speak", summary="Speak a sentence (MP3 stream)")
async def speak(
    payload: SpeakIn, provider: ProviderDep, session: SitzungHeader = None
) -> StreamingResponse:
    _angemeldet(provider, session)

    strom = sprechen(payload.text, stimme=payload.voice, tempo=payload.rate)
    # Das erste Stueck vorab holen: scheitert der Dienst, soll das als
    # ordentlicher HTTP-Fehler ankommen (das Frontend spricht dann mit der
    # Browser-Stimme weiter) und nicht als leerer 200er.
    try:
        erstes = await anext(strom)
    except StopAsyncIteration as exc:
        raise ProviderError("The voice service returned no audio.") from exc
    except SpeechError as exc:
        raise ProviderError(str(exc)) from exc

    async def weiter():
        yield erstes
        try:
            async for stueck in strom:
                yield stueck
        except SpeechError:
            return

    return StreamingResponse(
        weiter(),
        media_type="audio/mpeg",
        headers={"Cache-Control": "no-store"},
    )
