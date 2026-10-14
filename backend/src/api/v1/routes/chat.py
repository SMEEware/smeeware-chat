from __future__ import annotations

import asyncio
import contextlib
import json
import re
from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import APIRouter, Header, Path, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from dataclasses import replace

from src.api.deps import ApiAccessDep, ProviderDep
from src.core.exceptions import AppError, ConflictError, ConfigurationError, NotFoundError, UnauthorizedError, ValidationError
from src.core.container import ServiceProvider
from src.core.logging import get_logger
from src.schemas.chat import MAX_CHARS, ChatRequest, ChatResponse, UsageResponse
from src.services.ai.agent import Agent
from src.services.ai.base import CompletionOptions, Message, StreamChunk
from src.services.ai.attachments import describe_uploads, file_instructions
from src.services.ai.catalog import resolve
from src.services.ai.modes import system_addition_for
from src.services.ai.steering import STEERING, Interjection
from src.services.speech.runtime import set_choice
from src.services.tools.local.files import FileContext, reset_file_context, set_file_context

logger = get_logger(__name__)

TOOL_PREVIEW = 240

HEARTBEAT = 15.0

IDLE_MAX = 600.0

ID_PATTERN = r"^[A-Za-z0-9_-]+$"
UPLOAD_LINK = re.compile(r"/api/uploads/([0-9a-f]{32})(?![0-9a-f])")
SessionHeader = Annotated[str | None, Header(alias="X-Session-Id")]

router = APIRouter(prefix="/chat", tags=["chat"])


def _prepare_files(
    provider: ServiceProvider, payload: ChatRequest, session_id: str | None,
) -> tuple[list[Message], FileContext | None, str | None]:
    attached = any(message.attachment_ids for message in payload.messages)
    signed_in = provider.sessions.fetch(session_id) if session_id else None
    if attached and signed_in is None:
        raise UnauthorizedError("Sign in to use file attachments.")
    if attached and not provider.settings.uploads_enabled:
        raise ConfigurationError("Uploads are disabled (UPLOADS_ENABLED=false).")
    for message in payload.messages:
        if len(message.attachment_ids) > provider.settings.uploads_max_files:
            raise ValidationError(
                "Too many file attachments in one message.",
                details={"max_files": provider.settings.uploads_max_files},
            )

    addition = system_addition_for(payload.mode)
    if not signed_in or not payload.chat_id or not provider.settings.uploads_enabled:
        return payload.to_domain_messages(), None, addition

    ids = list(dict.fromkeys(
        file_id for message in payload.messages for file_id in message.attachment_ids
    ))
    store = provider.uploads
    # Export links in earlier answers remain available for follow-up edits.
    for message in payload.messages:
        if message.role != "assistant":
            continue
        for file_id in UPLOAD_LINK.findall(message.content):
            if file_id in ids:
                continue
            try:
                file = store.get(file_id)
            except NotFoundError:
                continue
            if file.chat_id == payload.chat_id:
                ids.append(file_id)
    files = {file.id: file for file in store.bind(ids, payload.chat_id)}
    blocks = {
        index: describe_uploads([files[file_id] for file_id in message.attachment_ids])
        for index, message in enumerate(payload.messages) if message.attachment_ids
    }
    context = FileContext(
        store=store, chat_id=payload.chat_id, file_ids=set(ids),
        max_extracted_bytes=provider.settings.uploads_max_extracted_bytes,
        max_archive_members=provider.settings.uploads_max_archive_members,
    )
    addition = "\n\n".join(filter(None, [addition, file_instructions(context, tools=payload.tools)]))
    return payload.to_domain_messages(blocks), context, addition


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
    payload: ChatRequest, provider: ProviderDep, _: ApiAccessDep = None,
    session: SessionHeader = None,
) -> ChatResponse:
    messages, file_context, addition = _prepare_files(provider, payload, session)
    agent, options = await _resolve_agent(provider, payload)
    token = set_file_context(file_context) if file_context else None
    try:
        completion = await agent.complete(messages, options, system_addition=addition)
    finally:
        if token is not None:
            reset_file_context(token)

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
    session: SessionHeader = None,
) -> StreamingResponse:
    messages, file_context, addition = _prepare_files(provider, payload, session)
    agent, options = await _resolve_agent(provider, payload)
    return StreamingResponse(
        _sse(agent, payload, options, messages=messages, file_context=file_context,
             system_addition=addition, session_id=session),
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
    *,
    messages: list[Message] | None = None,
    file_context: FileContext | None = None,
    system_addition: str | None = None,
    session_id: str | None = None,
) -> AsyncIterator[str]:
    queue: asyncio.Queue[tuple[str, object]] = asyncio.Queue(maxsize=256)

    stream_id = payload.stream_id
    if stream_id:
        if not STEERING.open(stream_id, chat_id=payload.chat_id, session_id=session_id):
            yield _frame(data={"type": "error", "error": {"code": "conflict", "message": "This stream is already running."}})
            yield "data: [DONE]\n\n"
            return

    def collect_steering():
        items = STEERING.clear(stream_id) if stream_id else []
        if file_context:
            for item in items:
                file_context.file_ids.update(item.file_ids)
        return items

    steer = collect_steering if stream_id else None

    async def generate() -> None:
        token = set_file_context(file_context) if file_context else None
        try:
            async for chunk in agent.stream(
                messages if messages is not None else payload.to_domain_messages(),
                options,
                steer=steer,
                system_addition=system_addition,
            ):
                await queue.put(("chunk", chunk))
        except asyncio.CancelledError:
            raise
        except AppError as exc:
            await queue.put(("error", exc))
        except Exception as exc:  # noqa: BLE001
            await queue.put(("panik", exc))
        finally:
            if token is not None:
                reset_file_context(token)
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
        return {"type": "steer", "id": chunk.ref, "content": chunk.text, "attachments": list(chunk.attachments)}
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
    chat_id: Annotated[str | None, Field(max_length=64, pattern=ID_PATTERN)] = None
    attachment_ids: Annotated[
        list[Annotated[str, Field(pattern=r"^[0-9a-f]{32}$")]], Field(max_length=50)
    ] = Field(default_factory=list)


