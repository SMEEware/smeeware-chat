from __future__ import annotations

import json
import re
from typing import Any

import httpx

from src.core.logging import get_logger
from src.services.tools.base import ToolError
from src.services.tools.local.base import LocalTool, truncate

logger = get_logger(__name__)

MAX_RESULTS = 20
YT_MAX = 16_000


class BraveSearchTool(LocalTool):
    name = "web_search"
    description = (
        "Searches the web with Brave Search. Use this for current events, "
        "news, prices, documentation -- anything that may have happened after "
        "your knowledge cutoff. Returns title, URL, and snippet per result."
    )
    parameters = {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "Search term"},
            "count": {
                "type": "integer",
                "description": "Number of results (1-20, default 5)",
            },
            "freshness": {
                "type": "string",
                "enum": ["pd", "pw", "pm", "py"],
                "description": "Only results from the last day/week/month/year",
            },
        },
        "required": ["query"],
    }

    ENDPOINT = "https://api.search.brave.com/res/v1/web/search"

    def __init__(self, client: httpx.AsyncClient, api_key: str) -> None:
        self._client = client
        self._api_key = api_key

    async def run(
        self,
        query: str,
        count: int = 5,
        freshness: str | None = None,
    ) -> str:
        params: dict[str, Any] = {
            "q": query,
            "count": max(1, min(int(count), MAX_RESULTS)),
        }
        if freshness:
            params["freshness"] = freshness

        response = await self._client.get(
            self.ENDPOINT,
            params=params,
            headers={
                "Accept": "application/json",
                "X-Subscription-Token": self._api_key,
            },
        )
        if response.status_code != 200:
            raise ToolError(f"Brave search failed (HTTP {response.status_code}).")

        results = (response.json().get("web") or {}).get("results") or []
        if not results:
            return f"No results for {query!r}."

        lines = [f"{len(results)} results for {query!r}:", ""]
        for index, hit in enumerate(results, start=1):
            lines.append(f"{index}. {hit.get('title', '(no title)')}")
            lines.append(f"   {hit.get('url', '')}")
            if description := _plain(hit.get("description")):
                lines.append(f"   {description}")
            if alter := hit.get("age"):
                lines.append(f"   ({alter})")
            lines.append("")
        return truncate("\n".join(lines), 6000)


class SerpApiSearchTool(LocalTool):
    name = "google_search"
    description = (
        "Searches Google via SerpAPI. Use this when you need Google's view: "
        "answer boxes, knowledge graph, news, or when web_search returns too "
        "little. engine=google_news for news."
    )
    parameters = {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "Search term"},
            "engine": {
                "type": "string",
                "enum": ["google", "google_news", "google_scholar"],
                "description": "Which Google search (default: google)",
            },
            "count": {"type": "integer", "description": "Number of results (default 5)"},
            "location": {
                "type": "string",
                "description": "Location for localized results, e.g. 'Berlin, Germany'",
            },
        },
        "required": ["query"],
    }

    ENDPOINT = "https://serpapi.com/search.json"

    def __init__(self, client: httpx.AsyncClient, api_key: str) -> None:
        self._client = client
        self._api_key = api_key

    async def run(
        self,
        query: str,
        engine: str = "google",
        count: int = 5,
        location: str | None = None,
    ) -> str:
        params: dict[str, Any] = {
            "q": query,
            "engine": engine,
            "num": max(1, min(int(count), MAX_RESULTS)),
            "api_key": self._api_key,
        }
        if location:
            params["location"] = location

        response = await self._client.get(self.ENDPOINT, params=params)
        if response.status_code != 200:
            raise ToolError(f"SerpAPI failed (HTTP {response.status_code}).")

        data = response.json()
        if error := data.get("error"):
            raise ToolError(f"SerpAPI: {error}")

        lines: list[str] = []

        if box := data.get("answer_box"):
            answer = box.get("answer") or box.get("snippet") or box.get("result")
            if answer:
                lines += [f"Answer box: {answer}", ""]
        if graph := data.get("knowledge_graph"):
            if description := graph.get("description"):
                lines += [f"Knowledge graph: {graph.get('title', '')} — {description}", ""]

        matched = data.get("organic_results") or data.get("news_results") or []
        for index, hit in enumerate(matched, start=1):
            lines.append(f"{index}. {hit.get('title', '(no title)')}")
            lines.append(f"   {hit.get('link', '')}")
            if excerpt := _plain(hit.get("snippet")):
                lines.append(f"   {excerpt}")
            if date := hit.get("date"):
                lines.append(f"   ({date})")
            lines.append("")

        if not lines:
            return f"No results for {query!r}."
        return truncate("\n".join(lines), 6000)


