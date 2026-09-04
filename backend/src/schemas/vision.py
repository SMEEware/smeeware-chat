"""Ein-/Ausgabe-Modelle des Vision-Endpunkts."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, Field

Detail = Literal["low", "high", "original", "auto"]


class VisionRequest(BaseModel):
    images: Annotated[list[str], Field(min_length=1, max_length=600)]
    question: Annotated[str | None, Field(max_length=8_000)] = None
    detail: Detail | None = None

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "images": ["https://storage.smeeware.com/llm/diagramme/x.svg"],
                    "question": "Welche Werte stehen an der Y-Achse?",
                }
            ]
        }
    }


class VisionImage(BaseModel):
    """Was tatsaechlich beim Modell ankam -- nicht, was angefragt wurde."""

    source: str
    media_type: str | None = None
    bytes: int = 0
    inlined: bool = False


class VisionResponse(BaseModel):
    answer: str
    model: str
    images: list[VisionImage]
