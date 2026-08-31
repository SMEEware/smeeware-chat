"""Basis fuer alle Anbieter, die das OpenAI-Chat-Completions-Format sprechen.

DeepSeek, Groq, Together, vLLM & Co. unterscheiden sich nur in ``base_url`` und
Modellnamen -- die Logik liegt deshalb genau einmal hier.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator, Sequence
from dataclasses import dataclass
from typing import Any

import openai
from openai import AsyncOpenAI

from src.core.exceptions import (
    ProviderError,
    ProviderTimeoutError,
    RateLimitedError,
    UnauthorizedError,
)
from src.core.logging import get_logger
from src.services.ai.base import (
    Completion,
    CompletionOptions,
    LLMProvider,
    Message,
    StreamChunk,
    Usage,
)
from src.services.tools.base import ToolCall

logger = get_logger(__name__)


class OpenAICompatibleProvider(LLMProvider):
    name = "openai-compatible"
    base_url: str = "https://api.openai.com/v1"

    def __init__(
        self,
        *,
        api_key: str,
        default_model: str,
        base_url: str | None = None,
        timeout: float = 60.0,
        max_retries: int = 2,
    ) -> None:
        self.default_model = default_model
        self._client = AsyncOpenAI(
            api_key=api_key,
            base_url=base_url or self.base_url,
            # 0 = kein Zeitlimit: lange Antworten und langer Reasoning-Vorlauf
            # brechen nicht mehr ab. None ist bei der OpenAI-Bibliothek das
            # "unbegrenzt".
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
            response = await self._client.chat.completions.create(
                stream=False,
                **self._payload(messages, options),
            )

        choice = response.choices[0]
        return Completion(
            content=choice.message.content or "",
            model=response.model,
            finish_reason=choice.finish_reason,
            reasoning=(
                getattr(choice.message, "reasoning_content", None)
                or getattr(choice.message, "reasoning", None)
                or None
            ),
            usage=_usage_of(response.usage),
            tool_calls=tuple(
                _tool_call_of(raw) for raw in (choice.message.tool_calls or [])
            ),
        )

    async def stream(
        self,
        messages: Sequence[Message],
        options: CompletionOptions | None = None,
    ) -> AsyncIterator[StreamChunk]:
        options = options or CompletionOptions()

        with _translate_errors(self.name):
            stream = await self._client.chat.completions.create(
                stream=True,
                **self._payload(messages, options),
            )
            # ``async with`` schliesst die HTTP-Verbindung auch dann, wenn der
            # Client mitten im Stream abbricht.
            # Tool-Calls kommen zerstueckelt: id und name im ersten Delta,
            # die Argumente danach zeichenweise. Sammeln nach index.
            partial: dict[int, _PartialCall] = {}

            async with stream:
                async for chunk in stream:
                    if not chunk.choices:
                        continue
                    delta = chunk.choices[0].delta
                    if delta is None:
                        continue

                    # DeepSeek nennt es reasoning_content, Ollama reasoning.
                    # Beide lesen kostet nichts und spart einen Provider,
                    # der nur wegen eines Feldnamens existiert.
                    reasoning = getattr(delta, "reasoning_content", None) or getattr(
                        delta, "reasoning", None
                    )
                    if reasoning:
                        yield StreamChunk(kind="reasoning", text=reasoning)
                    if delta.content:
                        yield StreamChunk(kind="content", text=delta.content)

                    for raw in delta.tool_calls or []:
                        slot = partial.setdefault(raw.index, _PartialCall())
                        slot.absorb(raw)

            for slot in sorted(partial.values(), key=lambda s: s.index):
                call = slot.finish()
                yield StreamChunk(
                    kind="tool_call",
                    text=json.dumps(call.arguments, ensure_ascii=False),
                    tool_name=call.name,
                    tool_call_id=call.id,
                )

    async def aclose(self) -> None:
        await self._client.close()

    async def health(self) -> bool:
        try:
            await self._client.models.list()
        except Exception as exc:  # noqa: BLE001 -- Health darf nie werfen
            logger.warning("Health-Check fuer %s fehlgeschlagen: %s", self.name, exc)
            return False
        return True

    def _payload(
        self,
        messages: Sequence[Message],
        options: CompletionOptions,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "model": options.model or self.default_model,
            "messages": [message.to_wire() for message in messages],
        }
        if options.temperature is not None:
            payload["temperature"] = options.temperature
        if options.max_tokens is not None:
            payload["max_tokens"] = options.max_tokens
        if options.top_p is not None:
            payload["top_p"] = options.top_p
        if options.stop:
            payload["stop"] = list(options.stop)
        if options.tools:
            payload["tools"] = [spec.to_wire() for spec in options.tools]
        payload.update(options.extra)
        return payload


@dataclass
class _PartialCall:
    """Ein Tool-Call, der noch stueckweise aus dem Stream eintrifft."""

    index: int = 0
    id: str = ""
    name: str = ""
    arguments: str = ""

    def absorb(self, raw: Any) -> None:
        self.index = raw.index
        if raw.id:
            self.id = raw.id
        if raw.function is not None:
            if raw.function.name:
                self.name = raw.function.name
            if raw.function.arguments:
                self.arguments += raw.function.arguments

    def finish(self) -> ToolCall:
        return ToolCall(
            id=self.id or f"call_{self.index}",
            name=self.name,
            arguments=_parse_arguments(self.arguments),
        )


def _tool_call_of(raw: Any) -> ToolCall:
    return ToolCall(
        id=raw.id,
        name=raw.function.name,
        arguments=_parse_arguments(raw.function.arguments),
    )


def _parse_arguments(raw: str | None) -> dict[str, Any]:
    """Modelle liefern gelegentlich kaputtes JSON -- das darf den Lauf nicht
    abbrechen, der Fehler geht als Argument mit und das Modell korrigiert."""
    if not raw or not raw.strip():
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("Tool-Argumente sind kein gueltiges JSON: %r", raw[:200])
        return {"_invalid_json": raw}
    return parsed if isinstance(parsed, dict) else {"value": parsed}


def _usage_of(usage: Any) -> Usage | None:
    if usage is None:
        return None

    details = getattr(usage, "completion_tokens_details", None)
    return Usage(
        prompt_tokens=usage.prompt_tokens,
        completion_tokens=usage.completion_tokens,
        reasoning_tokens=getattr(details, "reasoning_tokens", None) or 0,
    )


class _translate_errors:
    """Uebersetzt SDK-Fehler in Domaenen-Fehler -- als Context-Manager nutzbar
    fuer normale Aufrufe *und* fuer den Generator-Body des Streams."""

    def __init__(self, provider: str) -> None:
        self._provider = provider

    def __enter__(self) -> "_translate_errors":
        return self

    def __exit__(self, exc_type: type[BaseException] | None, exc: BaseException | None, tb: object) -> bool:
        if exc is None:
            return False

        details = {"provider": self._provider}

        if isinstance(exc, openai.APITimeoutError):
            raise ProviderTimeoutError(
                f"{self._provider} did not respond in time.", details=details
            ) from exc
        if isinstance(exc, openai.RateLimitError):
            raise RateLimitedError(
                f"Rate limit from {self._provider} reached.", details=details
            ) from exc
        if isinstance(exc, openai.AuthenticationError):
            raise UnauthorizedError(
                f"API key for {self._provider} was rejected.", details=details
            ) from exc
        if isinstance(exc, openai.APIStatusError):
            raise ProviderError(
                f"{self._provider} responded with HTTP {exc.status_code}.",
                details={**details, "status_code": exc.status_code},
            ) from exc
        if isinstance(exc, openai.APIError):
            raise ProviderError(str(exc), details=details) from exc

        return False
