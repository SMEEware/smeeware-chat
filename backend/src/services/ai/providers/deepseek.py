from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from src.core.exceptions import ProviderError
from src.services.ai.base import CompletionOptions, Message
from src.services.ai.providers.openai_compatible import OpenAICompatibleProvider

MAX_OUTPUT_TOKENS = 393_216


class DeepSeekProvider(OpenAICompatibleProvider):
    name = "deepseek"
    base_url = "https://api.deepseek.com"

    def _payload(self, messages: Sequence[Message], options: CompletionOptions) -> dict[str, Any]:
        payload = super()._payload(messages, options)
        # Thinking and the final answer share the output budget. Both V4 models
        # support 384 Ki tokens; a smaller explicit caller budget is respected.
        payload.setdefault("max_tokens", MAX_OUTPUT_TOKENS)
        payload["reasoning_effort"] = "max"
        payload["extra_body"] = {
            **payload.get("extra_body", {}), "thinking": {"type": "enabled"},
        }
        # DeepSeek requires the thinking from previous assistant tool rounds.
        for message, wire in zip(messages, payload["messages"]):
            if message.role == "assistant" and message.reasoning is not None:
                wire["reasoning_content"] = message.reasoning
        return payload

    def _check_finish_reason(self, reason: str | None) -> None:
        errors = {
            "length": "DeepSeek reached its token or context limit before completing the answer.",
            "aborted": "DeepSeek aborted the answer. Please try again.",
            "insufficient_system_resource": "DeepSeek ran out of server resources. Please try again.",
            "content_filter": "DeepSeek stopped the answer because of its content filter.",
        }
        if reason in errors:
            raise ProviderError(errors[reason], details={"provider": self.name, "finish_reason": reason})
