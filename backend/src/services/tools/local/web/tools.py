from __future__ import annotations

import json
import re
from typing import Any
from urllib.parse import urljoin, urlparse

from bs4 import Tag

from src.core.logging import get_logger
from src.services.tools.base import ToolError
from src.services.tools.local.base import LocalTool
from src.services.tools.local.web import markdown as md
from src.services.tools.local.web.fetcher import FetchError, Page, PageFetcher

logger = get_logger(__name__)

MAX_CHARS = 12_000
MAX_URLS = 10


class _WebTool(LocalTool):
    def __init__(self, fetcher: PageFetcher, max_chars: int = MAX_CHARS) -> None:
        self._fetcher = fetcher
        self._max_chars = max_chars

    async def _page(self, url: str) -> Page | str:
        try:
            return await self._fetcher.get(url)
        except FetchError as exc:
            return str(exc)


class FetchPageTool(_WebTool):
    name = "fetch_page"
    description = (
        "Loads a web page and returns it as Markdown -- headings, lists, "
        "tables, and links are preserved, navigation and ads are stripped. "
        "Your default tool when you need the content of a page. Long pages are "
        "truncated; use 'offset' to read on. For pure JSON APIs use "
        "fetch_json, for individual fields use extract_selectors."
    )
    parameters = {
        "type": "object",
        "properties": {
            "url": {"type": "string", "description": "Full URL (http/https)"},
            "mode": {
                "type": "string",
                "enum": ["article", "full", "text"],
                "description": (
                    "article = main content only (default), full = whole page "
                    "including navigation and footer, text = plain text without "
                    "Markdown formatting"
                ),
            },
            "selector": {
                "type": "string",
                "description": (
                    "Optional CSS selector: only this area is converted, "
                    "e.g. 'main' or '#content'"
                ),
            },
            "offset": {
                "type": "integer",
                "description": "Character offset to start reading from (for paging)",
            },
            "max_chars": {
                "type": "integer",
                "description": f"Output limit (default {MAX_CHARS})",
            },
            "images": {
                "type": "boolean",
                "description": "Include image URLs (default false, saves characters)",
            },
        },
        "required": ["url"],
    }

    async def run(
        self,
        url: str,
        mode: str = "article",
        selector: str | None = None,
        offset: int = 0,
        max_chars: int | None = None,
        images: bool = False,
    ) -> str:
        page = await self._page(url)
        if isinstance(page, str):
            raise ToolError(page)
        if error := _content_check(page):
            raise ToolError(error)

        soup = md.parse(page.text)
        heading = md.title(soup)
        md.clean(soup, keep_chrome=mode == "full" or bool(selector))

        if selector:
            matched = _select(soup, selector)
            if isinstance(matched, str):
                raise ToolError(matched)
            if not matched:
                return f"{page.origin()}\n\nNo match for selector {selector!r}."
            parts = [md.to_markdown(k, page.url, images=images) for k in matched]
            content = "\n\n".join(t for t in parts if t)
        else:
            root = md.main_content(soup) if mode == "article" else (soup.body or soup)
            content = md.to_markdown(root, page.url, images=images)

        if mode == "text":
            content = _unmark(content)
        if not content.strip():
            return (
                f"{page.origin()}\n\nNo readable text found -- the page "
                "probably builds its content via JavaScript."
            )

        head = page.origin()
        if heading:
            head += f"\nTitle: {heading}"
        return f"{head}\n\n{_excerpt(content, offset, max_chars or self._max_chars)}"


