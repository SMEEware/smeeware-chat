from __future__ import annotations

import asyncio
import base64
import hashlib
import ipaddress
import re
import socket
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx
import openai
from openai import AsyncOpenAI

from src.core.exceptions import ProviderError
from src.core.logging import get_logger
from src.services.tools.base import ToolError

logger = get_logger(__name__)

SIGNATURES: tuple[tuple[bytes, str], ...] = (
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"GIF87a", "image/gif"),
    (b"GIF89a", "image/gif"),
)
MAX_URL = 8192
DETAILS = {"low", "high", "original", "auto"}
DATA_URL = re.compile(r"^data:(image/[\w.+-]+);base64,(.+)$", re.S | re.I)

DEFAULT_QUESTION = (
    "Describe this image so that someone who cannot see it can work with it: "
    "image type, content, visible text verbatim, numbers and labels, notable "
    "details. No guesses about things that are not visible."
)


class VisionError(ToolError):
    ...


@dataclass(frozen=True, slots=True)
class Image:
    block: dict[str, Any]
    origin: str
    mime: str | None = None
    bytes_: int = 0
    embedded: bool = False

    @property
    def fingerprint(self) -> str:
        raw = self.block.get("image_url", {}).get("url", "")
        return hashlib.sha256(raw.encode("utf-8", "replace")).hexdigest()[:32]


class VisionService:
    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        base_url: str,
        http: httpx.AsyncClient,
        detail: str = "auto",
        max_images: int = 8,
        max_bytes: int = 32 * 1024 * 1024,
        max_tokens: int = 2000,
        timeout: float = 120.0,
        cache_ttl: float = 900.0,
    ) -> None:
        self.model = model
        self._client = AsyncOpenAI(
            api_key=api_key, base_url=base_url, timeout=timeout, max_retries=1
        )
        self._http = http
        self._detail = detail if detail in DETAILS else "auto"
        self._max_images = max_images
        self._max_bytes = max_bytes
        self._max_tokens = max_tokens
        self._cache_ttl = cache_ttl
        self._cache: dict[str, tuple[float, str]] = {}


    async def load(self, source: str | bytes, *, detail: str | None = None) -> Image:
        level = detail if detail in DETAILS else self._detail

        if isinstance(source, bytes):
            return self._from_bytes(source, "uploaded file", level)

        text = source.strip()
        if not text:
            raise VisionError("No image provided.")

        if matched := DATA_URL.match(text):
            raw = _decode_base64(matched.group(2))
            return self._from_bytes(raw, "data URL", level, mime_hint=matched.group(1))

        if text.lower().startswith(("http://", "https://")):
            return await self._from_url(text, level)

        path = Path(text).expanduser()
        if path.is_file():
            return self._from_bytes(_read(path, self._max_bytes), str(path), level)

        if len(text) > 100 and re.fullmatch(r"[A-Za-z0-9+/=\s]+", text):
            return self._from_bytes(_decode_base64(text), "base64 data", level)

        raise VisionError(
            f"{text[:120]!r} is neither a URL nor an existing file. "
            "Give an http(s) address, a file path, or a data: URL."
        )

    async def _from_url(self, url: str, detail: str) -> Image:
        if len(url) > MAX_URL:
            raise VisionError(
                f"The URL is {len(url)} characters long, the limit is {MAX_URL}."
            )
        if reason := _unsuitable_extension(url):
            raise VisionError(reason)
        if await _internal_only(urlparse(url).hostname):
            logger.info("Not publicly reachable, embedding instead: %s", url)
            return self._from_bytes(await self._fetch(url), url, detail)

        return Image(
            block={"type": "image_url", "image_url": {"url": url, "detail": detail}},
            origin=url,
        )

    def _from_bytes(
        self,
        raw: bytes,
        origin: str,
        detail: str,
        *,
        mime_hint: str | None = None,
    ) -> Image:
        if not raw:
            raise VisionError(f"{origin}: empty file.")
        if len(raw) > self._max_bytes:
            raise VisionError(
                f"{origin} is {_readable_size(len(raw))}, the limit is "
                f"{_readable_size(self._max_bytes)}."
            )

        mime = _detect_format(raw)
        if mime is None:
            announced = f" (announced as {mime_hint})" if mime_hint else ""
            raise VisionError(
                f"{origin}{announced} is not a JPEG, PNG, GIF, or WebP. "
                f"The format is detected from the content, not the extension."
                f"{_bytes_hint(raw)}"
            )

        encoded = base64.b64encode(raw).decode("ascii")
        return Image(
            block={
                "type": "image_url",
                "image_url": {
                    "url": f"data:{mime};base64,{encoded}",
                    "detail": detail,
                },
            },
            origin=origin,
            mime=mime,
            bytes_=len(raw),
            embedded=True,
        )

    async def _fetch(self, url: str) -> bytes:
        try:
            response = await self._http.get(url, follow_redirects=True)
        except httpx.HTTPError as exc:
            raise VisionError(f"{url} unreachable: {exc}") from exc
        if response.status_code != 200:
            raise VisionError(f"{url} responded with HTTP {response.status_code}.")
        if len(response.content) > self._max_bytes:
            raise VisionError(
                f"{url} returns {_readable_size(len(response.content))}, the limit is "
                f"{_readable_size(self._max_bytes)}."
            )
        return response.content


    async def ask(
        self,
        sources: list[str | bytes],
        question: str | None = None,
        *,
        detail: str | None = None,
    ) -> tuple[str, list[Image]]:
        if not sources:
            raise VisionError("No image provided.")
        if len(sources) > self._max_images:
            raise VisionError(
                f"{len(sources)} images at once -- the limit is {self._max_images}."
            )

        images = [await self.load(q, detail=detail) for q in sources]
        text = (question or DEFAULT_QUESTION).strip() or DEFAULT_QUESTION

        key = _cache_key(images, text)
        if (cached := self._from_cache(key)) is not None:
            logger.info("Vision from cache (%d image(s))", len(images))
            return cached, images

        response = await self._questions(images, text)
        self._cache[key] = (time.monotonic(), response)
        return response, images

    async def _questions(self, images: list[Image], text: str) -> str:
        content: list[dict[str, Any]] = [{"type": "text", "text": text}]
        content += [image.block for image in images]

        logger.info(
            "Vision: %s, %d image(s) (%s)",
            self.model,
            len(images),
            ", ".join("embedded" if b.embedded else "URL" for b in images),
        )
        try:
            response = await self._client.chat.completions.create(
                model=self.model,
                max_tokens=self._max_tokens,
                messages=[{"role": "user", "content": content}],
            )
        except openai.APIStatusError as exc:
            raise VisionError(_api_error(exc)) from exc
        except openai.APIError as exc:
            raise ProviderError(f"Vision model unreachable: {exc}") from exc

        result = (response.choices[0].message.content or "").strip()
        if not result:
            raise VisionError("The vision model returned nothing.")
        return result

    def _from_cache(self, key: str) -> str | None:
        entry = self._cache.get(key)
        if entry is None:
            return None
        stored_at, response = entry
        if time.monotonic() - stored_at > self._cache_ttl:
            self._cache.pop(key, None)
            return None
        return response

    async def health(self) -> bool:
        return True

    async def aclose(self) -> None:
        await self._client.close()
        await self._http.aclose()


