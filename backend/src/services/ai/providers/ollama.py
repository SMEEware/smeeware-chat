from __future__ import annotations

from src.services.ai.providers.openai_compatible import OpenAICompatibleProvider


class OllamaProvider(OpenAICompatibleProvider):
    name = "ollama"
    base_url = "http://localhost:11434/v1"