class _SerpApiTool(LocalTool):
    ENDPOINT = "https://serpapi.com/search.json"

    def __init__(self, client: httpx.AsyncClient, api_key: str) -> None:
        self._client = client
        self._api_key = api_key

    async def _get(self, **params: Any) -> dict[str, Any] | str:
        params["api_key"] = self._api_key
        try:
            response = await self._client.get(self.ENDPOINT, params=params)
        except httpx.HTTPError as exc:
            raise ToolError(f"SerpAPI unreachable: {type(exc).__name__}: {exc}") from exc
        try:
            data = response.json()
        except ValueError:
            raise ToolError(f"SerpAPI failed (HTTP {response.status_code}).") from None
        if error := data.get("error"):
            raise ToolError(f"SerpAPI: {error}")
        if response.status_code != 200:
            raise ToolError(f"SerpAPI failed (HTTP {response.status_code}).")
        return data


class SocialProfileTool(_SerpApiTool):
    name = "social_profile"
    description = (
        "Looks up a public profile on Instagram or Facebook -- name, follower "
        "count, category, bio, and linked pages. Give the username (the part "
        "after the last / of a profile URL, e.g. 'nike' for instagram.com/"
        "nike). For people and brands the user wants to know about."
    )
    parameters = {
        "type": "object",
        "properties": {
            "platform": {
                "type": "string",
                "enum": ["instagram", "facebook"],
                "description": "Which network",
            },
            "profile_id": {
                "type": "string",
                "description": "Username/handle, without @ and without URL remainder",
            },
        },
        "required": ["platform", "profile_id"],
    }

    async def run(self, platform: str, profile_id: str) -> str:
        if platform not in ("instagram", "facebook"):
            return "platform must be 'instagram' or 'facebook'."
        handle = _handle(profile_id)
        if not handle:
            return "No profile name given."

        data = await self._get(engine=f"{platform}_profile", profile_id=handle)
        if isinstance(data, str):
            raise ToolError(data)

        profile = data.get("profile_results")
        if not isinstance(profile, dict) or not profile:
            return f"No {platform} profile {handle!r} found."
        return _profile_text(platform, handle, profile)


class AmazonSearchTool(_SerpApiTool):
    name = "amazon_search"
    description = (
        "Searches Amazon for products and returns title, price, rating, review "
        "count, and link. Use this for prices, availability, and product "
        "comparisons -- not the web search."
    )
    parameters = {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "Search term/product"},
            "domain": {
                "type": "string",
                "description": (
                    "Amazon domain, e.g. 'amazon.de' or 'amazon.com' "
                    "(default amazon.de)"
                ),
            },
            "count": {"type": "integer", "description": "Number of results (default 8)"},
        },
        "required": ["query"],
    }

    async def run(
        self, query: str, domain: str = "amazon.de", count: int = 8
    ) -> str:
        data = await self._get(engine="amazon", k=query, amazon_domain=domain)
        if isinstance(data, str):
            raise ToolError(data)

        matched = data.get("organic_results") or []
        if not matched:
            return f"No Amazon results for {query!r} on {domain}."

        limit = max(1, min(int(count), MAX_RESULTS))
        lines = [f"{len(matched)} results for {query!r} ({domain}):", ""]
        for index, hit in enumerate(matched[:limit], start=1):
            lines.append(f"{index}. {hit.get('title', '(no title)')}")
            parts = []
            if price := hit.get("price"):
                parts.append(str(price))
            if (note := hit.get("rating")) is not None:
                ratings = hit.get("reviews")
                parts.append(f"{note}★" + (f" ({ratings} reviews)" if ratings else ""))
            if parts:
                lines.append(f"   {' — '.join(parts)}")
            if link := (hit.get("link_clean") or hit.get("link")):
                lines.append(f"   {link}")
            lines.append("")
        return truncate("\n".join(lines), 6000)