class ExtractSelectorsTool(_WebTool):
    name = "extract_selectors"
    description = (
        "Extracts specific parts of a page via CSS selectors -- prices, "
        "titles, table cells, list items. Use this instead of fetch_page when "
        "you know what you are looking for: the output is a fraction as long. "
        "You get an attribute with ' @name' after the selector, e.g. "
        "'a.result @href' or 'img @src'."
    )
    parameters = {
        "type": "object",
        "properties": {
            "url": {"type": "string", "description": "Full URL"},
            "selectors": {
                "type": "object",
                "additionalProperties": {"type": "string"},
                "description": (
                    'Name → CSS selector, e.g. {"title": "h1", "price": '
                    '".price", "links": "a.item @href"}'
                ),
            },
            "limit": {
                "type": "integer",
                "description": "At most this many matches per selector (default 20)",
            },
            "content": {
                "type": "string",
                "enum": ["text", "markdown", "html"],
                "description": "What comes back per match (default text)",
            },
        },
        "required": ["url", "selectors"],
    }

    async def run(
        self,
        url: str,
        selectors: Any,
        limit: int = 20,
        content: str = "text",
    ) -> str:
        preferred = _selectors(selectors)
        if isinstance(preferred, str):
            raise ToolError(preferred)

        page = await self._page(url)
        if isinstance(page, str):
            raise ToolError(page)
        if error := _content_check(page):
            raise ToolError(error)

        soup = md.clean(md.parse(page.text), keep_chrome=True)
        cap = max(1, min(int(limit), 200))
        lines = [page.origin(), ""]

        for name, expression in preferred.items():
            selector, attribute = _strip_attribute(expression)
            matched = _select(soup, selector)
            if isinstance(matched, str):
                lines += [f"## {name}", matched, ""]
                continue
            if not matched:
                lines += [f"## {name} — no match ({selector})", ""]
                continue

            values = [
                w
                for node in matched[:cap]
                if (w := _value(node, attribute, content, page.url))
            ]
            head = f"## {name} — {len(matched)} matches"
            if len(matched) > cap:
                head += f" (the first {cap})"
            lines.append(head)
            lines += [f"{i}. {w}" for i, w in enumerate(values, start=1)]
            lines.append("")

        return _excerpt(
            "\n".join(lines),
            0,
            self._max_chars,
            continuation="use narrower selectors or a smaller 'limit'",
        )


class ExtractTablesTool(_WebTool):
    name = "extract_tables"
    description = (
        "Extracts a page's tables as Markdown tables -- for prices, "
        "comparisons, statistics, specifications. Without 'index' you get an "
        "overview of all tables with their first rows; with 'index' the one "
        "table in full."
    )
    parameters = {
        "type": "object",
        "properties": {
            "url": {"type": "string", "description": "Full URL"},
            "index": {
                "type": "integer",
                "description": "Only this table (1 = the first on the page)",
            },
            "max_rows": {
                "type": "integer",
                "description": "Rows per table (default 50)",
            },
        },
        "required": ["url"],
    }

    async def run(
        self, url: str, index: int | None = None, max_rows: int = 50
    ) -> str:
        page = await self._page(url)
        if isinstance(page, str):
            raise ToolError(page)
        if error := _content_check(page):
            raise ToolError(error)

        soup = md.clean(md.parse(page.text), keep_chrome=True)
        tables = [t for t in soup.find_all("table") if t.find("tr")]
        if not tables:
            return f"{page.origin()}\n\nNo tables on this page."

        cap = max(1, min(int(max_rows), 500))
        if index is not None:
            if not 1 <= index <= len(tables):
                return (
                    f"{page.origin()}\n\nThere are {len(tables)} tables, "
                    f"index={index} is out of range."
                )
            selected = [(index, tables[index - 1])]
            rows_per_table = cap
        else:
            selected = list(enumerate(tables, start=1))
            rows_per_table = min(cap, 5 if len(tables) > 1 else cap)

        lines = [page.origin(), f"{len(tables)} table(s) found.", ""]
        for number, table in selected:
            caption = table.find("caption")
            title = caption.get_text(" ", strip=True) if caption else ""
            lines.append(f"## Table {number}{f' — {title}' if title else ''}")
            lines.append(md.table_to_markdown(table, max_rows=rows_per_table))
            lines.append("")

        if index is None and len(tables) > 1:
            lines.append("Full table: extract_tables with index=<number>.")
        return _excerpt(
            "\n".join(lines),
            0,
            self._max_chars,
            continuation="fetch a single table with index=<number>",
        )


