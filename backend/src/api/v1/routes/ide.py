from __future__ import annotations

import asyncio
import contextlib
import copy
import json
from dataclasses import replace
from uuid import uuid4

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from src.api.deps import ApiAccessDep, ProviderDep
from src.core.exceptions import AppError, ValidationError
from src.core.logging import get_logger
from src.schemas.ide import IdeChatRequest, IdeCompletionRequest, IdeWebRequest
from src.services.ai.base import CompletionOptions, Message
from src.services.ai.catalog import reasoning_effort_for, resolve
from src.services.ai.ide import CLIENT_TOOLS, WEB_TOOLS, stream_turn
from src.services.tools.base import ToolCall, ToolSpec

logger = get_logger(__name__)
router = APIRouter(prefix="/ide", tags=["ide"])


async def _web_specs(provider) -> tuple[ToolSpec, ...]:
    allowed = await provider.ide_web_selection()
    result = []
    for spec in await provider.ide_web_toolbox.specs():
        if spec.name not in WEB_TOOLS or spec.name not in allowed:
            continue
        parameters = copy.deepcopy(spec.parameters)
        if spec.name == "fetch_json":
            # IDE research cannot POST data or inject authorization headers.
            for key in ("method", "body", "headers"):
                parameters.get("properties", {}).pop(key, None)
        result.append(replace(spec, parameters=parameters))
    return tuple(result)


async def _model(provider, model: str | None, effort: str, tokens: int, specs=()):
    local = provider.local_models
    if any(model in (entry.id, entry.upstream) for entry in local):
        local = await provider.local_models_with_capabilities()
    entry = resolve(model, local=local)
    llm = provider.provider_for(entry.runtime)
    if entry.runtime == "hosted" and llm.name != "deepseek":
        if llm.name == "ollama":
            entries = await provider.hosted_models_with_capabilities()
            entry = next(candidate for candidate in entries if candidate.id == entry.id)
        else:
            entry = replace(entry, reasoning_effort=None, reasoning_efforts=())
    chosen = reasoning_effort_for(entry, effort)
    options = CompletionOptions(model=entry.upstream, max_tokens=tokens, temperature=0.2,
                                tools=tuple(specs), extra={"reasoning_effort": chosen} if chosen else {}, require_complete=True)
    return llm, options


@router.get("/capabilities")
async def capabilities(provider: ProviderDep, _: ApiAccessDep = None):
    web = await _web_specs(provider)
    return {"protocol": 1, "client": "vscode", "notifications": False,
            "client_tools": [spec.name for spec in CLIENT_TOOLS],
            "server_web_tools": [spec.name for spec in web], "completion": True}


@router.post("/chat/stream")
async def chat_stream(payload: IdeChatRequest, provider: ProviderDep, _: ApiAccessDep = None):
    web = await _web_specs(provider) if payload.web else ()
    specs = (*CLIENT_TOOLS, *web)
    llm, options = await _model(provider, payload.model, payload.reasoning_effort, payload.max_tokens, specs)
    return StreamingResponse(_sse(stream_turn(llm, payload, options, specs)),
                             media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


async def _sse(events):
    """Heartbeat, bounded idle wait, and cancellation propagate to the provider."""
    iterator = events.__aiter__()
    task = None
    try:
        while True:
            task = asyncio.create_task(anext(iterator))
            idle = 0
            while not task.done():
                done, _ = await asyncio.wait({task}, timeout=15)
                if done:
                    break
                idle += 15
                if idle >= 180:
                    raise ValidationError("The IDE model stopped responding. No pending tool was executed.")
                yield ": keepalive\n\n"
            try:
                event = task.result()
            except StopAsyncIteration:
                break
            yield "data: " + json.dumps(event, ensure_ascii=False) + "\n\n"
    except AppError as exc:
        yield "data: " + json.dumps({"type": "error", **exc.to_payload()}) + "\n\n"
    except asyncio.CancelledError:
        raise
    except Exception:
        logger.exception("IDE inference failed")
        yield 'data: {"type":"error","error":{"code":"internal_error","message":"IDE inference failed. No pending tool was executed."}}\n\n'
    finally:
        if task and not task.done():
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await task
        await iterator.aclose()
    yield "data: [DONE]\n\n"


@router.post("/web")
async def web_call(payload: IdeWebRequest, provider: ProviderDep, _: ApiAccessDep = None):
    specs = {spec.name: spec for spec in await _web_specs(provider)}
    if payload.tool not in specs:
        raise ValidationError("This tool is not enabled for IDE server research.")
    if payload.tool == "fetch_json" and any(key in payload.arguments for key in ("method", "body", "headers")):
        raise ValidationError("IDE JSON research only supports GET without custom credentials or a body.")
    # No generic toolbox or user-selected target. This object contains research only.
    result = await provider.ide_web_toolbox.invoke(ToolCall(id=uuid4().hex, name=payload.tool, arguments=payload.arguments))
    cap = 16_000
    return {"ok": not result.is_error, "content": result.content[:cap],
            "truncated": len(result.content) > cap, "length": len(result.content), "location": "server_web"}


@router.post("/completion")
async def completion(payload: IdeCompletionRequest, provider: ProviderDep, _: ApiAccessDep = None):
    llm, options = await _model(provider, payload.model, "low", payload.max_tokens)
    messages = [Message(role="system", content="You are a silent inline code completion engine INSIDE Visual Studio Code. Return ONLY characters to insert at the cursor, no explanation, Markdown fences, prefix echo or tool calls. Follow the file language and indentation. No tools or notifications are available."),
                Message(role="user", content=json.dumps({"source": "VS_CODE_EDITOR_BUFFER", "language": payload.language,
                         "file": payload.file, "prefix": payload.prefix, "suffix": payload.suffix}, ensure_ascii=False))]
    # Deliberately call the provider directly: Agent._with_tools would re-add notify_user.
    result = await llm.complete(messages, options)
    if result.tool_calls:
        raise ValidationError("Inline completion attempted to request tools; nothing was executed.")
    return {"content": result.content, "model": result.model}
