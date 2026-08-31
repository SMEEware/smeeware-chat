"""Provider-Registry.

Ein neuer Anbieter wird hier eingetragen und ist damit ueber ``LLM_PROVIDER``
in der ``.env`` waehlbar -- ohne Aenderung am uebrigen Code.
"""

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
    """Ollama laeuft neben dem gehosteten Anbieter, nicht statt seiner.

    Deshalb eine eigene Fabrik: ``LLM_PROVIDER`` waehlt weiter genau einen
    Anbieter fuer die Ferne, und die lokalen Modelle haengen unabhaengig
    davon daran. Ein gemeinsamer Weg ueber ``create_provider`` haette
    ``LLMSettings`` einen Pflicht-Schluessel abgewoehnen muessen, den die
    Ferne sehr wohl braucht.
    """
    return OllamaProvider(
        api_key=settings.api_key,
        default_model=settings.default_model,
        base_url=settings.base_url,
        timeout=settings.timeout,
        max_retries=settings.max_retries,
    )


def create_openai(settings: OpenAISettings) -> LLMProvider:
    """OpenAI laeuft wieder neben den anderen, nicht statt ihrer.

    Und wieder eine eigene Fabrik, diesmal aus einem zweiten Grund: dieser
    Anbieter spricht die Responses-API und passt deshalb gar nicht in die
    ``PROVIDERS``-Tabelle, die ausschliesslich Chat-Completions-Klassen
    fuehrt. Ihn dort einzutragen hiesse, ``create_provider`` eine Fallunter-
    scheidung zu geben, die nur fuer einen einzigen Eintrag gilt.
    """
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