class MapsSearchTool(_SerpApiTool):
    name = "maps_search"
    description = (
        "Searches places via Google Maps -- shops, restaurants, service "
        "providers. Returns name, rating, address, phone, website, and open "
        "status. For 'near me', use get_context first and pass the coordinates "
        "as 'location', otherwise Google guesses the region."
    )
    parameters = {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "What to search for"},
            "location": {
                "type": "string",
                "description": (
                    "GPS as '@LAT,LON,ZOOMz', e.g. '@52.52,13.405,14z'. "
                    "Alternatively write the place into the search."
                ),
            },
            "count": {"type": "integer", "description": "Number of results (default 8)"},
        },
        "required": ["query"],
    }

    async def run(
        self, query: str, location: str | None = None, count: int = 8
    ) -> str:
        params: dict[str, Any] = {"engine": "google_maps", "q": query}
        if location:
            coordinates = _as_coordinates(location)
            if coordinates:
                params["ll"] = coordinates
            else:
                params["q"] = f"{query} {location.strip()}"

        data = await self._get(**params)
        if isinstance(data, str):
            raise ToolError(data)

        matched = data.get("local_results") or []
        if not matched:
            return f"No places for {query!r}."

        limit = max(1, min(int(count), MAX_RESULTS))
        lines = [f"{len(matched)} place(s) for {query!r}:", ""]
        for index, place in enumerate(matched[:limit], start=1):
            lines.append(f"{index}. {place.get('title', '(no name)')}")
            head = []
            if (note := place.get("rating")) is not None:
                ratings = place.get("reviews")
                head.append(f"{note}★" + (f" ({ratings})" if ratings else ""))
            if kind := place.get("type"):
                head.append(str(kind))
            if price := place.get("price"):
                head.append(str(price))
            if head:
                lines.append(f"   {' · '.join(head)}")
            if address := place.get("address"):
                lines.append(f"   {address}")
            if status := place.get("open_state"):
                lines.append(f"   {status}")
            contact = [str(x) for x in (place.get("phone"), place.get("website")) if x]
            if contact:
                lines.append(f"   {' — '.join(contact)}")
            lines.append("")
        return truncate("\n".join(lines), 6000)


class YoutubeSearchTool(_SerpApiTool):
    name = "youtube_search"
    description = (
        "Searches YouTube for videos and returns title, channel, length, "
        "views, age, and link -- plus the video ID, which you use with "
        "youtube_transcript to get the spoken word. Use this for videos, "
        "tutorials, talks instead of the web search."
    )
    parameters = {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "Search term"},
            "count": {"type": "integer", "description": "Number of results (default 8)"},
        },
        "required": ["query"],
    }

    async def run(self, query: str, count: int = 8) -> str:
        data = await self._get(engine="youtube", search_query=query)
        if isinstance(data, str):
            raise ToolError(data)

        matched = data.get("video_results") or []
        if not matched:
            return f"No videos for {query!r}."

        limit = max(1, min(int(count), MAX_RESULTS))
        lines = [f"{len(matched)} video(s) for {query!r}:", ""]
        for index, video in enumerate(matched[:limit], start=1):
            lines.append(f"{index}. {video.get('title', '(no title)')}")
            head = []
            if channel := (video.get("channel") or {}).get("name"):
                head.append(channel + (" ✓" if (video.get("channel") or {}).get("verified") else ""))
            if longitude := video.get("length"):
                head.append(str(longitude))
            elif video.get("live"):
                head.append("LIVE")
            if (calls := video.get("views")) is not None:
                head.append(f"{_compact(calls)} views")
            if alter := video.get("published_date"):
                head.append(str(alter))
            if head:
                lines.append(f"   {' · '.join(head)}")
            if vid := video.get("video_id"):
                lines.append(f"   {video.get('link', '')}  (ID: {vid})")
            elif link := video.get("link"):
                lines.append(f"   {link}")
            lines.append("")
        lines.append("Transcript for a video: youtube_transcript with the ID.")
        return truncate("\n".join(lines), 6000)


