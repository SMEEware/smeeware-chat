"""Ein-/Ausgabe-Modelle des Modell-Katalogs."""

from __future__ import annotations

from pydantic import BaseModel


class ModelInfo(BaseModel):
    # id ist der Wert, der bei /chat als "model" mitgeschickt wird.
    id: str
    name: str
    description: str
    # Ueberschrift im Auswahlfeld: "OpenAI", "DeepSeek", "Local".
    group: str
    # "hosted" | "local" | "openai" -- wo das Modell laeuft.
    runtime: str
    # Denkt das Modell sichtbar mit? Nur bei den Responses-Modellen gesetzt.
    reasoning_effort: str | None = None
    # Braucht eine Freischaltung beim Anbieter. Das Frontend zeigt den
    # Eintrag trotzdem, aber als das, was er ist.
    gated: bool = False


class ModelListResponse(BaseModel):
    count: int
    default: str
    # Reihenfolge der Ueberschriften -- damit das Frontend nicht raten muss.
    groups: list[str]
    models: list[ModelInfo]
