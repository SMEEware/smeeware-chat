from __future__ import annotations

import asyncio
import contextlib
import json
from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import APIRouter, Path, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from dataclasses import replace

from src.api.deps import ApiAccessDep, ProviderDep
from src.core.exceptions import AppError, ConflictError
from src.core.container import ServiceProvider
from src.core.logging import get_logger
from src.schemas.chat import MAX_ZEICHEN, ChatRequest, ChatResponse, UsageResponse
from src.services.ai.agent import Agent
from src.services.ai.base import CompletionOptions, StreamChunk
from src.services.ai.catalog import resolve
from src.services.ai.steering import STEERING, Einschub
from src.services.speech.runtime import setze_wahl

logger = get_logger(__name__)

TOOL_PREVIEW = 240

HERZSCHLAG = 15.0

# Sicherheitsnetz: kommt so lange gar nichts -- kein Token, kein Werkzeug-
# ergebnis --, haengt der Turn. Dann lieber ein sichtbarer Fehler, den der
# Nutzer wiederholen kann, als ein Strom, der fuer immer Keepalives schickt.
# Grosszuegig, weil ein einzelnes Werkzeug (Bilderzeugung) Minuten brauchen darf.
LEERLAUF_MAX = 600.0

ID_MUSTER = r"^[A-Za-z0-9_-]+$"

router = APIRouter(prefix="/chat", tags=["chat"])


async def _fuer(
    provider: ServiceProvider, payload: ChatRequest
) -> tuple[Agent, CompletionOptions]:
    """Aus dem Modellnamen den passenden Agenten und die Optionen bauen.

    Hier faellt die Uebersetzung vom kurzen Namen auf das Tag, das der
    Anbieter kennt: das Frontend schickt den kurzen Namen eines lokalen
    Modells, Ollama will den vollen ``OLLAMA_MODEL``-Tag sehen. Ein
    unbekannter Name kommt als 422 aus ``resolve`` zurueck, statt bei
    irgendeinem Anbieter in dessen Fehlermeldung zu landen. Die lokalen
    Eintraege reicht ``lokale_modelle`` bei -- ohne sie kennte ``resolve``
    nur die feste Liste und wiese das eigene Ollama-Modell als unbekannt ab.
    """
    setze_wahl(model=payload.tts_model, voice=payload.voice_id)

    eintrag = resolve(payload.model, lokal=provider.lokale_modelle)
    erlaubt, lage = await provider.werkzeug_lage()
    agent = provider.agent_for(
        eintrag.runtime,
        prompt=payload.prompt,
        tools=payload.tools,
        erlaubt=erlaubt,
        lage=lage,
    )
    optionen = payload.to_options().merged(model=eintrag.upstream)

    if eintrag.reasoning_effort and eintrag.runtime == "openai":
        optionen = replace(
            optionen,
            extra={**optionen.extra, "reasoning_effort": eintrag.reasoning_effort},
        )
    return agent, optionen


@router.post(
    "",
    response_model=ChatResponse,
    status_code=status.HTTP_200_OK,
    summary="Answer in one piece",
)
async def chat(
    payload: ChatRequest, provider: ProviderDep, _: ApiAccessDep = None
) -> ChatResponse:
    agent, options = await _fuer(provider, payload)
    completion = await agent.complete(payload.to_domain_messages(), options)

    return ChatResponse(
        content=completion.content,
        model=completion.model,
        finish_reason=completion.finish_reason,
        reasoning=completion.reasoning,
        usage=(
            UsageResponse(
                prompt_tokens=completion.usage.prompt_tokens,
                completion_tokens=completion.usage.completion_tokens,
                total_tokens=completion.usage.total_tokens,
                reasoning_tokens=completion.usage.reasoning_tokens,
            )
            if completion.usage
            else None
        ),
    )