class ListLinksTool(_WebTool):
    name = "list_links"
    description = (
        "Lists a page's links with their anchor text. This is how you find the "
        "way onward: article indexes, subpages, documentation chapters, next "
        "page. Then fetch_page or batch_fetch on the interesting hits."
    )
    parameters = {
        "type": "object",
        "properties": {
            "url": {"type": "string", "description": "Full URL"},
            "pattern": {
                "type": "string",
                "description": (
                    "Filter: only links whose URL or text contains this "
                    "(a regular expression is also possible)"
                ),
            },
            "scope": {
                "type": "string",
                "enum": ["all", "internal", "external"],
                "description": "Same domain, other domain, or all (default all)",
            },
            "limit": {
                "type": "integer",
                "description": "At most this many links (default 100)",
            },
        },
        "required": ["url"],
    }

    async def run(
        self,
        url: str,
        pattern: str | None = None,
        scope: str = "all",
        limit: int = 100,
    ) -> str:
        page = await self._page(url)
        if isinstance(page, str):
            raise ToolError(page)
        if error := _content_check(page):
            raise ToolError(error)

        soup = md.clean(md.parse(page.text), keep_chrome=True)
        own_host = urlparse(page.url).netloc
        filter_ = _pattern(pattern)

        found: dict[str, str] = {}
        for anchor in soup.find_all("a"):
            target = str(anchor.get("href") or "").strip()
            if not target or target.startswith(("javascript:", "mailto:", "tel:", "#")):
                continue
            absolute = urljoin(page.url, target).split("#")[0]
            if not absolute.startswith(("http://", "https://")):
                continue
            internal = urlparse(absolute).netloc == own_host
            if (scope == "internal" and not internal) or (scope == "external" and internal):
                continue
            text = re.sub(r"\s+", " ", anchor.get_text(" ", strip=True))[:120]
            if filter_ and not (filter_.search(absolute) or filter_.search(text)):
                continue
            found.setdefault(absolute, text or "(no text)")

        if not found:
            notification = f" with filter {pattern!r}" if pattern else ""
            return f"{page.origin()}\n\nNo matching links{notification}."

        cap = max(1, min(int(limit), 300))
        lines = [page.origin(), f"{len(found)} link(s), scope={scope}", ""]
        for number, (target, text) in enumerate(list(found.items())[:cap], start=1):
            lines.append(f"{number}. {text}\n   {target}")
        if len(found) > cap:
            lines.append(f"\n[... {len(found) - cap} more links]")
        return _excerpt(
            "\n".join(lines),
            0,
            self._max_chars,
            continuation="filter more narrowly with 'pattern' or 'scope'",
        )


class FetchJsonTool(_WebTool):
    name = "fetch_json"
    description = (
        "Calls a JSON API and returns first the structure (which fields with "
        "which types), then the data. Use this for APIs, endpoints, and .json "
        "files instead of fetch_page. With 'path' you reach directly into the "
        "response, e.g. 'data.items[0]' -- that saves a second call."
    )
    parameters = {
        "type": "object",
        "properties": {
            "url": {"type": "string", "description": "Endpoint URL"},
            "method": {
                "type": "string",
                "enum": ["GET", "POST"],
                "description": "HTTP method (default GET)",
            },
            "body": {
                "type": "object",
                "description": "JSON body for POST",
            },
            "headers": {
                "type": "object",
                "additionalProperties": {"type": "string"},
                "description": 'Additional headers, e.g. {"Authorization": "Bearer ..."}',
            },
            "path": {
                "type": "string",
                "description": "Path into the response, e.g. 'data.items[0].name'",
            },
            "max_chars": {
                "type": "integer",
                "description": f"Output limit (default {MAX_CHARS})",
            },
        },
        "required": ["url"],
    }

    async def run(
        self,
        url: str,
        method: str = "GET",
        body: Any = None,
        headers: Any = None,
        path: str | None = None,
        max_chars: int | None = None,
    ) -> str:
        request_headers = {"Accept": "application/json"}
        if isinstance(headers, dict):
            request_headers.update({str(k): str(v) for k, v in headers.items()})

        try:
            page = await self._fetcher.get(
                url,
                method=method,
                headers=request_headers,
                json_body=_as_object(body) if method.upper() == "POST" else None,
            )
        except FetchError as exc:
            raise ToolError(str(exc)) from exc

        try:
            data = json.loads(page.text)
        except json.JSONDecodeError as exc:
            excerpt = page.text.strip()[:500]
            raise ToolError(
                f"{page.origin()}\n\nResponse is not JSON ({exc.msg}). "
                f"Content-Type: {page.content_type or 'unknown'}.\n\n{excerpt}"
            ) from exc

        if path:
            data = _path(data, path)
            if isinstance(data, str) and data.startswith("__fehler__"):
                raise ToolError(f"{page.origin()}\n\n{data.removeprefix('__fehler__')}")

        head = page.origin()
        if page.status >= 400:
            head += " (error response -- the body is below)"

        notification = "reach into the response with 'path', e.g. path='data.items[0]'"
        text = json.dumps(data, indent=2, ensure_ascii=False, default=str)
        return (
            f"{head}\n\nStructure{f' at {path}' if path else ''}:\n"
            f"{_structure(data)}\n\nData:\n"
            f"{_excerpt(text, 0, max_chars or self._max_chars, continuation=notification)}"
        )


