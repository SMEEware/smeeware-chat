from __future__ import annotations

import time
from collections.abc import Sequence
from typing import Any

import httpx

from src.services.ai.base import CompletionOptions, Message
from src.services.ai.providers.openai_compatible import OpenAICompatibleProvider

ReasoningOptions = tuple[tuple[str, ...], str | None]
NO_REASONING: ReasoningOptions = ((), None)


class OllamaProvider(OpenAICompatibleProvider):
    name = "ollama"
    base_url = "http://localhost:11434/v1"

    def __init__(self, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        basis = str(self._client.base_url).rstrip("/").removesuffix("/v1")
        self._show_url = f"{basis}/api/show"
        self._reasoning: dict[str, tuple[float, ReasoningOptions]] = {}

    async def reasoning_options(self, model: str) -> ReasoningOptions:
        """Discover exact options; older servers and unknown models stay untouched."""
        now = time.monotonic()
        cached = self._reasoning.get(model)
        if cached is not None and now - cached[0] < 15.0:
            return cached[1]
        result = NO_REASONING
        try:
            async with httpx.AsyncClient(timeout=1.5) as client:
                response = await client.post(
                    self._show_url, json={"model": model},
                    headers={"Authorization": f"Bearer {self._client.api_key}"},
                )
            if response.is_success:
                result = _reasoning_options(response.json())
        except (httpx.HTTPError, ValueError):
            pass
        self._reasoning[model] = (now, result)
        return result

    def _payload(self, messages: Sequence[Message], options: CompletionOptions) -> dict[str, Any]:
        payload = super()._payload(messages, options)
        requested = payload.pop("reasoning_effort", None)
        cached = self._reasoning.get(payload["model"])
        if cached is not None:
            efforts, default = cached[1]
            effort = requested if requested in efforts else default
            if effort is not None:
                payload["reasoning_effort"] = effort
        # Ollama's OpenAI adapter maps assistant `reasoning` to native thinking.
        # Return it with tool calls so subsequent rounds retain that context.
        for message, wire in zip(messages, payload["messages"]):
            if message.role == "assistant" and message.reasoning is not None:
                wire["reasoning"] = message.reasoning
        return payload


def _reasoning_options(metadata: Any) -> ReasoningOptions:
    thinking = metadata.get("thinking") if isinstance(metadata, dict) else None
    if not isinstance(thinking, dict):
        return NO_REASONING
    values = thinking.get("values")
    default = thinking.get("default")
    if not isinstance(values, list) or not values or len(values) > 32:
        return NO_REASONING
    if any(not isinstance(value, (str, bool)) or (
        isinstance(value, str) and (not value or value != value.strip() or len(value) > 32)
    ) for value in values):
        return NO_REASONING
    if not any(type(default) is type(value) and default == value for value in values):
        return NO_REASONING

    names = [value for value in values if isinstance(value, str)]
    if names:
        # Ollama preserves named efforts. In mixed metadata `true` can only be
        # represented by `high` when that exact named value is also supported.
        if default is True and "high" not in names:
            return NO_REASONING
        efforts = (["none"] if False in values else []) + names
        mapped_default = "none" if default is False else "high" if default is True else default
    else:
        if True not in values:
            return NO_REASONING
        # The OpenAI compatibility API maps none -> false and high -> true for
        # boolean-only models. This is a binary control, never a fake budget.
        efforts = (["none"] if False in values else []) + ["high"]
        mapped_default = "high" if default else "none"
    efforts = list(dict.fromkeys(efforts))
    order = ("none", "minimal", "low", "medium", "high", "xhigh", "ultra", "max")
    if all(effort in order for effort in efforts):
        efforts.sort(key=order.index)
    return tuple(efforts), mapped_default
