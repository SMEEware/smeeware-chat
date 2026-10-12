from __future__ import annotations

import base64
import datetime as dt
import mimetypes
import re
import uuid
from pathlib import Path
from typing import Any

import httpx
import openai
from openai import AsyncOpenAI

from src.core.config import ImageSettings
from src.core.logging import get_logger
from src.services.events import EventBus
from src.services.tools.base import ToolError
from src.services.tools.local.base import LocalTool

logger = get_logger(__name__)

SIZES = ("1024x1024", "1536x1024", "1024x1536", "auto")
QUALITIES = ("low", "medium", "high", "auto")

TEMPLATE_TYPES: dict[str, str] = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
}


class GenerateImageTool(LocalTool):
    name = "generate_image"
    description = (
        "Creates an image from a text description and returns a URL you can "
        "show. Use it when the user asks for a picture, an illustration, a "
        "logo, a diagram sketch, a mockup or any other visual that does not "
        "exist yet. "
        "Do NOT use it to find an existing image -- that is image_search -- "
        "and not to look at an image the user gave you, which is "
        "analyze_image. "
        "Write the prompt yourself and write it well: describe subject, "
        "composition, lighting and style in one dense paragraph. A vague "
        "prompt gets a vague image, and the user waits half a minute for it "
        "either way. "
        "REFERENCE IMAGES: pass reference_images to work from pictures "
        "instead of from words alone. Use it when the user attached an image "
        "and wants something made FROM it -- 'in this style', 'put these two "
        "together', 'like this but at night' -- and whenever they ask you to "
        "change an image you generated earlier: pass that image's URL back in "
        "and describe only what should differ. Do not use references when the "
        "user merely wants to know what is in a picture. "
        "The user watches the image appear while you wait. When it is done, "
        "show it by putting the returned markdown in your answer -- do not "
        "just mention that it exists."
    )
    parameters = {
        "type": "object",
        "properties": {
            "prompt": {
                "type": "string",
                "description": (
                    "What to draw. One dense paragraph: subject, "
                    "composition, lighting, style. English works best. With "
                    "reference images, describe what should CHANGE or how "
                    "they should be combined -- not what is already in them."
                ),
            },
            "reference_images": {
                "type": "array",
                "items": {"type": "string"},
                "description": (
                    "Up to a handful of pictures to work from. Each entry is "
                    "either a /api/uploads/... address (an image the user "
                    "attached, or one you generated earlier), a public "
                    "https:// image URL, or a file path the user's message "
                    "gave you. Order matters: the first is the main subject."
                ),
            },
            "size": {
                "type": "string",
                "enum": list(SIZES),
                "description": (
                    "Square, landscape or portrait. Leave out for square."
                ),
            },
            "quality": {
                "type": "string",
                "enum": list(QUALITIES),
                "description": (
                    "Higher looks better and takes longer. Leave out for the "
                    "configured default."
                ),
            },
            "alt": {
                "type": "string",
                "description": (
                    "Short caption for the image, shown under it. Say what is "
                    "in the picture, not that it is a picture."
                ),
            },
        },
        "required": ["prompt"],
    }

    def __init__(
        self,
        *,
        api_key: str,
        settings: ImageSettings,
        uploads_dir: Path,
        bus: EventBus | None = None,
        base_url: str | None = None,
        http: httpx.AsyncClient | None = None,
        mc: Any | None = None,
    ) -> None:
        self._cfg = settings
        self._dir = uploads_dir
        self._bus = bus
        self._http = http
        self._mc = mc
        self._client = AsyncOpenAI(
            api_key=api_key,
            base_url=base_url or "https://api.openai.com/v1",
            timeout=settings.timeout if settings.timeout > 0 else None,
            max_retries=0,
        )

    async def run(
        self,
        prompt: str,
        reference_images: list[str] | None = None,
        size: str | None = None,
        quality: str | None = None,
        alt: str | None = None,
    ) -> str:
        clean = (prompt or "").strip()
        if not clean:
            raise ToolError("prompt must not be empty.")

        templates = await self._load_templates(reference_images or [])

        self._dir.mkdir(parents=True, exist_ok=True)
        run = uuid.uuid4().hex
        caption = (alt or clean)[:200]

        await self._emit(
            {
                "type": "image",
                "phase": "start",
                "run": run,
                "prompt": clean[:400],
                "alt": caption,
                "references": len(templates),
            }
        )

        drafts: list[Path] = []
        try:
            data = await self._generate(
                clean, templates, size, quality, run, caption, drafts
            )
        except openai.APIStatusError as exc:
            await self._emit({"type": "image", "phase": "error", "run": run})
            raise ToolError(
                f"The image API refused this request (HTTP {exc.status_code}): "
                f"{_reason(exc)}"
            ) from exc
        except openai.APIError as exc:
            await self._emit({"type": "image", "phase": "error", "run": run})
            raise ToolError(f"Image generation failed: {exc}") from exc
        finally:
            for path in drafts:
                path.unlink(missing_ok=True)

        path = self._store(data)
        url = _url(path)
        await self._emit(
            {
                "type": "image",
                "phase": "done",
                "run": run,
                "url": url,
                "alt": caption,
            }
        )
        logger.info(
            "image.generated",
            extra={
                "model": self._cfg.model,
                "bytes": len(data),
                "references": len(templates),
            },
        )

        return self._report(url, caption, len(data), templates, await self._store_in_bucket(path, caption))


    async def _generate(
        self,
        prompt: str,
        templates: list[tuple[str, bytes, str]],
        size: str | None,
        quality: str | None,
        run: str,
        alt: str,
        drafts: list[Path],
    ) -> bytes:
        common: dict[str, Any] = {
            "model": self._cfg.model,
            "prompt": prompt,
            "size": size or self._cfg.size,
            "quality": quality or self._cfg.quality,
            "output_format": self._cfg.output_format,
            "stream": True,
            "partial_images": self._cfg.partial_images,
        }

        if templates:
            stream = await self._client.images.edit(image=templates, **common)
        else:
            stream = await self._client.images.generate(
                moderation=self._cfg.moderation, **common
            )

        last: bytes | None = None

        async for event in stream:
            raw = getattr(event, "b64_json", None)
            if not raw:
                continue
            data = base64.b64decode(raw)

            if event.type.endswith(".partial_image"):
                path = self._store(data)
                drafts.append(path)
                await self._emit(
                    {
                        "type": "image",
                        "phase": "partial",
                        "run": run,
                        "index": getattr(event, "partial_image_index", 0),
                        "url": _url(path),
                        "alt": alt,
                    }
                )
            else:
                last = data

        if last is None:
            raise ToolError("The image API returned no image.")
        return last


    async def _load_templates(
        self, references: list[str]
    ) -> list[tuple[str, bytes, str]]:
        if not references:
            return []
        if self._cfg.max_references == 0:
            raise ToolError("Reference images are disabled (IMAGE_MAX_REFERENCES=0).")
        if len(references) > self._cfg.max_references:
            raise ToolError(
                f"At most {self._cfg.max_references} reference images, "
                f"got {len(references)}."
            )

        loaded: list[tuple[str, bytes, str]] = []
        for reference in references:
            loaded.append(await self._load_template(str(reference).strip()))
        return loaded

    async def _load_template(self, reference: str) -> tuple[str, bytes, str]:
        if not reference:
            raise ToolError("An empty reference image was given.")

        if reference.startswith(("http://", "https://")):
            data, kind = await self._fetch(reference)
        else:
            data, kind = self._from_disk(reference)

        if kind not in TEMPLATE_TYPES:
            raise ToolError(
                f"{reference}: {kind or 'unknown type'} cannot be used as a "
                f"reference. Use PNG, JPEG or WebP."
            )
        if len(data) > self._cfg.reference_max_bytes:
            raise ToolError(
                f"{reference} is larger than "
                f"{self._cfg.reference_max_bytes // 1_000_000} MB."
            )
        return (f"reference.{TEMPLATE_TYPES[kind]}", data, kind)

    def _from_disk(self, reference: str) -> tuple[bytes, str]:
        if (matched := re.search(r"/api/uploads/([0-9a-f]{32})", reference)) is not None:
            candidates = sorted(self._dir.glob(f"{matched.group(1)}.*"))
            if not candidates:
                raise ToolError(f"{reference} is not stored here (any more).")
            path = candidates[0]
        else:
            path = Path(reference).expanduser()

        try:
            resolved = path.resolve(strict=True)
        except OSError as exc:
            raise ToolError(f"{reference} does not exist.") from exc

        if not resolved.is_relative_to(self._dir.resolve()):
            raise ToolError(
                f"{reference} is outside the attachment folder. Reference "
                f"images have to be files from this conversation -- something "
                f"the user attached, or an image you generated."
            )
        if not resolved.is_file():
            raise ToolError(f"{reference} is not a file.")

        kind = mimetypes.guess_type(resolved.name)[0] or ""
        return resolved.read_bytes(), kind

    async def _fetch(self, url: str) -> tuple[bytes, str]:
        if self._http is None:
            raise ToolError("Fetching reference images by URL is not available.")
        try:
            response = await self._http.get(url)
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise ToolError(f"{url} could not be fetched: {exc}") from exc

        kind = (response.headers.get("content-type") or "").split(";")[0].strip().lower()
        return response.content, kind


    def _store(self, data: bytes) -> Path:
        path = self._dir / f"{uuid.uuid4().hex}.{self._cfg.output_format}"
        path.write_bytes(data)
        return path

    async def _store_in_bucket(self, path: Path, alt: str) -> str | None:
        if not self._cfg.archive or self._mc is None:
            return None

        key = (
            f"{self._cfg.archive_prefix}/"
            f"{dt.date.today().isoformat()}-{_slug(alt)}-{path.stem[:8]}{path.suffix}"
        )
        try:
            await self._mc.json_lines(
                "cp",
                "--quiet",
                "--attr",
                f"Content-Type=image/{self._cfg.output_format}",
                str(path),
                self._mc.target(key),
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Image not stored in bucket: %s", exc)
            return None
        return self._mc.url(key)

    def _report(
        self,
        url: str,
        alt: str,
        size: int,
        templates: list[tuple[str, bytes, str]],
        gallery: str | None,
    ) -> str:
        lines = [
            f"Image generated ({size // 1024} KB, {self._cfg.model}"
            + (f", from {len(templates)} reference image(s)" if templates else "")
            + ")."
        ]
        if gallery:
            lines.append(
                f"Also filed in your gallery under "
                f"{self._cfg.archive_prefix}/ -- storage_list shows it, and "
                f"its public address is {gallery}"
            )
        lines += [
            "",
            "Show it to the user by putting exactly this in your answer:",
            "",
            f"![{alt}]({url})",
            "",
            "To change this image later, pass this same URL back in "
            "reference_images and describe only what should differ.",
        ]
        return "\n".join(lines)

    async def _emit(self, event: dict[str, Any]) -> None:
        if self._bus is not None:
            await self._bus.publish(event)

    async def aclose(self) -> None:
        await self._client.close()


def _url(path: Path) -> str:
    return f"/api/uploads/{path.stem}"


def _slug(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return (slug[:48].rstrip("-")) or "image"


def _reason(exc: openai.APIStatusError) -> str:
    body = getattr(exc, "body", None)
    if isinstance(body, dict):
        error = body.get("error")
        if isinstance(error, dict) and (m := error.get("message")):
            return str(m)
    return str(exc)[:200]