class BatchFetchTool(_WebTool):
    name = "batch_fetch"
    description = (
        "Loads several pages in parallel and returns them as Markdown -- "
        "throttled so no server is overrun. Use this after a search or after "
        "list_links to read several hits in one go, instead of calling "
        "fetch_page repeatedly. Each page yields less text than fetch_page -- "
        "for depth, reload the specific page afterwards."
    )
    parameters = {
        "type": "object",
        "properties": {
            "urls": {
                "type": "array",
                "items": {"type": "string"},
                "description": f"Up to {MAX_URLS} URLs",
            },
            "mode": {
                "type": "string",
                "enum": ["article", "full", "text"],
                "description": "Like fetch_page (default article)",
            },
            "max_chars": {
                "type": "integer",
                "description": "Characters per page (default 3000)",
            },
        },
        "required": ["urls"],
    }

    async def run(
        self, urls: Any, mode: str = "article", max_chars: int = 3000
    ) -> str:
        items = _url_list(urls)
        if isinstance(items, str):
            raise ToolError(items)

        per_page = max(200, min(int(max_chars), self._max_chars))
        results = await self._fetcher.get_many(items)

        parts = [f"{len(items)} page(s) fetched.", ""]
        for number, (url, result) in enumerate(zip(items, results), start=1):
            parts.append(f"═══ {number}/{len(items)}: {url}")
            if isinstance(result, FetchError):
                parts += [f"Failed: {result}", ""]
                continue
            if error := _content_check(result):
                parts += [error, ""]
                continue

            soup = md.parse(result.text)
            heading = md.title(soup)
            md.clean(soup, keep_chrome=mode == "full")
            root = md.main_content(soup) if mode == "article" else (soup.body or soup)
            content = md.to_markdown(root, result.url)
            if mode == "text":
                content = _unmark(content)

            if heading:
                parts.append(f"Title: {heading}")
            parts += [
                _excerpt(
                    content, 0, per_page, continuation="fetch the whole page with fetch_page"
                )
                or "(no readable text)",
                "",
            ]

        return "\n".join(parts)


def _content_check(page: Page) -> str | None:
    if page.status >= 400:
        return (
            f"{page.url} responded with HTTP {page.status}. "
            + ("The page probably requires a login or blocks bots."
               if page.status in (401, 403, 429)
               else "Check the address.")
        )
    kind = page.content_type
    if kind and not page.is_html and "text" not in kind:
        if page.is_json:
            return f"{page.url} returns JSON -- use fetch_json for that."
        return f"{page.url} returns {kind!r}, which is not text."
    return None


def _select(soup: Any, selector: str) -> list[Tag] | str:
    try:
        return list(soup.select(selector))
    except Exception as exc:  # noqa: BLE001
        return f"Selector {selector!r} is invalid: {exc}"


def _strip_attribute(expression: str) -> tuple[str, str | None]:
    if "@" in expression:
        selector, _, attribute = expression.rpartition("@")
        if selector.strip():
            return selector.strip(), attribute.strip()
    return expression.strip(), None


def _value(node: Tag, attribute: str | None, content: str, basis: str) -> str:
    if attribute:
        raw = node.get(attribute)
        if raw is None:
            return ""
        value = " ".join(raw) if isinstance(raw, list) else str(raw)
        return urljoin(basis, value) if attribute in ("href", "src", "action") else value
    if content == "html":
        return re.sub(r"\s+", " ", str(node))[:1000]
    if content == "markdown":
        return md.to_markdown(node, basis).replace("\n", " ").strip()
    return re.sub(r"\s+", " ", node.get_text(" ", strip=True))


