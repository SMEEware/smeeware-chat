"""DeepSeek -- OpenAI-kompatibel, daher nur noch Endpunkt und Name."""

from __future__ import annotations

from src.services.ai.providers.openai_compatible import OpenAICompatibleProvider


class DeepSeekProvider(OpenAICompatibleProvider):
    name = "deepseek"
    base_url = "https://api.deepseek.com"
