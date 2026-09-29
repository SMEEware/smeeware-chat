"""Der Agent -- die Fachlogik ueber dem Sprachmodell.

Kennt weder HTTP noch einen konkreten Anbieter: der ``LLMProvider`` wird
hineingereicht (Constructor Injection). Dadurch ist der Agent in Tests mit
einem Fake-Provider ohne Netzwerk pruefbar.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator, Callable, Sequence

from src.core.exceptions import ValidationError
from src.core.logging import get_logger
from dataclasses import replace

from src.services.ai.steering import Einschub
from src.services.tools.base import NullToolBox, ToolBox, ToolCall, ToolResult
from src.services.ai.base import (
    Completion,
    CompletionOptions,
    LLMProvider,
    Message,
    Role,
    StreamChunk,
)

logger = get_logger(__name__)

class Agent:
    def __init__(
        self,
        provider: LLMProvider,
        *,
        system_prompt: str | None = None,
        default_options: CompletionOptions | None = None,
        toolbox: ToolBox | None = None,
        max_tool_rounds: int = 5,
    ) -> None:
        self._provider = provider
        self._system_prompt = system_prompt
        self._default_options = default_options or CompletionOptions()
        self._toolbox = toolbox or NullToolBox()
        self._max_tool_rounds = max_tool_rounds

    @property
    def provider_name(self) -> str:
        return self._provider.name

    async def complete(
        self,
        messages: Sequence[Message],
        options: CompletionOptions | None = None,
        *,
        zusatz: str | None = None,
    ) -> Completion:
        working = self._prepare(messages, zusatz)
        merged = await self._with_tools(self._merge(options))

        logger.info(
            "Completion via %s (model=%s, messages=%d, tools=%d)",
            self._provider.name,
            merged.model or "default",
            len(working),
            len(merged.tools),
        )

        for round_number in range(self._max_tool_rounds):
            completion = await self._provider.complete(working, merged)
            if not completion.tool_calls:
                return completion

            logger.info(
                "Runde %d: %d Werkzeugaufruf(e)",
                round_number + 1,
                len(completion.tool_calls),
            )
            working.append(_assistant_turn(completion))
            for call in completion.tool_calls:
                working.append(Message.from_tool_result(await self._run(call)))

        logger.warning("Werkzeug-Budget erschoepft, erzwinge Antwort")
        return await self._provider.complete(
            working, replace(merged, tools=())
        )

    async def stream(
        self,
        messages: Sequence[Message],
        options: CompletionOptions | None = None,
        *,
        steer: Callable[[], Sequence[Einschub]] | None = None,
        zusatz: str | None = None,
    ) -> AsyncIterator[StreamChunk]:
        """Wie ``complete``, aber als Strom -- und offen fuer Einschuebe.

        ``steer`` liefert, was der Nutzer waehrend des Turns nachgeschoben
        hat. Abgefragt wird an jeder Rundengrenze: nach den
        Werkzeugergebnissen, bevor das Modell wieder dran ist. Jeder Einschub
        wird als Nutzernachricht angehaengt und mit einem ``steer``-Fragment
        quittiert, damit der Client ihn aus seiner Warteschlange nimmt.

        ``zusatz`` ergaenzt den System-Prompt fuer diesen einen Turn (etwa die
        Sprechregeln im Telefonat) -- die Persona bleibt, wie sie ist.
        """
        working = self._prepare(messages, zusatz)
        merged = await self._with_tools(self._merge(options))

        logger.info(
            "Stream via %s (model=%s, messages=%d, tools=%d)",
            self._provider.name,
            merged.model or "default",
            len(working),
            len(merged.tools),
        )

        for round_number in range(self._max_tool_rounds):
            calls: list[ToolCall] = []
            answer: list[str] = []

            async for chunk in self._provider.stream(working, merged):
                if chunk.kind == "tool_call":
                    calls.append(_call_of(chunk))
                elif chunk.kind == "content":
                    answer.append(chunk.text)
                yield chunk

            if not calls:
                return

            logger.info(
                "Runde %d: %d Werkzeugaufruf(e)", round_number + 1, len(calls)
            )
            working.append(
                Message(
                    role="assistant",
                    content="".join(answer),
                    tool_calls=tuple(calls),
                )
            )

            for call in calls:
                result = await self._run(call)
                yield StreamChunk(
                    kind="tool_result",
                    text=result.content,
                    tool_name=call.name,
                    tool_call_id=call.id,
                    is_error=result.is_error,
                )
                working.append(Message.from_tool_result(result))

            for chunk in _einschuebe(steer, working):
                yield chunk

        logger.warning("Werkzeug-Budget erschoepft, erzwinge Antwort")
        for chunk in _einschuebe(steer, working):
            yield chunk
        async for chunk in self._provider.stream(working, replace(merged, tools=())):
            yield chunk

    async def ask(
        self,
        prompt: str,
        options: CompletionOptions | None = None,
    ) -> str:
        """Einmalige Frage ohne Verlauf -- der haeufigste Fall."""
        completion = await self.complete(
            [Message(role="user", content=prompt)], options
        )
        return completion.content

    async def health(self) -> bool:
        return await self._provider.health()

    async def _with_tools(self, options: CompletionOptions) -> CompletionOptions:
        """Haengt die verfuegbaren Werkzeuge an, sofern der Aufrufer keine
        eigene Auswahl mitgegeben hat."""
        if options.tools:
            return options
        specs = await self._toolbox.specs()
        return replace(options, tools=tuple(specs)) if specs else options

    async def _run(self, call: ToolCall) -> ToolResult:
        logger.info("Werkzeug %s(%s)", call.name, json.dumps(call.arguments)[:160])
        result = await self._toolbox.invoke(call)
        if result.is_error:
            logger.warning("Werkzeug %s meldet Fehler: %s", call.name, result.content[:160])
        return result

    def _prepare(
        self, messages: Sequence[Message], zusatz: str | None = None
    ) -> list[Message]:
        if not messages:
            raise ValidationError("messages must not be empty.")

        system: Role = "system"
        working = list(messages)
        has_system = any(message.role == "system" for message in working)
        if self._system_prompt and not has_system:
            working.insert(0, Message(role=system, content=self._system_prompt))

        # Der Zusatz wird Teil DES System-Prompts, nicht eine zweite
        # System-Nachricht: manche Anbieter nehmen nur eine, und so steht er
        # direkt hinter der Persona, die er ergaenzt.
        if zusatz:
            erste = next(
                (i for i, m in enumerate(working) if m.role == "system"), None
            )
            if erste is None:
                working.insert(0, Message(role=system, content=zusatz))
            else:
                alt = working[erste]
                working[erste] = Message(
                    role=system, content=f"{alt.content}\n\n{zusatz}"
                )
        return working

    def _merge(self, options: CompletionOptions | None) -> CompletionOptions:
        if options is None:
            return self._default_options
        return self._default_options.merged(
            model=options.model,
            temperature=options.temperature,
            max_tokens=options.max_tokens,
            top_p=options.top_p,
            stop=options.stop,
            extra=options.extra or None,
        )


def _einschuebe(
    steer: Callable[[], Sequence[Einschub]] | None,
    working: list[Message],
) -> list[StreamChunk]:
    """Wartende Einschuebe an den Verlauf haengen und quittieren."""
    if steer is None:
        return []
    quittungen: list[StreamChunk] = []
    for einschub in steer():
        text = einschub.text.strip()
        if not text:
            continue
        logger.info("Einschub aufgenommen (%d Zeichen)", len(text))
        working.append(Message(role="user", content=text))
        quittungen.append(StreamChunk(kind="steer", text=text, ref=einschub.id))
    return quittungen


def _assistant_turn(completion: Completion) -> Message:
    return Message(
        role="assistant",
        content=completion.content,
        tool_calls=completion.tool_calls,
    )


def _call_of(chunk: StreamChunk) -> ToolCall:
    """Baut den Aufruf aus dem Stream-Fragment zurueck.

    Das Argument-JSON stammt aus unserem eigenen Provider, ist also
    wohlgeformt -- ein Fallback schadet trotzdem nicht.
    """
    try:
        arguments = json.loads(chunk.text) if chunk.text else {}
    except json.JSONDecodeError:
        arguments = {}
    return ToolCall(
        id=chunk.tool_call_id or "",
        name=chunk.tool_name or "",
        arguments=arguments if isinstance(arguments, dict) else {},
    )
