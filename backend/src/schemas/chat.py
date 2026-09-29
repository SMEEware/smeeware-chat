"""Ein-/Ausgabe-Modelle der Chat-API.

Bewusst getrennt von den Domaenen-Typen in ``services.ai.base``: die API darf
sich stabil halten, waehrend sich die Domaene weiterentwickelt.
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, Field

from src.core.exceptions import ValidationError
from src.services.ai.base import CompletionOptions, Message

# Grosszuegig statt knapp: ein Verlauf, der an diesen Grenzen scheitert, ist
# ab dieser Nachricht fuer immer tot -- jeder weitere Turn schickt ihn wieder
# mit. Die eigentliche Grenze zieht das Kontextfenster des Modells, und das
# meldet sich mit einer lesbaren Fehlermeldung statt mit einem 422.
MAX_ZEICHEN = 400_000
MAX_NACHRICHTEN = 1_000


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    # Leer ist erlaubt: ein beim Denken gestoppter Turn hinterlaesst eine
    # Antwort ohne Text. Sie faellt in ``_normalisieren`` heraus, statt den
    # ganzen Verlauf mit einem 422 zu blockieren.
    content: Annotated[str, Field(max_length=MAX_ZEICHEN)]

    def to_domain(self) -> Message:
        return Message(role=self.role, content=self.content)


class ChatRequest(BaseModel):
    messages: Annotated[
        list[ChatMessage], Field(min_length=1, max_length=MAX_NACHRICHTEN)
    ]
    model: str | None = None
    prompt: Annotated[str | None, Field(max_length=64)] = None
    tools: bool = True
    temperature: Annotated[float | None, Field(ge=0.0, le=2.0)] = None
    max_tokens: Annotated[int | None, Field(ge=1, le=32_000)] = None
    top_p: Annotated[float | None, Field(gt=0.0, le=1.0)] = None
    voice_id: Annotated[str | None, Field(max_length=128)] = None
    tts_model: Annotated[str | None, Field(max_length=64)] = None
    # Vom Client erzeugt: unter dieser id kann er waehrend des Turns
    # Nachrichten nachschieben (POST /chat/stream/{stream_id}/steer).
    stream_id: Annotated[
        str | None, Field(max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    ] = None
    # "call": der Turn wurde im Telefonat gesprochen und wird vorgelesen --
    # das Backend ergaenzt den System-Prompt um passende Sprechregeln.
    mode: Literal["chat", "call"] = "chat"

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "messages": [{"role": "user", "content": "Erklaer mir SSE in zwei Saetzen."}],
                    "temperature": 0.7,
                }
            ]
        }
    }

    def to_domain_messages(self) -> list[Message]:
        return _normalisieren([message.to_domain() for message in self.messages])

    def to_options(self) -> CompletionOptions:
        return CompletionOptions(
            model=self.model,
            temperature=self.temperature,
            max_tokens=self.max_tokens,
            top_p=self.top_p,
        )


class UsageResponse(BaseModel):
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    reasoning_tokens: int = 0


class ChatResponse(BaseModel):
    content: str
    model: str
    finish_reason: str | None = None
    usage: UsageResponse | None = None
    reasoning: str | None = None


def _normalisieren(messages: list[Message]) -> list[Message]:
    """Einen Verlauf in eine Form bringen, die jeder Anbieter annimmt.

    Verlaeufe aus der Praxis sind unordentlich: ein gestoppter Turn hinterlaesst
    eine leere Antwort, ein fehlgeschlagener zwei Fragen hintereinander. Manche
    Anbieter nehmen das hin, andere (Reasoning-Modelle) lehnen es ab -- und
    dann ist der Chat tot. Deshalb hier, einmal fuer alle Clients:

    - leere Nachrichten fallen weg,
    - direkt aufeinanderfolgende Nachrichten derselben Rolle werden verbunden,
    - vor der ersten Nutzernachricht steht keine Antwort.
    """
    sauber: list[Message] = []
    for message in messages:
        text = message.content.strip()
        if not text:
            continue
        if sauber and message.role in ("user", "assistant") and sauber[-1].role == message.role:
            vorige = sauber[-1]
            sauber[-1] = Message(role=vorige.role, content=f"{vorige.content}\n\n{text}")
            continue
        sauber.append(Message(role=message.role, content=text))

    erste_frage = next((i for i, m in enumerate(sauber) if m.role == "user"), None)
    if erste_frage is None:
        raise ValidationError("The conversation has no question to answer.")
    systeme = [m for m in sauber[:erste_frage] if m.role == "system"]
    return [*systeme, *sauber[erste_frage:]]
