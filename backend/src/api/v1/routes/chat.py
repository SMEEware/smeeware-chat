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
from src.schemas.chat import MAX_CHARS, ChatRequest, ChatResponse, UsageResponse
from src.services.ai.agent import Agent
from src.services.ai.base import CompletionOptions, StreamChunk
from src.services.ai.catalog import resolve
from src.services.ai.modes import system_addition_for
from src.services.ai.steering import STEERING, Interjection
from src.services.speech.runtime import set_choice

logger = get_logger(__name__)

TOOL_PREVIEW = 240

HEARTBEAT = 15.0

IDLE_MAX = 600.0

ID_PATTERN = r"^[A-Za-z0-9_-]+$"

router = APIRouter(prefix="/chat", tags=["chat"])


async def _resolve_agent(
    provider: ServiceProvider, payload: ChatRequest
) -> tuple[Agent, CompletionOptions]:
    set_choice(model=payload.tts_model, voice=payload.voice_id)

    entry = resolve(payload.model, local=provider.local_models)
    allowed, state = await provider.tool_state()
    agent = provider.agent_for(
        entry.runtime,
        prompt=payload.prompt,
        tools=payload.tools,
        allowed=allowed,
        state=state,
    )
    options = payload.to_options().merged(model=entry.upstream)

    if entry.reasoning_effort and entry.runtime == "openai":
        options = replace(
            options,
            extra={**options.extra, "reasoning_effort": entry.reasoning_effort},
        )
    return agent, options


@router.post(
    "",
    response_model=ChatResponse,
    status_code=status.HTTP_200_OK,
    summary="Answer in one piece",
)
async def chat(
    payload: ChatRequest, provider: ProviderDep, _: ApiAccessDep = None
) -> ChatResponse:
    agent, options = await _resolve_agent(provider, payload)
    completion = await agent.complete(
        payload.to_domain_messages(), options, system_addition=system_addition_for(payload.mode)
    )

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
    agent, options = await _resolve_agent(provider, payload)
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
    queue: asyncio.Queue[tuple[str, object]] = asyncio.Queue(maxsize=256)

    stream_id = payload.stream_id
    if stream_id:
        STEERING.open(stream_id)
    steer = (lambda: STEERING.clear(stream_id)) if stream_id else None

    async def generate() -> None:
        try:
            async for chunk in agent.stream(
                payload.to_domain_messages(),
                options,
                steer=steer,
                system_addition=system_addition_for(payload.mode),
            ):
                await queue.put(("chunk", chunk))
        except asyncio.CancelledError:
            raise
        except AppError as exc:
            await queue.put(("error", exc))
        except Exception as exc:  # noqa: BLE001
            await queue.put(("panik", exc))
        finally:
            await queue.put(("end", None))

    task = asyncio.create_task(generate())
    still = 0.0
    try:
        while True:
            try:
                tag, value = await asyncio.wait_for(
                    queue.get(), timeout=HEARTBEAT
                )
            except TimeoutError:
                still += HEARTBEAT
                if still >= IDLE_MAX:
                    logger.warning("Stream silent for %.0fs -- aborting", still)
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

            if tag == "chunk":
                yield _frame(data=_frame_of(value))  # type: ignore[arg-type]
            elif tag == "error":
                logger.warning("Stream ended with an error: %s", value.message)  # type: ignore[union-attr]
                yield _frame(
                    event="error",
                    data={"type": "error", **value.to_payload()},  # type: ignore[union-attr]
                )
                break
            elif tag == "panik":
                logger.error("Unexpected error in stream", exc_info=value)  # type: ignore[arg-type]
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
        logger.info("Client aborted the stream")
        task.cancel()
        raise

    finally:
        if stream_id:
            STEERING.close(stream_id)
        if not task.done():
            task.cancel()
        with contextlib.suppress(asyncio.CancelledError, Exception):
            await task

    yield "data: [DONE]\n\n"


def _frame_of(chunk: StreamChunk) -> dict[str, object]:
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
    try:
        return json.loads(raw) if raw else {}
    except json.JSONDecodeError:
        return raw


def _preview(text: str) -> str:
    single_line = " ".join(text.split())
    return single_line[:TOOL_PREVIEW] + ("..." if len(single_line) > TOOL_PREVIEW else "")


def _frame(*, data: dict[str, object], event: str | None = None) -> str:
    prefix = f"event: {event}\n" if event else ""
    return f"{prefix}data: {json.dumps(data, ensure_ascii=False)}\n\n"


class SteerIn(BaseModel):
    id: Annotated[str, Field(min_length=1, max_length=64, pattern=ID_PATTERN)]
    content: Annotated[str, Field(min_length=1, max_length=MAX_CHARS)]


@router.post(
    "/stream/{stream_id}/steer",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Slip a message into a running turn",
)
async def steer_in(
    payload: SteerIn,
    stream_id: Annotated[str, Path(max_length=64, pattern=ID_PATTERN)],
    _: ApiAccessDep = None,
) -> dict[str, bool]:
    if not STEERING.submit(stream_id, Interjection(id=payload.id, text=payload.content)):
        raise ConflictError("This turn is no longer running.")
    return {"accepted": True}


@router.delete(
    "/stream/{stream_id}/steer/{einschub_id}",
    summary="Withdraw a slipped-in message that was not picked up yet",
)
async def steer_out(
    stream_id: Annotated[str, Path(max_length=64, pattern=ID_PATTERN)],
    interjection_id: Annotated[str, Path(max_length=64, pattern=ID_PATTERN)],
    _: ApiAccessDep = None,
) -> dict[str, bool]:
    return {"withdrawn": STEERING.withdraw(stream_id, interjection_id)}