class YoutubeTranscriptTool(_SerpApiTool):
    name = "youtube_transcript"
    description = (
        "Fetches the transcript (the spoken word) of a YouTube video, with "
        "chapters and timestamps. This lets you read a video without watching "
        "it: summarize talks, find a statement, pull code from a tutorial. "
        "Give the video ID or the full YouTube URL."
    )
    parameters = {
        "type": "object",
        "properties": {
            "video": {
                "type": "string",
                "description": "Video ID or YouTube URL",
            },
            "language": {
                "type": "string",
                "description": (
                    "Language code like 'de' or 'en'. If the language is "
                    "missing, the API takes the first available one."
                ),
            },
            "max_chars": {
                "type": "integer",
                "description": f"Upper limit on text length (default {YT_MAX})",
            },
        },
        "required": ["video"],
    }

    async def run(
        self,
        video: str,
        language: str | None = None,
        max_chars: int = 0,
    ) -> str:
        vid = _video_id(video)
        if not vid:
            return f"{video!r} contains no recognizable YouTube video ID."

        params: dict[str, Any] = {"engine": "youtube_video_transcript", "v": vid}
        if language:
            params["language_code"] = language
        data = await self._get(**params)
        if isinstance(data, str):
            raise ToolError(data)

        snippets = data.get("transcript") or []
        if not snippets:
            available = _languages(data.get("available_transcripts"))
            notification = f" Available languages: {available}." if available else ""
            return f"No transcript for video {vid}.{notification}"

        limit = max(500, int(max_chars) if max_chars else YT_MAX)
        head = [f"Transcript for https://youtu.be/{vid}"]
        if available := _languages(data.get("available_transcripts")):
            head.append(f"Languages: {available}")
        if chapters := data.get("chapters"):
            head.append("")
            head.append("Chapters:")
            head += [
                f"- {_ms(k.get('start_ms'))} {k.get('chapter', '')}" for k in chapters
            ]

        text = _transcript_text(snippets)
        return f"{chr(10).join(head)}\n\n{truncate(text, limit)}"


class ImageSearchTool(LocalTool):
    name = "image_search"
    description = (
        "Searches images via Brave and returns title, source page, and the "
        "direct image URL per result. Use this instead of web_search when you "
        "need an image: to view it with analyze_image, put it in your storage "
        "with storage_put, or place it as ![...](URL) in the answer. Pass on "
        "the direct image URL (not the source page)."
    )
    parameters = {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "What kind of image to search for"},
            "count": {
                "type": "integer",
                "description": "Number of results (1-50, default 8)",
            },
            "safesearch": {
                "type": "string",
                "enum": ["off", "strict"],
                "description": "Adult filter (default strict)",
            },
        },
        "required": ["query"],
    }

    ENDPOINT = "https://api.search.brave.com/res/v1/images/search"
    MAX = 50

    def __init__(self, client: httpx.AsyncClient, api_key: str) -> None:
        self._client = client
        self._api_key = api_key

    async def run(
        self,
        query: str,
        count: int = 8,
        safesearch: str = "strict",
    ) -> str:
        params: dict[str, Any] = {
            "q": query,
            "count": max(1, min(int(count), self.MAX)),
            "safesearch": safesearch if safesearch in ("off", "strict") else "strict",
        }
        response = await self._client.get(
            self.ENDPOINT,
            params=params,
            headers={
                "Accept": "application/json",
                "X-Subscription-Token": self._api_key,
            },
        )
        if response.status_code != 200:
            raise ToolError(_brave_error("Image search", response))

        results = response.json().get("results") or []
        if not results:
            return f"No images for {query!r}."

        lines = [f"{len(results)} image(s) for {query!r}:", ""]
        for index, hit in enumerate(results, start=1):
            image_url = _image_url(hit)
            lines.append(f"{index}. {hit.get('title') or '(no title)'}")
            if image_url:
                lines.append(f"   Image: {image_url}")
            if source := hit.get("url"):
                lines.append(f"   Source: {source}")
            if dimensions := _dimensions(hit):
                lines.append(f"   {dimensions}")
            lines.append("")
        return truncate("\n".join(lines), 6000)


