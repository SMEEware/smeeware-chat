"""OpenAI ueber die Responses-API.

Warum nicht ueber ``OpenAICompatibleProvider`` wie DeepSeek und Ollama: die
gpt-5.6-Familie kann auf Chat-Completions **entweder** Werkzeuge **oder**
Reasoning -- beides zusammen nur, wenn der Denkaufwand auf "none" steht.
Genau beides zusammen ist aber der Grund, diese Modelle anzubinden. Die
Responses-API kennt die Einschraenkung nicht.

Der Preis ist ein anderes Datenmodell, und das uebersetzt diese Datei:

* Nachrichten sind ``input``-Eintraege. Ein Werkzeugaufruf ist dort kein
  Feld an der Assistenz-Nachricht, sondern ein eigener Eintrag vom Typ
  ``function_call``; sein Ergebnis ein ``function_call_output``.
* Werkzeuge werden flach deklariert (``type/name/description/parameters``)
  statt unter einem ``function``-Schluessel.
* Der Gedankengang kommt als *Zusammenfassung*. Der rohe Gedankengang
  verlaesst den Anbieter nicht -- was hier als ``reasoning`` ankommt, ist
  die Zusammenfassung, um die wir mit ``summary`` bitten.
* ``temperature``/``top_p``/``max_tokens`` gibt es fuer Reasoning-Modelle
  nicht. Sie werden bewusst verworfen statt durchgereicht: mitgeschickt
  lehnt die API die ganze Anfrage ab.
"""

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
from src.services.tools.base import ToolCall

logger = get_logger(__name__)

AUFWAENDE = frozenset({"none", "minimal", "low", "medium", "high", "xhigh", "max"})


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
            antwort = await self._client.responses.create(
                stream=False, **self._payload(messages, options)
            )

        text: list[str] = []
        denken: list[str] = []
        aufrufe: list[ToolCall] = []

        for eintrag in antwort.output or ():
            art = getattr(eintrag, "type", None)
            if art == "message":
                for teil in getattr(eintrag, "content", None) or ():
                    if getattr(teil, "type", None) == "output_text":
                        text.append(teil.text)
            elif art == "reasoning":
                for teil in getattr(eintrag, "summary", None) or ():
                    denken.append(getattr(teil, "text", "") or "")
            elif art == "function_call":
                aufrufe.append(_aufruf_von(eintrag))

        return Completion(
            content="".join(text),
            model=antwort.model,
            finish_reason=antwort.status,
            reasoning="".join(denken) or None,
            usage=_usage_von(antwort.usage),
            tool_calls=tuple(aufrufe),
        )

    async def stream(
        self,
        messages: Sequence[Message],
        options: CompletionOptions | None = None,
    ) -> AsyncIterator[StreamChunk]:
        options = options or CompletionOptions()

        with _translate_errors(self.name):
            strom = await self._client.responses.create(
                stream=True, **self._payload(messages, options)
            )

            async for ereignis in strom:
                art = ereignis.type

                if art == "response.reasoning_summary_text.delta":
                    if ereignis.delta:
                        yield StreamChunk(kind="reasoning", text=ereignis.delta)

                elif art == "response.output_text.delta":
                    if ereignis.delta:
                        yield StreamChunk(kind="content", text=ereignis.delta)

                elif art == "response.output_item.done":
                    eintrag = ereignis.item
                    if getattr(eintrag, "type", None) == "function_call":
                        aufruf = _aufruf_von(eintrag)
                        yield StreamChunk(
                            kind="tool_call",
                            text=json.dumps(aufruf.arguments, ensure_ascii=False),
                            tool_name=aufruf.name,
                            tool_call_id=aufruf.id,
                        )

                elif art in ("error", "response.failed"):
                    raise _fehler_von(ereignis)

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
        self, messages: Sequence[Message], options: CompletionOptions
    ) -> dict[str, Any]:
        anweisung, eingabe = _eingabe_von(messages)

        payload: dict[str, Any] = {
            "model": options.model or self.default_model,
            "input": eingabe,
            "reasoning": {
                "effort": self._aufwand(options),
                "summary": self._summary,
            },
            "store": False,
        }
        if anweisung:
            payload["instructions"] = anweisung
        if options.max_tokens is not None:
            payload["max_output_tokens"] = options.max_tokens
        if options.tools:
            payload["tools"] = [_werkzeug_von(spec) for spec in options.tools]

        extra = dict(options.extra)
        extra.pop("reasoning_effort", None)
        payload.update(extra)
        return payload

    def _aufwand(self, options: CompletionOptions) -> str:
        gewuenscht = str(options.extra.get("reasoning_effort") or self._effort)
        if gewuenscht not in AUFWAENDE:
            logger.warning(
                "Unbekannter Denkaufwand %r -- nehme %r", gewuenscht, self._effort
            )
            return self._effort
        return gewuenscht