@router.post(
    "/stream",
    summary="Answer as Server-Sent Events",
    response_class=StreamingResponse,
    responses={200: {"content": {"text/event-stream": {}}}},
)
async def chat_stream(
    payload: ChatRequest,
    provider: ProviderDep,
    _: ApiAccessDep = None,
) -> StreamingResponse:
    agent, options = await _fuer(provider, payload)
    return StreamingResponse(
        _sse(agent, payload, options),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


async def _sse(
    agent: Agent,
    payload: ChatRequest,
    options: CompletionOptions,
) -> AsyncIterator[str]:
    """Rahmt die Fragmente des Agents als SSE.

    Jedes Frame traegt ein ``type``: ``reasoning`` waehrend das Modell denkt,
    ``content`` fuer die eigentliche Antwort, ``tool_call`` wenn ein Werkzeug
    angefordert wird und ``tool_result`` fuer dessen Ergebnis. Die beiden
    Werkzeug-Frames tragen zusaetzlich ``tool`` und ``call_id``.
    Ein Reasoning-Modell sendet zuerst ausschliesslich ``reasoning`` -- der
    Client kann so einen "denkt nach"-Zustand zeigen, statt vor einem leeren
    Fenster zu sitzen.

    Der Fehlerfall ist hier besonders: der Status-Code ist beim ersten Frame
    laengst gesendet, also wird der Fehler als eigenes ``error``-Event
    nachgereicht statt als HTTP-Fehler.

    Bricht der Client ab, cancelt Starlette diesen Generator. Der ``async with``
    im Provider schliesst dabei die Verbindung zum Modell, die Generierung
    stoppt. Ein eigener Disconnect-Check waere nur ein ``await`` pro Token,
    das nie greift.
    """
    schlange: asyncio.Queue[tuple[str, object]] = asyncio.Queue(maxsize=256)

    stream_id = payload.stream_id
    if stream_id:
        STEERING.oeffnen(stream_id)
    steer = (lambda: STEERING.leeren(stream_id)) if stream_id else None

    async def erzeugen() -> None:
        try:
            async for chunk in agent.stream(
                payload.to_domain_messages(), options, steer=steer
            ):
                await schlange.put(("chunk", chunk))
        except asyncio.CancelledError:
            raise
        except AppError as exc:
            await schlange.put(("fehler", exc))
        except Exception as exc:  # noqa: BLE001 -- der Strom darf nicht stumm enden
            await schlange.put(("panik", exc))
        finally:
            await schlange.put(("ende", None))

    aufgabe = asyncio.create_task(erzeugen())
    still = 0.0
    try:
        while True:
            try:
                art, wert = await asyncio.wait_for(
                    schlange.get(), timeout=HERZSCHLAG
                )
            except TimeoutError:
                still += HERZSCHLAG
                if still >= LEERLAUF_MAX:
                    logger.warning("Stream seit %.0fs still -- breche ab", still)
                    yield _frame(
                        event="error",
                        data={
                            "type": "error",
                            "error": {
                                "code": "stalled",
                                "message": "The model stopped responding. Try again.",
                            },
                        },
                    )
                    break
                yield ": keepalive\n\n"
                continue
            still = 0.0

            if art == "chunk":
                yield _frame(data=_frame_of(wert))  # type: ignore[arg-type]
            elif art == "fehler":
                logger.warning("Stream mit Fehler beendet: %s", wert.message)  # type: ignore[union-attr]
                yield _frame(
                    event="error",
                    data={"type": "error", **wert.to_payload()},  # type: ignore[union-attr]
                )
                break
            elif art == "panik":
                logger.error("Unerwarteter Fehler im Stream", exc_info=wert)  # type: ignore[arg-type]
                yield _frame(
                    event="error",
                    data={
                        "type": "error",
                        "error": {
                            "code": "internal_error",
                            "message": "Internal error.",
                        },
                    },
                )
                break
            else:
                break

    except asyncio.CancelledError:
        logger.info("Client hat den Stream abgebrochen")
        aufgabe.cancel()
        raise

    finally:
        if stream_id:
            STEERING.schliessen(stream_id)
        if not aufgabe.done():
            aufgabe.cancel()
        with contextlib.suppress(asyncio.CancelledError, Exception):
            await aufgabe

    yield "data: [DONE]\n\n"


def _frame_of(chunk: StreamChunk) -> dict[str, object]:
    """Uebersetzt ein Stream-Fragment in ein SSE-Frame fuers Frontend.

    reasoning/content tragen den Text als ``delta``. Die Werkzeug-Frames sind
    Marker fuer eine Status-Anzeige: ``tool_call`` sagt, WAS mit welchen
    Argumenten laeuft; ``tool_result`` sagt, ob es geklappt hat (``ok``) und
    gibt eine kurze Vorschau plus die volle Laenge -- nicht das ganze Ergebnis.
    """
    if chunk.kind == "tool_call":
        return {
            "type": "tool_call",
            "tool": chunk.tool_name,
            "call_id": chunk.tool_call_id,
            "arguments": _args(chunk.text),
        }
    if chunk.kind == "steer":
        return {"type": "steer", "id": chunk.ref, "content": chunk.text}
    if chunk.kind == "tool_result":
        text = chunk.text or ""
        return {
            "type": "tool_result",
            "tool": chunk.tool_name,
            "call_id": chunk.tool_call_id,
            "ok": not chunk.is_error,
            "preview": _preview(text),
            "length": len(text),
        }
    return {"type": chunk.kind, "delta": chunk.text}


def _args(raw: str) -> object:
    """Argument-JSON als Objekt zurueckgeben; im Zweifel den Rohtext."""
    try:
        return json.loads(raw) if raw else {}
    except json.JSONDecodeError:
        return raw


def _preview(text: str) -> str:
    einzeilig = " ".join(text.split())
    return einzeilig[:TOOL_PREVIEW] + ("..." if len(einzeilig) > TOOL_PREVIEW else "")


def _frame(*, data: dict[str, object], event: str | None = None) -> str:
    prefix = f"event: {event}\n" if event else ""
    return f"{prefix}data: {json.dumps(data, ensure_ascii=False)}\n\n"


class SteerIn(BaseModel):
    id: Annotated[str, Field(min_length=1, max_length=64, pattern=ID_MUSTER)]
    content: Annotated[str, Field(min_length=1, max_length=MAX_ZEICHEN)]


@router.post(
    "/stream/{stream_id}/steer",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Slip a message into a running turn",
)
async def steer_in(
    payload: SteerIn,
    stream_id: Annotated[str, Path(max_length=64, pattern=ID_MUSTER)],
    _: ApiAccessDep = None,
) -> dict[str, bool]:
    """Eine Nachricht in einen laufenden Turn schieben.

    Sie wird an der naechsten Rundengrenze aufgenommen und im Strom mit einem
    ``steer``-Frame quittiert. 409 heisst: der Turn ist schon vorbei -- der
    Client schickt die Nachricht dann als normalen naechsten Turn.
    """
    if not STEERING.einwerfen(stream_id, Einschub(id=payload.id, text=payload.content)):
        raise ConflictError("This turn is no longer running.")
    return {"accepted": True}


@router.delete(
    "/stream/{stream_id}/steer/{einschub_id}",
    summary="Withdraw a slipped-in message that was not picked up yet",
)
async def steer_out(
    stream_id: Annotated[str, Path(max_length=64, pattern=ID_MUSTER)],
    einschub_id: Annotated[str, Path(max_length=64, pattern=ID_MUSTER)],
    _: ApiAccessDep = None,
) -> dict[str, bool]:
    return {"withdrawn": STEERING.zurueckziehen(stream_id, einschub_id)}