class VideoSearchTool(LocalTool):
    name = "video_search"
    description = (
        "Searches videos via Brave and returns title, page URL, duration, and "
        "a thumbnail per result. Use this instead of web_search when the "
        "answer is a video. "
        "ALWAYS show a result as [![Title](THUMBNAIL)](PAGE_URL), whatever the "
        "site. The frontend plays YouTube, Vimeo, Dailymotion, Twitch VODs, "
        "TikTok, Streamable and Bilibili right in the chat; every other site "
        "becomes a video card with the thumbnail that opens in a new tab. "
        "Both come out of the same notation, so you never have to guess which "
        "sites can be embedded. "
        "Do not place a video URL as ![...](URL) -- that is the notation for "
        "images, and it makes a video look like a still."
    )
    parameters = {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "What kind of video to search for",
            },
            "count": {
                "type": "integer",
                "description": "Number of results (1-50, default 8)",
            },
            "freshness": {
                "type": "string",
                "description": (
                    "Optional age filter: pd (24h), pw (7d), pm (31d), "
                    "py (365d), or YYYY-MM-DDtoYYYY-MM-DD."
                ),
            },
            "safesearch": {
                "type": "string",
                "enum": ["off", "moderate", "strict"],
                "description": "Adult filter (default moderate)",
            },
        },
        "required": ["query"],
    }

    ENDPOINT = "https://api.search.brave.com/res/v1/videos/search"
    MAX = 50

    def __init__(self, client: httpx.AsyncClient, api_key: str) -> None:
        self._client = client
        self._api_key = api_key

    async def run(
        self,
        query: str,
        count: int = 8,
        freshness: str | None = None,
        safesearch: str = "moderate",
    ) -> str:
        params: dict[str, Any] = {
            "q": query,
            "count": max(1, min(int(count), self.MAX)),
            "safesearch": (
                safesearch
                if safesearch in ("off", "moderate", "strict")
                else "moderate"
            ),
        }
        if freshness:
            params["freshness"] = freshness

        response = await self._client.get(
            self.ENDPOINT,
            params=params,
            headers={
                "Accept": "application/json",
                "X-Subscription-Token": self._api_key,
            },
        )
        if response.status_code != 200:
            raise ToolError(_brave_error("Video search", response))

        results = response.json().get("results") or []
        if not results:
            return f"No videos for {query!r}."

        lines = [f"{len(results)} video(s) for {query!r}:", ""]
        for index, hit in enumerate(results, start=1):
            video = hit.get("video") or {}
            thumb = (hit.get("thumbnail") or {}).get("src")

            lines.append(f"{index}. {hit.get('title') or '(no title)'}")
            if page := hit.get("url"):
                lines.append(f"   Page: {page}")
            if thumb:
                lines.append(f"   Thumbnail: {thumb}")

            parts = [
                str(video.get(field))
                for field in ("duration", "creator", "publisher")
                if video.get(field)
            ]
            if alter := hit.get("age"):
                parts.append(str(alter))
            if parts:
                lines.append(f"   {' | '.join(parts)}")
            lines.append("")

        return truncate("\n".join(lines), 6000)