def _detect_format(raw: bytes) -> str | None:
    for signature, mime in SIGNATURES:
        if raw.startswith(signature):
            return mime
    if raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
        return "image/webp"
    return None


_UNSUITABLE = {
    ".svg": (
        "This is an SVG -- text, not a raster image. Read it with storage_get "
        "or fetch_page, that is more precise; if you need an image of it, "
        "render it to PNG first (e.g. rsvg-convert)."
    ),
    ".pdf": "This is a PDF -- convert the desired page to a PNG first.",
    ".bmp": "BMP is not supported -- convert the file to PNG first.",
    ".tif": "TIFF is not supported -- convert the file to PNG first.",
    ".tiff": "TIFF is not supported -- convert the file to PNG first.",
}


def _unsuitable_extension(url: str) -> str | None:
    path = urlparse(url).path.lower()
    for extension, hint in _UNSUITABLE.items():
        if path.endswith(extension):
            return f"{url} cannot be read by the vision model. {hint}"
    return None


def _bytes_hint(raw: bytes) -> str:
    start = raw[:512].lstrip()
    if start[:5].lower() == b"<?xml" or b"<svg" in start[:200].lower():
        return (
            " This looks like SVG: SVG is text -- read it with storage_get or "
            "fetch_page, that is more precise than looking at it. If you need "
            "an image of it, render it to PNG first (e.g. rsvg-convert)."
        )
    if start.startswith(b"%PDF"):
        return " This is a PDF -- convert the desired page to a PNG first."
    if start[:2] in (b"BM", b"II", b"MM"):
        return " BMP and TIFF are not supported -- convert the file to PNG first."
    return ""


def _read(path: Path, limit: int) -> bytes:
    size = path.stat().st_size
    if size > limit:
        raise VisionError(
            f"{path} is {_readable_size(size)}, the limit is {_readable_size(limit)}."
        )
    try:
        return path.read_bytes()
    except OSError as exc:
        raise VisionError(f"{path} not readable: {exc}") from exc


def _decode_base64(text: str) -> bytes:
    try:
        return base64.b64decode(re.sub(r"\s+", "", text), validate=True)
    except (ValueError, TypeError) as exc:
        raise VisionError(f"Base64 data could not be decoded: {exc}") from exc


async def _internal_only(host: str | None) -> bool:
    if not host:
        return True
    if host in ("localhost", "localhost.localdomain") or host.endswith(".local"):
        return True
    try:
        addresses = await asyncio.get_running_loop().getaddrinfo(
            host, None, type=socket.SOCK_STREAM
        )
    except OSError:
        return False

    for entry in addresses:
        try:
            address = ipaddress.ip_address(entry[4][0])
        except ValueError:
            continue
        if not (address.is_private or address.is_loopback or address.is_link_local):
            return False
    return bool(addresses)


def _cache_key(images: list[Image], question: str) -> str:
    raw = "|".join(b.fingerprint for b in images) + "|" + question
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _api_error(exc: openai.APIStatusError) -> str:
    message = ""
    if isinstance(getattr(exc, "body", None), dict):
        error = exc.body.get("error")
        if isinstance(error, dict):
            message = str(error.get("message") or "")
    return f"Vision model rejected (HTTP {exc.status_code}): {message or exc}"


def _readable_size(bytes_: int) -> str:
    if bytes_ < 1024:
        return f"{bytes_} B"
    if bytes_ < 1024 * 1024:
        return f"{bytes_ / 1024:.1f} KB"
    return f"{bytes_ / (1024 * 1024):.1f} MB"
