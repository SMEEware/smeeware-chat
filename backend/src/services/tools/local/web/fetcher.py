from __future__ import annotations

import asyncio
import re
import time
from dataclasses import dataclass, replace
from urllib.parse import urlparse, urlunparse

import httpx

from src.core.logging import get_logger
from src.services.tools.base import ToolError

logger = get_logger(__name__)

CACHE_MAX = 64
META_CHARSET = re.compile(rb"""charset=["']?\s*([a-zA-Z0-9_\-]+)""", re.I)


class FetchError(ToolError):
    ...


@dataclass(frozen=True)
class Page:
    url: str
    status: int
    content_type: str
    text: str
    bytes_read: int
    clipped: bool
    from_cache: bool = False

    @property
    def is_html(self) -> bool:
        return "html" in self.content_type or "xml" in self.content_type

    @property
    def is_json(self) -> bool:
        return "json" in self.content_type

    def origin(self) -> str:
        parts = [f"Source: {self.url}"]
        if self.status != 200:
            parts.append(f"HTTP {self.status}")
        if self.from_cache:
            parts.append("from cache")
        if self.clipped:
            parts.append(f"download cut off at {self.bytes_read // 1024} KB")
        return " | ".join(parts)


class PageFetcher:
    def __init__(
        self,
        client: httpx.AsyncClient,
        *,
        max_bytes: int = 2_000_000,
        cache_ttl: float = 300.0,
        concurrency: int = 4,
        host_delay: float = 0.25,
    ) -> None:
        self._client = client
        self._max_bytes = max_bytes
        self._cache_ttl = cache_ttl
        self._host_delay = host_delay
        self._gate = asyncio.Semaphore(max(1, concurrency))
        self._cache: dict[str, tuple[float, Page]] = {}
        self._last_seen: dict[str, float] = {}
        self._host_locks: dict[str, asyncio.Lock] = {}

    async def get(
        self,
        url: str,
        *,
        method: str = "GET",
        headers: dict[str, str] | None = None,
        json_body: object | None = None,
        use_cache: bool = True,
    ) -> Page:
        url = _normalise(url)
        host = urlparse(url).netloc
        cacheable = use_cache and method.upper() == "GET" and json_body is None

        if cacheable and (page := self._from_cache(url)) is not None:
            return page

        async with self._gate:
            await self._throttle(host)
            try:
                async with self._client.stream(
                    method.upper(), url, headers=headers, json=json_body
                ) as response:
                    raw, clipped = await self._read(response)
                    page = Page(
                        url=str(response.url),
                        status=response.status_code,
                        content_type=response.headers.get("content-type", "").lower(),
                        text=_decode(response, raw),
                        bytes_read=len(raw),
                        clipped=clipped,
                    )
            except httpx.HTTPError as exc:
                raise FetchError(
                    f"{url} unreachable: {type(exc).__name__}: {exc}"
                ) from exc

        logger.info(
            "Fetched: %s (HTTP %d, %d B%s)",
            page.url,
            page.status,
            page.bytes_read,
            ", truncated" if page.clipped else "",
        )
        if cacheable:
            self._store(url, page)
        return page

    async def get_many(self, urls: list[str], **kwargs: object) -> list[Page | FetchError]:
        tasks = [self.get(u, **kwargs) for u in urls]  # type: ignore[arg-type]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        return [
            e if isinstance(e, (Page, FetchError)) else FetchError(f"{type(e).__name__}: {e}")
            for e in results
        ]


    async def _read(self, response: httpx.Response) -> tuple[bytes, bool]:
        chunks: list[bytes] = []
        read = 0
        async for chunk in response.aiter_bytes():
            chunks.append(chunk)
            read += len(chunk)
            if read >= self._max_bytes:
                return b"".join(chunks)[: self._max_bytes], True
        return b"".join(chunks), False

    async def _throttle(self, host: str) -> None:
        if self._host_delay <= 0:
            return
        lock = self._host_locks.setdefault(host, asyncio.Lock())
        async with lock:
            wait_time = self._host_delay - (time.monotonic() - self._last_seen.get(host, 0.0))
            if wait_time > 0:
                await asyncio.sleep(wait_time)
            self._last_seen[host] = time.monotonic()

    def _from_cache(self, url: str) -> Page | None:
        entry = self._cache.get(url)
        if entry is None:
            return None
        stored_at, page = entry
        if time.monotonic() - stored_at > self._cache_ttl:
            self._cache.pop(url, None)
            return None
        return replace(page, from_cache=True)

    def _store(self, url: str, page: Page) -> None:
        self._cache[url] = (time.monotonic(), page)
        while len(self._cache) > CACHE_MAX:
            self._cache.pop(next(iter(self._cache)))


def _normalise(url: str) -> str:
    url = url.strip()
    if "://" not in url and not url.startswith("//"):
        url = f"https://{url}"
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise FetchError(
            f"Scheme {parsed.scheme!r} is not supported -- only http and https."
        )
    if not parsed.netloc:
        raise FetchError(f"{url!r} is not a complete address.")
    return urlunparse(parsed._replace(fragment=""))


def _decode(response: httpx.Response, raw: bytes) -> str:
    encoding = getattr(response, "charset_encoding", None)
    if not encoding and (matched := META_CHARSET.search(raw[:4096])):
        encoding = matched.group(1).decode("ascii", "ignore")
    try:
        return raw.decode(encoding or "utf-8", "replace")
    except LookupError:
        return raw.decode("utf-8", "replace")