def _selectors(raw_value: Any) -> dict[str, str] | str:
    if isinstance(raw_value, str):
        try:
            raw_value = json.loads(raw_value)
        except json.JSONDecodeError:
            raw_value = [raw_value]
    if isinstance(raw_value, dict):
        pairs = {str(k): str(v) for k, v in raw_value.items() if v}
    elif isinstance(raw_value, list):
        pairs = {str(v): str(v) for v in raw_value if v}
    else:
        return f"'selectors' must be an object, got {type(raw_value).__name__}."
    if not pairs:
        return "No selectors given."
    return dict(list(pairs.items())[:20])


def _url_list(raw_value: Any) -> list[str] | str:
    if isinstance(raw_value, str):
        try:
            raw_value = json.loads(raw_value)
        except json.JSONDecodeError:
            raw_value = [part for part in re.split(r"[\s,]+", raw_value) if part]
    if not isinstance(raw_value, list):
        return f"'urls' must be a list, got {type(raw_value).__name__}."
    clean = [str(u).strip() for u in raw_value if str(u).strip()]
    if not clean:
        return "No URLs given."
    if len(clean) > MAX_URLS:
        logger.info("batch_fetch: %d URLs trimmed to %d", len(clean), MAX_URLS)
    return clean[:MAX_URLS]


def _as_object(raw_value: Any) -> Any:
    if isinstance(raw_value, str):
        try:
            return json.loads(raw_value)
        except json.JSONDecodeError:
            return raw_value
    return raw_value


def _pattern(pattern: str | None) -> re.Pattern[str] | None:
    if not pattern:
        return None
    try:
        return re.compile(pattern, re.I)
    except re.error:
        return re.compile(re.escape(pattern), re.I)


def _path(data: Any, path: str) -> Any:
    current = data
    for part in re.findall(r"[^.\[\]]+|\[\d+\]", path):
        if part.startswith("["):
            index = int(part[1:-1])
            if not isinstance(current, list) or not -len(current) <= index < len(current):
                return f"__fehler__Path {path!r}: index {index} does not exist."
            current = current[index]
        else:
            if not isinstance(current, dict) or part not in current:
                available = ", ".join(list(current)[:15]) if isinstance(current, dict) else "-"
                return f"__fehler__Path {path!r}: {part!r} is missing. Available: {available}"
            current = current[part]
    return current


def _structure(value: Any, depth: int = 0, max_depth: int = 4) -> str:
    if isinstance(value, dict):
        if not value:
            return "{}"
        if depth >= max_depth:
            return f"{{...{len(value)} fields}}"
        fields = list(value.items())[:25]
        inner = ", ".join(f"{k}: {_structure(v, depth + 1, max_depth)}" for k, v in fields)
        if len(value) > 25:
            inner += f", ...{len(value) - 25} more"
        return "{" + inner + "}"
    if isinstance(value, list):
        if not value:
            return "[]"
        return f"[{len(value)} × {_structure(value[0], depth + 1, max_depth)}]"
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "bool"
    if isinstance(value, str):
        return "str"
    return type(value).__name__


def _unmark(text: str) -> str:
    text = re.sub(r"!?\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"^\s*```.*$", "", text, flags=re.M)
    text = re.sub(r"^#{1,6}\s*", "", text, flags=re.M)
    text = re.sub(r"^ *\|[\s\-|]+\|[^\S\n]*\n", "", text, flags=re.M)
    text = re.sub(r"[*_~`>]", "", text)
    text = re.sub(r"^ (?=\S)", "", text, flags=re.M)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def _excerpt(
    text: str, offset: int, max_chars: int, *, continuation: str | None = None
) -> str:
    cap = max(200, int(max_chars))
    total = len(text)
    start = max(0, min(int(offset), total))
    end = min(start + cap, total)

    parts = []
    if start:
        parts.append(f"[... {start} characters skipped before this]\n\n")
    parts.append(text[start:end])
    if end < total:
        hint = continuation or f"read on with offset={end}"
        parts.append(f"\n\n[... truncated at character {end} of {total} -- {hint}]")
    return "".join(parts)
