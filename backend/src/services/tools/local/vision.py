from __future__ import annotations

import json
from typing import Any

from src.core.exceptions import AppError
from src.core.logging import get_logger
from src.services.ai.vision import Image, VisionError, VisionService
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
        sources = _sources(images)
        if isinstance(sources, str):
            raise ToolError(sources)

        try:
            response, resolved_images = await self._vision.ask(
                list(sources), question, detail=detail
            )
        except VisionError as exc:
            raise ToolError(str(exc)) from exc
        except AppError as exc:
            raise ToolError(f"Vision model unreachable: {exc.message}") from exc

        return f"{_head(resolved_images, self._vision.model)}\n\n{response}"


def _head(resolved_images: list[Image], model: str) -> str:
    if len(resolved_images) == 1:
        image = resolved_images[0]
        label = f"{image.mime}, {_short(image.origin)}" if image.mime else _short(image.origin)
        return f"Viewed ({model}): {label}"
    parts = ", ".join(f"{i}. {_short(b.origin)}" for i, b in enumerate(resolved_images, start=1))
    return f"Viewed ({model}), {len(resolved_images)} images: {parts}"


def _short(text: str, limit: int = 120) -> str:
    return text if len(text) <= limit else f"{text[:limit]}..."


def _sources(raw_value: Any) -> tuple[str, ...] | str:
    if isinstance(raw_value, str):
        text = raw_value.strip()
        if text.startswith("["):
            try:
                raw_value = json.loads(text)
            except json.JSONDecodeError:
                raw_value = [text]
        else:
            raw_value = [text]
    if not isinstance(raw_value, list):
        return f"'images' must be a list, got {type(raw_value).__name__}."

    clean = tuple(str(q).strip() for q in raw_value if str(q).strip())
    if not clean:
        return "No image provided."
    return clean


__all__ = ["AnalyzeImageTool"]
