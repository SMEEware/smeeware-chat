from __future__ import annotations

import json
from collections.abc import AsyncIterator, Sequence
from typing import Any

from openai import AsyncOpenAI

from src.core.logging import get_logger
from src.services.ai.base import (
    Completion,
    CompletionOptions,
    LLMProvider,
    Message,
    StreamChunk,
    Usage,
)
from src.services.ai.providers.openai_compatible import _translate_errors
from src.services.ai.catalog import known_model, reasoning_effort_for
from src.services.tools.base import ToolCall

logger = get_logger(__name__)

class OpenAIResponsesProvider(LLMProvider):
    name = "openai"

    def __init__(
        self,
        *,
        api_key: str,
        default_model: str,
        base_url: str | None = None,
        timeout: float = 600.0,
        max_retries: int = 1,
        reasoning_effort: str = "medium",
        reasoning_summary: str = "detailed",
    ) -> None:
        self.default_model = default_model
        self._effort = reasoning_effort
        self._summary = reasoning_summary
        self._client = AsyncOpenAI(
            api_key=api_key,
            base_url=base_url or "https://api.openai.com/v1",
            timeout=timeout if timeout and timeout > 0 else None,
            max_retries=max_retries,
        )


    async def complete(
        self,
        messages: Sequence[Message],
        options: CompletionOptions | None = None,
    ) -> Completion:
        options = options or CompletionOptions()

        with _translate_errors(self.name):
            response = await self._client.responses.create(
                stream=False, **self._payload(messages, options)
            )

        text: list[str] = []
        reasoning: list[str] = []
        calls: list[ToolCall] = []

        for entry in response.output or ():
            label = getattr(entry, "type", None)
            if label == "message":
                for part in getattr(entry, "content", None) or ():
                    if getattr(part, "type", None) == "output_text":
                        text.append(part.text)
            elif label == "reasoning":
                for part in getattr(entry, "summary", None) or ():
                    reasoning.append(getattr(part, "text", "") or "")
            elif label == "function_call":
                calls.append(_call_from(entry))

        return Completion(
            content="".join(text),
            model=response.model,
            finish_reason=response.status,
            reasoning="".join(reasoning) or None,
            usage=_usage_from(response.usage),
            tool_calls=tuple(calls),
        )

    async def stream(
        self,
        messages: Sequence[Message],
        options: CompletionOptions | None = None,
    ) -> AsyncIterator[StreamChunk]:
        options = options or CompletionOptions()

        with _translate_errors(self.name):
            stream = await self._client.responses.create(
                stream=True, **self._payload(messages, options)
            )

            async for event in stream:
                label = event.type

                if label == "response.reasoning_summary_text.delta":
                    if event.delta:
                        yield StreamChunk(kind="reasoning", text=event.delta)

                elif label == "response.output_text.delta":
                    if event.delta:
                        yield StreamChunk(kind="content", text=event.delta)

                elif label == "response.output_item.done":
                    entry = event.item
                    if getattr(entry, "type", None) == "function_call":
                        call = _call_from(entry)
                        yield StreamChunk(
                            kind="tool_call",
                            text=json.dumps(call.arguments, ensure_ascii=False),
                            tool_name=call.name,
                            tool_call_id=call.id,
                        )

                elif label in ("error", "response.failed"):
                    raise _error_from(event)

    async def aclose(self) -> None:
        await self._client.close()

    async def health(self) -> bool:
        try:
            await self._client.models.list()
        except Exception as exc:  # noqa: BLE001
            logger.warning("Health check for %s failed: %s", self.name, exc)
            return False
        return True


    def _payload(
        self, messages: Sequence[Message], options: CompletionOptions
    ) -> dict[str, Any]:
        instruction, user_input = _input_from(messages)

        payload: dict[str, Any] = {
            "model": options.model or self.default_model,
            "input": user_input,
            "store": False,
        }
        effort = self._effort_for(options)
        if effort is not None:
            payload["reasoning"] = {"effort": effort}
            if effort != "none":
                payload["reasoning"]["summary"] = self._summary
        if instruction:
            payload["instructions"] = instruction
        if options.max_tokens is not None:
            payload["max_output_tokens"] = options.max_tokens
        if options.tools:
            payload["tools"] = [_tool_from(spec) for spec in options.tools]

        extra = dict(options.extra)
        extra.pop("reasoning_effort", None)
        extra.pop("reasoning", None)
        payload.update(extra)
        return payload

    def _effort_for(self, options: CompletionOptions) -> str | None:
        entry = known_model(options.model or self.default_model, runtime="openai")
        if entry is None:
            return None
        preferred = options.extra.get("reasoning_effort")
        if preferred is None and options.model is None:
            preferred = self._effort
        return reasoning_effort_for(entry, preferred)


def _input_from(messages: Sequence[Message]) -> tuple[str, list[dict[str, Any]]]:
    instructions: list[str] = []
    user_input: list[dict[str, Any]] = []

    for message in messages:
        if message.role == "system":
            instructions.append(message.content)
            continue

        if message.role == "tool":
            user_input.append(
                {
                    "type": "function_call_output",
                    "call_id": message.tool_call_id or "",
                    "output": message.content,
                }
            )
            continue

        if message.content:
            user_input.append({"role": message.role, "content": message.content})

        for call in message.tool_calls:
            user_input.append(
                {
                    "type": "function_call",
                    "call_id": call.id,
                    "name": call.name,
                    "arguments": json.dumps(call.arguments, ensure_ascii=False),
                }
            )

    return "\n\n".join(instructions), user_input


def _tool_from(spec: Any) -> dict[str, Any]:
    return {
        "type": "function",
        "name": spec.name,
        "description": spec.description,
        "parameters": spec.parameters or {"type": "object", "properties": {}},
    }


def _call_from(entry: Any) -> ToolCall:
    raw = getattr(entry, "arguments", "") or ""
    try:
        arguments = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError:
        logger.warning("Tool arguments are not valid JSON: %r", raw[:200])
        arguments = {"_invalid_json": raw}
    return ToolCall(
        id=getattr(entry, "call_id", "") or getattr(entry, "id", ""),
        name=getattr(entry, "name", "") or "",
        arguments=arguments if isinstance(arguments, dict) else {"value": arguments},
    )


def _error_from(event: Any) -> Exception:
    from src.core.exceptions import ProviderError

    error = getattr(event, "error", None) or getattr(
        getattr(event, "response", None), "error", None
    )
    message = getattr(error, "message", None) or "OpenAI ended the run with an error."
    return ProviderError(message, details={"provider": "openai"})


def _usage_from(usage: Any) -> Usage | None:
    if usage is None:
        return None
    details = getattr(usage, "output_tokens_details", None)
    return Usage(
        prompt_tokens=getattr(usage, "input_tokens", 0) or 0,
        completion_tokens=getattr(usage, "output_tokens", 0) or 0,
        reasoning_tokens=getattr(details, "reasoning_tokens", None) or 0,
    )