class BraveAnswersTool(LocalTool):
    name = "brave_answers"
    description = (
        "Asks Brave's AI answer and gets a short, source-backed answer in one "
        "call. Use this only for quick factual questions ('Who...', "
        "'When...', 'How high...') where a single sourced answer is enough. "
        "For anything that needs depth, multiple pages, or your own judgment, "
        "use web_search and fetch_page. The wording returned is raw material "
        "-- restate it in your own words and cite the sources."
    )
    parameters = {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "The question"},
        },
        "required": ["query"],
    }

    ENDPOINT = "https://api.search.brave.com/res/v1/chat/completions"

    def __init__(self, client: httpx.AsyncClient, api_key: str) -> None:
        self._client = client
        self._api_key = api_key

    async def run(self, query: str) -> str:
        try:
            raw = await self._collect(query)
        except httpx.HTTPStatusError as exc:
            raise ToolError(_brave_error("Brave Answers", exc.response)) from exc
        except httpx.HTTPError as exc:
            raise ToolError(
                f"Brave Answers unreachable: {type(exc).__name__}: {exc}"
            ) from exc

        answer, sources = _resolve_citations(raw)
        if not answer:
            raise ToolError(f"Brave Answers returned nothing for {query!r}.")

        parts = [answer]
        if sources:
            parts += ["", "Sources:"]
            parts += [f"[{number}] {url}" for number, url in sources]
        return truncate("\n".join(parts), 6000)

    async def _collect(self, query: str) -> str:
        chunks: list[str] = []
        async with self._client.stream(
            "POST",
            self.ENDPOINT,
            json={
                "model": "brave-pro",
                "stream": True,
                "enable_citations": True,
                "messages": [{"role": "user", "content": query}],
            },
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
                "X-Subscription-Token": self._api_key,
            },
        ) as response:
            response.raise_for_status()
            async for row in response.aiter_lines():
                if not row.startswith("data:"):
                    continue
                payload = row[5:].strip()
                if payload in ("", "[DONE]"):
                    continue
                try:
                    delta = (json.loads(payload).get("choices") or [{}])[0].get("delta") or {}
                except json.JSONDecodeError:
                    continue
                if content := delta.get("content"):
                    chunks.append(content)
        return "".join(chunks)


def _image_url(hit: dict[str, Any]) -> str:
    properties = hit.get("properties") or {}
    return properties.get("url") or (hit.get("thumbnail") or {}).get("src") or ""


def _dimensions(hit: dict[str, Any]) -> str:
    properties = hit.get("properties") or {}
    latitude, height = properties.get("width"), properties.get("height")
    if latitude and height:
        return f"{latitude}x{height}"
    return ""


_CITATION = re.compile(r"<citation>(.*?)</citation>", re.S)
_USAGE = re.compile(r"<usage>.*?</usage>", re.S)


def _resolve_citations(text: str) -> tuple[str, list[tuple[int, str]]]:
    number_by_url: dict[str, int] = {}

    def replace(matched: "re.Match[str]") -> str:
        try:
            url = str(json.loads(matched.group(1)).get("url") or "").strip()
        except json.JSONDecodeError:
            return ""
        if not url:
            return ""
        number = number_by_url.setdefault(url, len(number_by_url) + 1)
        return f"[{number}]"

    without_citations = _CITATION.sub(replace, text)
    without_citations = _USAGE.sub("", without_citations)
    without_citations = re.sub(r"(\[\d+\])(?=\1)", "", without_citations)
    without_citations = re.sub(r"\s+([.,;:!?])", r"\1", without_citations)
    without_citations = re.sub(r"\n{3,}", "\n\n", without_citations).strip()

    items = [(number, url) for url, number in number_by_url.items()][:12]
    return without_citations, items


def _brave_error(action: str, response: httpx.Response) -> str:
    notification = ""
    try:
        error = (response.json().get("error") or {})
        notification = str(error.get("detail") or error.get("meta") or "").strip()
    except ValueError:
        pass
    if response.status_code == 422:
        notification = notification or "The key probably does not cover this product."
    elif response.status_code == 429:
        notification = notification or "Quota exhausted."
    return f"{action} failed (HTTP {response.status_code}). {notification}".strip()


_VIDEO_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")


