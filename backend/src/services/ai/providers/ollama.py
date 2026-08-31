"""Ollama -- lokale Modelle, OpenAI-kompatibel unter ``/v1``.

Wie DeepSeek also nur Endpunkt und Name. Zwei Unterschiede zaehlen trotzdem:

Ollama prueft keinen Schluessel, der OpenAI-Client besteht aber auf einem --
darum ein Platzhalter statt einer Sonderbehandlung im Client.

Und der Gedankengang kommt hier im Feld ``reasoning`` statt in
``reasoning_content``. Das faengt ``OpenAICompatibleProvider`` ab, indem es
beide Namen liest; sonst fiele das Denken stumm weg, ohne dass es in der
Antwort auftauchte.
"""

from __future__ import annotations

from src.services.ai.providers.openai_compatible import OpenAICompatibleProvider


class OllamaProvider(OpenAICompatibleProvider):
    name = "ollama"
    base_url = "http://localhost:11434/v1"