def _eingabe_von(messages: Sequence[Message]) -> tuple[str, list[dict[str, Any]]]:
    """Verlauf uebersetzen. Gibt (instructions, input) zurueck.

    Ein Werkzeugaufruf ist bei Responses ein eigener Eintrag neben der
    Nachricht, nicht ein Feld an ihr. Eine Assistenz-Nachricht ohne Text,
    die nur Aufrufe traegt, verschwindet deshalb ganz -- ein leerer
    ``assistant``-Eintrag waere kein gueltiger Input.
    """
    anweisungen: list[str] = []
    eingabe: list[dict[str, Any]] = []

    for nachricht in messages:
        if nachricht.role == "system":
            anweisungen.append(nachricht.content)
            continue

        if nachricht.role == "tool":
            eingabe.append(
                {
                    "type": "function_call_output",
                    "call_id": nachricht.tool_call_id or "",
                    "output": nachricht.content,
                }
            )
            continue

        if nachricht.content:
            eingabe.append({"role": nachricht.role, "content": nachricht.content})

        for aufruf in nachricht.tool_calls:
            eingabe.append(
                {
                    "type": "function_call",
                    "call_id": aufruf.id,
                    "name": aufruf.name,
                    "arguments": json.dumps(aufruf.arguments, ensure_ascii=False),
                }
            )

    return "\n\n".join(anweisungen), eingabe


def _werkzeug_von(spec: Any) -> dict[str, Any]:
    """Flache Deklaration statt der Verschachtelung von Chat-Completions."""
    return {
        "type": "function",
        "name": spec.name,
        "description": spec.description,
        "parameters": spec.parameters or {"type": "object", "properties": {}},
    }


def _aufruf_von(eintrag: Any) -> ToolCall:
    roh = getattr(eintrag, "arguments", "") or ""
    try:
        argumente = json.loads(roh) if roh.strip() else {}
    except json.JSONDecodeError:
        logger.warning("Tool-Argumente sind kein gueltiges JSON: %r", roh[:200])
        argumente = {"_invalid_json": roh}
    return ToolCall(
        id=getattr(eintrag, "call_id", "") or getattr(eintrag, "id", ""),
        name=getattr(eintrag, "name", "") or "",
        arguments=argumente if isinstance(argumente, dict) else {"value": argumente},
    )


def _fehler_von(ereignis: Any) -> Exception:
    from src.core.exceptions import ProviderError

    fehler = getattr(ereignis, "error", None) or getattr(
        getattr(ereignis, "response", None), "error", None
    )
    meldung = getattr(fehler, "message", None) or "OpenAI ended the run with an error."
    return ProviderError(meldung, details={"provider": "openai"})


def _usage_von(usage: Any) -> Usage | None:
    if usage is None:
        return None
    details = getattr(usage, "output_tokens_details", None)
    return Usage(
        prompt_tokens=getattr(usage, "input_tokens", 0) or 0,
        completion_tokens=getattr(usage, "output_tokens", 0) or 0,
        reasoning_tokens=getattr(details, "reasoning_tokens", None) or 0,
    )
