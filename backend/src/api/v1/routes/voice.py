from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Header
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from src.api.deps import ProviderDep
from src.core.exceptions import ProviderError, UnauthorizedError
from src.services.speech.base import SpeechError
from src.services.speech.neural import MAX_CHARS, STANDARD, VOICES, stream_speech

router = APIRouter(prefix="/voice", tags=["voice"])

SessionHeader = Annotated[str | None, Header(alias="X-Session-Id")]


class SpeakIn(BaseModel):
    text: Annotated[str, Field(min_length=1, max_length=MAX_CHARS * 2)]
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


def _signed_in(provider: ProviderDep, session: str | None) -> None:
    if provider.sessions.fetch(session) is None:
        raise UnauthorizedError("Not signed in.")


@router.get("/voices", response_model=VoiceListOut, summary="Voices for the call")
async def voices() -> VoiceListOut:
    return VoiceListOut(
        default=STANDARD,
        voices=[
            VoiceOut(id=s.id, name=s.name, description=s.description, language=s.language)
            for s in VOICES
        ],
    )


@router.post("/speak", summary="Speak a sentence (MP3 stream)")
async def speak(
    payload: SpeakIn, provider: ProviderDep, session: SessionHeader = None
) -> StreamingResponse:
    _signed_in(provider, session)

    stream = stream_speech(payload.text, voice=payload.voice, tempo=payload.rate)
    try:
        first_item = await anext(stream)
    except StopAsyncIteration as exc:
        raise ProviderError("The voice service returned no audio.") from exc
    except SpeechError as exc:
        raise ProviderError(str(exc)) from exc

    async def relay():
        yield first_item
        try:
            async for chunk in stream:
                yield chunk
        except SpeechError:
            return

    return StreamingResponse(
        relay(),
        media_type="audio/mpeg",
        headers={"Cache-Control": "no-store"},
    )
