"""Ein-/Ausgabe-Modelle der API-Schluessel."""

from __future__ import annotations

from pydantic import BaseModel, Field


class ApiKeyItem(BaseModel):
    """Ein Schluessel, wie ihn die Liste zeigt -- ohne das Geheimnis selbst."""

    id: str
    name: str
    prefix: str
    created_at: str
    last_used_at: str | None = None


class ApiKeyListResponse(BaseModel):
    count: int
    keys: list[ApiKeyItem]


class ApiKeyCreate(BaseModel):
    # Ein Name, damit man Schluessel auseinanderhalten kann ("Laptop",
    # "CI"). Kurz gehalten -- er steht in einer Liste, nicht in einem Absatz.
    name: str = Field(min_length=1, max_length=60)


class ApiKeyUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=60)


class ApiKeyCreated(ApiKeyItem):
    """Die Antwort beim Anlegen -- als Einzige traegt sie das Geheimnis.

    Genau einmal sichtbar: danach liegt in der Datenbank nur noch der Hash,
    und niemand -- auch der Server nicht -- kann den Klartext rekonstruieren.
    """

    secret: str
