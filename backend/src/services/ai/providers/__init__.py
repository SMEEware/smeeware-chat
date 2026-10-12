from __future__ import annotations

from src.core.config import LLMSettings, OllamaSettings, OpenAISettings
from src.core.exceptions import ConfigurationError
from src.services.ai.base import LLMProvider
from src.services.ai.providers.deepseek import DeepSeekProvider
from src.services.ai.providers.ollama import OllamaProvider
from src.services.ai.providers.openai_compatible import OpenAICompatibleProvider
from src.services.ai.providers.openai_responses import OpenAIResponsesProvider

PROVIDERS: dict[str, type[OpenAICompatibleProvider]] = {
    DeepSeekProvider.name: DeepSeekProvider,
    OllamaProvider.name: OllamaProvider,
}


def create_provider(settings: LLMSettings) -> LLMProvider:
    try:
        provider_cls = PROVIDERS[settings.provider]
    except KeyError:
        known = ", ".join(sorted(PROVIDERS)) or "-"
        raise ConfigurationError(
            f"Unknown LLM provider {settings.provider!r}. Known: {known}."
        ) from None

    return provider_cls(
        api_key=settings.api_key.get_secret_value(),
        default_model=settings.default_model,
        base_url=settings.base_url,
        timeout=settings.timeout,
        max_retries=settings.max_retries,
    )


def create_ollama(settings: OllamaSettings) -> LLMProvider:
    return OllamaProvider(
        api_key=settings.api_key,
        default_model=settings.default_model,
        base_url=settings.base_url,
        timeout=settings.timeout,
        max_retries=settings.max_retries,
    )


def create_openai(settings: OpenAISettings) -> LLMProvider:
    if settings.api_key is None:
        raise ConfigurationError("OPENAI_API_KEY is missing.")

    return OpenAIResponsesProvider(
        api_key=settings.api_key.get_secret_value(),
        default_model=settings.default_model,
        base_url=settings.base_url,
        timeout=settings.timeout,
        max_retries=settings.max_retries,
        reasoning_effort=settings.reasoning_effort,
        reasoning_summary=settings.reasoning_summary,
    )


__all__ = [
    "PROVIDERS",
    "DeepSeekProvider",
    "OllamaProvider",
    "OpenAICompatibleProvider",
    "OpenAIResponsesProvider",
    "create_ollama",
    "create_openai",
    "create_provider",
]