def _video_id(video: str) -> str | None:
    text = (video or "").strip()
    if _VIDEO_ID.match(text):
        return text
    matched = re.search(
        r"(?:v=|/shorts/|/embed/|/live/|youtu\.be/)([A-Za-z0-9_-]{11})", text
    )
    return matched.group(1) if matched else None


def _compact(number: object) -> str:
    try:
        n = int(number)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return str(number)
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M".replace(".0M", "M")
    if n >= 1_000:
        return f"{n / 1_000:.1f}K".replace(".0K", "K")
    return str(n)


def _ms(ms: object) -> str:
    try:
        total = int(ms) // 1000  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return "0:00"
    hours, rest = divmod(total, 3600)
    minutes, seconds = divmod(rest, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{seconds:02d}"
    return f"{minutes}:{seconds:02d}"


def _languages(available: object) -> str:
    if not isinstance(available, list):
        return ""
    names: list[str] = []
    for entry in available:
        if not isinstance(entry, dict):
            continue
        code = entry.get("language_code") or entry.get("language_name")
        if code and code not in names:
            names.append(str(code))
    return ", ".join(names[:10])


def _transcript_text(snippets: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    last_marker = -30_000
    for snippet in snippets:
        text = str(snippet.get("snippet") or "").strip()
        if not text:
            continue
        start = snippet.get("start_ms")
        if isinstance(start, int) and start - last_marker >= 30_000:
            lines.append(f"\n[{_ms(start)}]")
            last_marker = start
        lines.append(text)
    return re.sub(r"\n{3,}", "\n\n", " ".join(lines)).strip()


_COORDS = re.compile(r"^-?\d{1,3}\.\d+,\s*-?\d{1,3}\.\d+(?:,\s*\d+z?)?$")


def _as_coordinates(location: str) -> str | None:
    text = location.strip().lstrip("@").replace(" ", "")
    if not _COORDS.match(text):
        return None
    if not text.rstrip("z").split(",")[-1].isdigit() or text.count(",") < 2:
        text = f"{text},14z"
    return f"@{text}"


def _handle(profile_id: str) -> str:
    text = (profile_id or "").strip().strip("@").rstrip("/")
    if "/" in text:
        text = text.rsplit("/", 1)[-1]
    return text.split("?")[0].strip()


_PROFILE_FIELDS = {
    "instagram": [
        ("full_name", "Name"),
        ("followers", "Followers"),
        ("following", "Following"),
        ("category_name", "Category"),
        ("biography", "Bio"),
    ],
    "facebook": [
        ("name", "Name"),
        ("followers", "Followers"),
        ("category", "Category"),
        ("profile_intro_text", "Intro"),
        ("phone", "Phone"),
        ("email", "Email"),
        ("business_hours", "Hours"),
    ],
}
_PROFILE_URL = {
    "instagram": "https://www.instagram.com/{}",
    "facebook": "https://www.facebook.com/{}",
}


def _profile_text(platform: str, handle: str, profile: dict[str, Any]) -> str:
    lines = [f"{platform.capitalize()} profile: {_PROFILE_URL[platform].format(handle)}"]
    if profile.get("is_verified"):
        lines[0] += "  ✓ verified"
    if profile.get("is_private"):
        lines[0] += "  🔒 private"

    for key, label in _PROFILE_FIELDS[platform]:
        value = profile.get(key)
        if value in (None, "", []):
            continue
        lines.append(f"{label}: {str(value).strip()}")

    links: list[str] = []
    for entry in (profile.get("bio_links") or profile.get("links") or []):
        if isinstance(entry, dict) and (url := entry.get("url") or entry.get("link")):
            title = entry.get("title")
            links.append(f"{title}: {url}" if title else str(url))
    if links:
        lines.append("Links:")
        lines += [f"- {v}" for v in links[:8]]

    return truncate("\n".join(lines), 4000)


def _plain(value: str | None) -> str:
    if not value:
        return ""
    return (
        value.replace("<strong>", "").replace("</strong>", "").replace("&#x27;", "'")
    )
