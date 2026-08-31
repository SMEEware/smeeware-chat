from __future__ import annotations

import asyncio
import contextlib
import json
from collections.abc import AsyncIterator

from fastapi import APIRouter, status
from fastapi.responses import StreamingResponse

from dataclasses import replace

from src.api.deps import ApiAccessDep, ProviderDep
from src.core.exceptions import AppError
from src.core.container import ServiceProvider
from src.core.logging import get_logger
from src.schemas.chat import ChatRequest, ChatResponse, UsageResponse
from src.services.ai.agent import Agent
from src.services.ai.base import CompletionOptions, StreamChunk
from src.services.ai.catalog import resolve
from src.services.speech.runtime import setze_wahl

logger = get_logger(__name__)

# Wie viel vom Werkzeug-Ergebnis in den Stream geht -- genug fuer eine
# Statuszeile im Frontend ("web_search: 5 Treffer..."), nicht das ganze
# Ergebnis (ein Scrape sind schnell 12k Zeichen, die keiner anzeigen will).
TOOL_PREVIEW = 240

# Sekunden Stille, nach denen ein SSE-Kommentar die Leitung wachhaelt. Muss
# deutlich unter dem Body-Timeout des Proxys (Node/undici ~300s) und typischer
# Reverse-Proxys liegen -- sonst bricht ein lang laufendes Werkzeug den Stream
# trotz abgeschalteter Tool-Zeitlimits ab.
HERZSCHLAG = 15.0

router = APIRouter(prefix="/chat", tags=["chat"])


def _fuer(
    provider: ServiceProvider, payload: ChatRequest
) -> tuple[Agent, CompletionOptions]:
    """Aus dem Modellnamen den passenden Agenten und die Optionen bauen.

    Hier faellt die Uebersetzung vom kurzen Namen auf das Tag, das der
    Anbieter kennt: das Frontend schickt "qwen3.6-uncensored", Ollama will
    "tripolskypetr/qwen3.6-uncensored-aggressive:latest" sehen. Ein
    unbekannter Name kommt als 422 aus ``resolve`` zurueck, statt bei
    irgendeinem Anbieter in dessen Fehlermeldung zu landen.
    """
    # Die vom Nutzer gewaehlte Stimme fuer read_aloud in den Anfrage-Kontext
    # legen -- das Werkzeug liest sie dort, ohne dass sie durch jede Schicht
    # gereicht werden muss. Muss vor dem Bauen des Agenten geschehen, weil die
    # spaetere Aufgabe genau diesen Kontext kopiert.
    setze_wahl(model=payload.tts_model, voice=payload.voice_id)

    eintrag = resolve(payload.model)
    agent = provider.agent_for(
        eintrag.runtime, prompt=payload.prompt, tools=payload.tools
    )
    optionen = payload.to_options().merged(model=eintrag.upstream)

    # Wie viel ein Modell denken soll, steht am Katalogeintrag und nicht in
    # der Anfrage: es ist eine Eigenschaft des Modells ("Sol denkt viel,
    # Luna wenig"), keine Entscheidung des Aufrufers. Nur der
    # Responses-Anbieter liest den Wert -- die anderen kennen ihn nicht und
    # bekommen ihn deshalb gar nicht erst.
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
    agent, options = _fuer(provider, payload)
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
    agent, options = _fuer(provider, payload)
    return StreamingResponse(
        _sse(agent, payload, options),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # nginx darf den Strom nicht puffern
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
    # Der Agent laeuft in einer eigenen Aufgabe und schiebt seine Fragmente in
    # eine Schlange. So kann der Rahmen hier bei Stille -- etwa waehrend ein
    # Werkzeug lange arbeitet -- einen Herzschlag senden, OHNE die Generierung
    # abzubrechen. Ein direktes ``wait_for`` auf den Agent-Iterator wuerde bei
    # jedem Herzschlag genau das tun und das laufende Werkzeug mitten im Lauf
    # abwuergen. Die Grenze (maxsize) bremst den Erzeuger, wenn der Client
    # langsamer liest, als das Modell schreibt.
    schlange: asyncio.Queue[tuple[str, object]] = asyncio.Queue(maxsize=256)

    async def erzeugen() -> None:
        try:
            async for chunk in agent.stream(payload.to_domain_messages(), options):
                await schlange.put(("chunk", chunk))
        except asyncio.CancelledError:
            raise  # Client hat abgebrochen -- die Aufgabe soll wirklich enden
        except AppError as exc:
            await schlange.put(("fehler", exc))
        except Exception as exc:  # noqa: BLE001 -- der Strom darf nicht stumm enden
            await schlange.put(("panik", exc))
        finally:
            await schlange.put(("ende", None))

    aufgabe = asyncio.create_task(erzeugen())
    try:
        while True:
            try:
                art, wert = await asyncio.wait_for(
                    schlange.get(), timeout=HERZSCHLAG
                )
            except TimeoutError:
                # Stille -- die Leitung wachhalten. Eine SSE-Kommentarzeile ist
                # kein Frame; das Frontend ueberspringt jede Zeile ohne "data:".
                yield ": keepalive\n\n"
                continue

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
            else:  # "ende" -- der Agent ist fertig
                break

    except asyncio.CancelledError:
        logger.info("Client hat den Stream abgebrochen")
        aufgabe.cancel()
        raise  # niemals schlucken -- sonst haengt das Herunterfahren

    finally:
        # Der Erzeuger darf nie verwaisen: seine Aufraeumung schliesst die
        # Modellverbindung und beendet laufende Unterprozesse.
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