@router.post(
    "/stream/{stream_id}/steer",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Slip a message into a running turn",
)
async def steer_in(
    payload: SteerIn,
    stream_id: Annotated[str, Path(max_length=64, pattern=ID_PATTERN)],
    provider: ProviderDep,
    _: ApiAccessDep = None,
    session: SessionHeader = None,
) -> dict[str, bool]:
    owner = STEERING.owner(stream_id)
    if owner is None:
        raise ConflictError("This turn is no longer running.")
    chat_id, owner_session = owner
    if owner_session is not None and session != owner_session:
        raise UnauthorizedError("This stream belongs to another session.")
    text = payload.content
    attachments = ()
    if payload.attachment_ids:
        if not chat_id or payload.chat_id != chat_id:
            raise ValidationError("File attachments must belong to the running conversation.")
        request = ChatRequest(
            chat_id=chat_id,
            messages=[{"role": "user", "content": text, "attachment_ids": payload.attachment_ids}],
        )
        messages, _, _ = _prepare_files(provider, request, session)
        text = messages[-1].content
        attachments = tuple({
            "id": file.id, "name": file.filename, "mediaType": file.media_type, "bytes": file.bytes,
            "kind": "image" if file.media_type in {"image/png", "image/jpeg", "image/webp", "image/gif"} else "file",
        } for file in (provider.uploads.get(identifier) for identifier in payload.attachment_ids))
    if not STEERING.submit(stream_id, Interjection(
        id=payload.id, text=text, file_ids=tuple(payload.attachment_ids),
        display_text=payload.content, attachments=attachments,
    )):
        raise ConflictError("This turn is no longer running.")
    return {"accepted": True}


@router.delete(
    "/stream/{stream_id}/steer/{interjection_id}",
    summary="Withdraw a slipped-in message that was not picked up yet",
)
async def steer_out(
    stream_id: Annotated[str, Path(max_length=64, pattern=ID_PATTERN)],
    interjection_id: Annotated[str, Path(max_length=64, pattern=ID_PATTERN)],
    session: SessionHeader = None,
    _: ApiAccessDep = None,
) -> dict[str, bool]:
    owner = STEERING.owner(stream_id)
    if owner is not None and owner[1] is not None and owner[1] != session:
        raise UnauthorizedError("This stream belongs to another session.")
    return {"withdrawn": STEERING.withdraw(stream_id, interjection_id)}
