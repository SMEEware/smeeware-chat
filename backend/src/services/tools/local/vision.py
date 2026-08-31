"""Das Auge des Agenten.

Das Hauptmodell sieht keine Bilder. Findet es eines -- eine Storage-URL, ein
Bild auf einer gescrapten Seite, einen Screenshot auf der Platte -- reicht es
die Adresse hier herein und bekommt eine Antwort in Worten zurueck.

Die Frage macht den Unterschied: "welche Fehlermeldung steht in diesem
Screenshot?" liefert etwas anderes als eine Pauschalbeschreibung. Deshalb
steht sie als eigener Parameter da und die Beschreibung draengt darauf.
"""

from __future__ import annotations

import json
from typing import Any

from src.core.exceptions import AppError
from src.core.logging import get_logger
from src.services.ai.vision import Bild, VisionError, VisionService
from src.services.tools.base import ToolError
from src.services.tools.local.base import LocalTool

logger = get_logger(__name__)


class AnalyzeImageTool(LocalTool):
    name = "analyze_image"
    description = (
        "Looks at an image and answers a question about it. Use this for "
        "anything visual: reading screenshots, evaluating diagrams and charts, "
        "describing photos, pulling text out of a graphic, deciphering error "
        "messages in an image, comparing two images. The source can be an "
        "http(s) URL (including one from your storage), a file path on the "
        "machine, or a data: URL. Ask a specific question -- that is far more "
        "productive than a general description."
    )
    parameters = {
        "type": "object",
        "properties": {
            "images": {
                "type": "array",
                "items": {"type": "string"},
                "description": (
                    "One or more images: URL, file path, or data: URL. "
                    "Use several only when you want to compare them."
                ),
            },
            "question": {
                "type": "string",
                "description": (
                    "What you want to know, e.g. 'Which error is in the "
                    "console?' or 'What values are on the Y axis?'. Without "
                    "one, you get a detailed description."
                ),
            },
            "detail": {
                "type": "string",
                "enum": ["low", "original"],
                "description": (
                    "low scales to 512x512 -- faster and cheaper when only the "
                    "rough content matters. For small text, numbers, and "
                    "details use original (default)."
                ),
            },
        },
        "required": ["images"],
    }

    def __init__(self, vision: VisionService) -> None:
        self._vision = vision

    async def run(
        self,
        images: Any,
        question: str | None = None,
        detail: str | None = None,
    ) -> str:
        quellen = _quellen(images)
        if isinstance(quellen, str):
            raise ToolError(quellen)

        try:
            antwort, bilder = await self._vision.ask(
                list(quellen), question, detail=detail
            )
        except VisionError as exc:
            raise ToolError(str(exc)) from exc
        except AppError as exc:
            raise ToolError(f"Vision model unreachable: {exc.message}") from exc

        return f"{_kopf(bilder, self._vision.model)}\n\n{antwort}"


def _kopf(bilder: list[Bild], modell: str) -> str:
    """Sagt dem Modell, was tatsaechlich angesehen wurde -- nicht was es meinte."""
    if len(bilder) == 1:
        bild = bilder[0]
        art = f"{bild.mime}, {_kurz(bild.herkunft)}" if bild.mime else _kurz(bild.herkunft)
        return f"Viewed ({modell}): {art}"
    teile = ", ".join(f"{i}. {_kurz(b.herkunft)}" for i, b in enumerate(bilder, start=1))
    return f"Viewed ({modell}), {len(bilder)} images: {teile}"


def _kurz(text: str, grenze: int = 120) -> str:
    return text if len(text) <= grenze else f"{text[:grenze]}..."


def _quellen(rohwert: Any) -> tuple[str, ...] | str:
    """Modelle liefern die Liste mal als Liste, mal als JSON-Text, mal blank."""
    if isinstance(rohwert, str):
        text = rohwert.strip()
        if text.startswith("["):
            try:
                rohwert = json.loads(text)
            except json.JSONDecodeError:
                rohwert = [text]
        else:
            rohwert = [text]
    if not isinstance(rohwert, list):
        return f"'images' must be a list, got {type(rohwert).__name__}."

    sauber = tuple(str(q).strip() for q in rohwert if str(q).strip())
    if not sauber:
        return "No image provided."
    return sauber


__all__ = ["AnalyzeImageTool"]
