"""Suche ueber Brave und SerpAPI.

Vier Werkzeuge, alle am selben httpx-Client:

    web_search      Brave-Websuche (Titel, URL, Auszug)
    google_search   SerpAPI (Antwortbox, Wissensgraph, News)
    image_search    Brave-Bildersuche -- liefert direkte Bild-URLs, die das
                    Modell an analyze_image oder storage_put weiterreichen kann
    brave_answers   Brave-KI-Antwort mit Quellen -- fuer schnelle Faktenfragen,
                    wenn keine eigene Recherche ueber mehrere Seiten noetig ist

image_search teilt sich den BRAVE_API_KEY mit web_search; brave_answers braucht
einen eigenen Schluessel (anderes Abo).

Dazu drei weitere SerpApi-Engines am selben SERPAPI_API_KEY:

    social_profile      Instagram-/Facebook-Profile nachschlagen
    amazon_search       Produkte auf Amazon
    maps_search         Orte ueber Google Maps
    youtube_search      Videos auf YouTube
    youtube_transcript  das gesprochene Wort eines Videos
"""

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
            if beschreibung := _plain(hit.get("description")):
                lines.append(f"   {beschreibung}")
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
        if fehler := data.get("error"):
            raise ToolError(f"SerpAPI: {fehler}")

        lines: list[str] = []

        if box := data.get("answer_box"):
            antwort = box.get("answer") or box.get("snippet") or box.get("result")
            if antwort:
                lines += [f"Answer box: {antwort}", ""]
        if graph := data.get("knowledge_graph"):
            if beschreibung := graph.get("description"):
                lines += [f"Knowledge graph: {graph.get('title', '')} — {beschreibung}", ""]

        treffer = data.get("organic_results") or data.get("news_results") or []
        for index, hit in enumerate(treffer, start=1):
            lines.append(f"{index}. {hit.get('title', '(no title)')}")
            lines.append(f"   {hit.get('link', '')}")
            if auszug := _plain(hit.get("snippet")):
                lines.append(f"   {auszug}")
            if datum := hit.get("date"):
                lines.append(f"   ({datum})")
            lines.append("")

        if not lines:
            return f"No results for {query!r}."
        return truncate("\n".join(lines), 6000)


class _SerpApiTool(LocalTool):
    """Basis fuer die uebrigen SerpApi-Engines -- ein Aufruf, ein Fehlerpfad.

    Jede Engine hat eigene Parameter und ein eigenes Ergebnisfeld; gemeinsam
    ist nur der Endpunkt, der Schluessel und wie SerpApi Fehler meldet.
    """

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
        if fehler := data.get("error"):
            raise ToolError(f"SerpAPI: {fehler}")
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

        daten = await self._get(engine=f"{platform}_profile", profile_id=handle)
        if isinstance(daten, str):
            raise ToolError(daten)

        profil = daten.get("profile_results")
        if not isinstance(profil, dict) or not profil:
            return f"No {platform} profile {handle!r} found."
        return _profil_text(platform, handle, profil)


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
        daten = await self._get(engine="amazon", k=query, amazon_domain=domain)
        if isinstance(daten, str):
            raise ToolError(daten)

        treffer = daten.get("organic_results") or []
        if not treffer:
            return f"No Amazon results for {query!r} on {domain}."

        grenze = max(1, min(int(count), MAX_RESULTS))
        lines = [f"{len(treffer)} results for {query!r} ({domain}):", ""]
        for index, hit in enumerate(treffer[:grenze], start=1):
            lines.append(f"{index}. {hit.get('title', '(no title)')}")
            teile = []
            if preis := hit.get("price"):
                teile.append(str(preis))
            if (note := hit.get("rating")) is not None:
                bewertungen = hit.get("reviews")
                teile.append(f"{note}★" + (f" ({bewertungen} reviews)" if bewertungen else ""))
            if teile:
                lines.append(f"   {' — '.join(teile)}")
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
            koordinaten = _als_koordinaten(location)
            if koordinaten:
                params["ll"] = koordinaten
            else:
                params["q"] = f"{query} {location.strip()}"

        daten = await self._get(**params)
        if isinstance(daten, str):
            raise ToolError(daten)

        treffer = daten.get("local_results") or []
        if not treffer:
            return f"No places for {query!r}."

        grenze = max(1, min(int(count), MAX_RESULTS))
        lines = [f"{len(treffer)} place(s) for {query!r}:", ""]
        for index, ort in enumerate(treffer[:grenze], start=1):
            lines.append(f"{index}. {ort.get('title', '(no name)')}")
            kopf = []
            if (note := ort.get("rating")) is not None:
                bewertungen = ort.get("reviews")
                kopf.append(f"{note}★" + (f" ({bewertungen})" if bewertungen else ""))
            if typ := ort.get("type"):
                kopf.append(str(typ))
            if preis := ort.get("price"):
                kopf.append(str(preis))
            if kopf:
                lines.append(f"   {' · '.join(kopf)}")
            if adresse := ort.get("address"):
                lines.append(f"   {adresse}")
            if status := ort.get("open_state"):
                lines.append(f"   {status}")
            kontakt = [str(x) for x in (ort.get("phone"), ort.get("website")) if x]
            if kontakt:
                lines.append(f"   {' — '.join(kontakt)}")
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
        daten = await self._get(engine="youtube", search_query=query)
        if isinstance(daten, str):
            raise ToolError(daten)

        treffer = daten.get("video_results") or []
        if not treffer:
            return f"No videos for {query!r}."

        grenze = max(1, min(int(count), MAX_RESULTS))
        lines = [f"{len(treffer)} video(s) for {query!r}:", ""]
        for index, video in enumerate(treffer[:grenze], start=1):
            lines.append(f"{index}. {video.get('title', '(no title)')}")
            kopf = []
            if kanal := (video.get("channel") or {}).get("name"):
                kopf.append(kanal + (" ✓" if (video.get("channel") or {}).get("verified") else ""))
            if laenge := video.get("length"):
                kopf.append(str(laenge))
            elif video.get("live"):
                kopf.append("LIVE")
            if (aufrufe := video.get("views")) is not None:
                kopf.append(f"{_kompakt(aufrufe)} views")
            if alter := video.get("published_date"):
                kopf.append(str(alter))
            if kopf:
                lines.append(f"   {' · '.join(kopf)}")
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
        daten = await self._get(**params)
        if isinstance(daten, str):
            raise ToolError(daten)

        snippets = daten.get("transcript") or []
        if not snippets:
            verfuegbar = _sprachen(daten.get("available_transcripts"))
            hinweis = f" Available languages: {verfuegbar}." if verfuegbar else ""
            return f"No transcript for video {vid}.{hinweis}"

        grenze = max(500, int(max_chars) if max_chars else YT_MAX)
        kopf = [f"Transcript for https://youtu.be/{vid}"]
        if verfuegbar := _sprachen(daten.get("available_transcripts")):
            kopf.append(f"Languages: {verfuegbar}")
        if kapitel := daten.get("chapters"):
            kopf.append("")
            kopf.append("Chapters:")
            kopf += [
                f"- {_ms(k.get('start_ms'))} {k.get('chapter', '')}" for k in kapitel
            ]

        text = _transkript_text(snippets)
        return f"{chr(10).join(kopf)}\n\n{truncate(text, grenze)}"


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
            raise ToolError(_brave_fehler("Image search", response))

        results = response.json().get("results") or []
        if not results:
            return f"No images for {query!r}."

        lines = [f"{len(results)} image(s) for {query!r}:", ""]
        for index, hit in enumerate(results, start=1):
            bild_url = _bild_url(hit)
            lines.append(f"{index}. {hit.get('title') or '(no title)'}")
            if bild_url:
                lines.append(f"   Image: {bild_url}")
            if quelle := hit.get("url"):
                lines.append(f"   Source: {quelle}")
            if masse := _masse(hit):
                lines.append(f"   {masse}")
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
            raise ToolError(_brave_fehler("Video search", response))

        results = response.json().get("results") or []
        if not results:
            return f"No videos for {query!r}."

        lines = [f"{len(results)} video(s) for {query!r}:", ""]
        for index, hit in enumerate(results, start=1):
            video = hit.get("video") or {}
            thumb = (hit.get("thumbnail") or {}).get("src")

            lines.append(f"{index}. {hit.get('title') or '(no title)'}")
            if seite := hit.get("url"):
                lines.append(f"   Page: {seite}")
            if thumb:
                lines.append(f"   Thumbnail: {thumb}")

            teile = [
                str(video.get(feld))
                for feld in ("duration", "creator", "publisher")
                if video.get(feld)
            ]
            if alter := hit.get("age"):
                teile.append(str(alter))
            if teile:
                lines.append(f"   {' | '.join(teile)}")
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
            roh = await self._sammeln(query)
        except httpx.HTTPStatusError as exc:
            raise ToolError(_brave_fehler("Brave Answers", exc.response)) from exc
        except httpx.HTTPError as exc:
            raise ToolError(
                f"Brave Answers unreachable: {type(exc).__name__}: {exc}"
            ) from exc

        antwort, quellen = _zitate_aufloesen(roh)
        if not antwort:
            raise ToolError(f"Brave Answers returned nothing for {query!r}.")

        teile = [antwort]
        if quellen:
            teile += ["", "Sources:"]
            teile += [f"[{nummer}] {url}" for nummer, url in quellen]
        return truncate("\n".join(teile), 6000)

    async def _sammeln(self, query: str) -> str:
        stuecke: list[str] = []
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
            async for zeile in response.aiter_lines():
                if not zeile.startswith("data:"):
                    continue
                nutzlast = zeile[5:].strip()
                if nutzlast in ("", "[DONE]"):
                    continue
                try:
                    delta = (json.loads(nutzlast).get("choices") or [{}])[0].get("delta") or {}
                except json.JSONDecodeError:
                    continue
                if inhalt := delta.get("content"):
                    stuecke.append(inhalt)
        return "".join(stuecke)


def _bild_url(hit: dict[str, Any]) -> str:
    """Die direkte Bild-URL -- das, was analyze_image und storage_put brauchen.

    Brave legt sie unter properties.url ab; thumbnail.src ist nur der Vorschau-
    schnipsel. Fallback auf das Thumbnail, falls die volle URL mal fehlt.
    """
    properties = hit.get("properties") or {}
    return properties.get("url") or (hit.get("thumbnail") or {}).get("src") or ""


def _masse(hit: dict[str, Any]) -> str:
    properties = hit.get("properties") or {}
    breite, hoehe = properties.get("width"), properties.get("height")
    if breite and hoehe:
        return f"{breite}x{hoehe}"
    return ""


_CITATION = re.compile(r"<citation>(.*?)</citation>", re.S)
_USAGE = re.compile(r"<usage>.*?</usage>", re.S)


def _zitate_aufloesen(text: str) -> tuple[str, list[tuple[int, str]]]:
    """Zerlegt Braves Antwort in sauberen Text und eine nummerierte Quellenliste.

    Braves eigene Nummerierung zeigt oft mehrere Nummern auf dieselbe URL und
    haeuft ganze Trauben von Marken hinter einem Satz. Wir nummerieren deshalb
    neu: pro URL genau eine Nummer, in der Reihenfolge des ersten Auftretens.
    Dadurch fallen Dubletten weg und die Traube ``[1][1][2]`` schrumpft.
    """
    nummer_je_url: dict[str, int] = {}

    def ersetzen(treffer: "re.Match[str]") -> str:
        try:
            url = str(json.loads(treffer.group(1)).get("url") or "").strip()
        except json.JSONDecodeError:
            return ""
        if not url:
            return ""
        nummer = nummer_je_url.setdefault(url, len(nummer_je_url) + 1)
        return f"[{nummer}]"

    ohne = _CITATION.sub(ersetzen, text)
    ohne = _USAGE.sub("", ohne)
    ohne = re.sub(r"(\[\d+\])(?=\1)", "", ohne)
    ohne = re.sub(r"\s+([.,;:!?])", r"\1", ohne)
    ohne = re.sub(r"\n{3,}", "\n\n", ohne).strip()

    liste = [(nummer, url) for url, nummer in nummer_je_url.items()][:12]
    return ohne, liste


def _brave_fehler(was: str, response: httpx.Response) -> str:
    """Braves Fehlerantworten tragen oft eine brauchbare Meldung -- durchreichen."""
    hinweis = ""
    try:
        fehler = (response.json().get("error") or {})
        hinweis = str(fehler.get("detail") or fehler.get("meta") or "").strip()
    except ValueError:
        pass
    if response.status_code == 422:
        hinweis = hinweis or "The key probably does not cover this product."
    elif response.status_code == 429:
        hinweis = hinweis or "Quota exhausted."
    return f"{was} failed (HTTP {response.status_code}). {hinweis}".strip()


_VIDEO_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")


def _video_id(video: str) -> str | None:
    """Zieht die 11-stellige Video-ID aus ID oder beliebiger YouTube-URL."""
    text = (video or "").strip()
    if _VIDEO_ID.match(text):
        return text
    treffer = re.search(
        r"(?:v=|/shorts/|/embed/|/live/|youtu\.be/)([A-Za-z0-9_-]{11})", text
    )
    return treffer.group(1) if treffer else None


def _kompakt(zahl: object) -> str:
    """1597913 -> '1.6M'. Nicht-Zahlen unveraendert zurueck."""
    try:
        n = int(zahl)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return str(zahl)
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M".replace(".0M", "M")
    if n >= 1_000:
        return f"{n / 1_000:.1f}K".replace(".0K", "K")
    return str(n)


def _ms(ms: object) -> str:
    """Millisekunden -> 'M:SS' bzw. 'H:MM:SS' fuer die Kapitelmarken."""
    try:
        total = int(ms) // 1000  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return "0:00"
    stunden, rest = divmod(total, 3600)
    minuten, sekunden = divmod(rest, 60)
    if stunden:
        return f"{stunden}:{minuten:02d}:{sekunden:02d}"
    return f"{minuten}:{sekunden:02d}"


def _sprachen(available: object) -> str:
    if not isinstance(available, list):
        return ""
    namen: list[str] = []
    for eintrag in available:
        if not isinstance(eintrag, dict):
            continue
        code = eintrag.get("language_code") or eintrag.get("language_name")
        if code and code not in namen:
            namen.append(str(code))
    return ", ".join(namen[:10])


def _transkript_text(snippets: list[dict[str, Any]]) -> str:
    """Snippets zu Fliesstext mit sparsamen Zeitmarken (alle ~30s eine)."""
    zeilen: list[str] = []
    letzte_marke = -30_000
    for snippet in snippets:
        text = str(snippet.get("snippet") or "").strip()
        if not text:
            continue
        start = snippet.get("start_ms")
        if isinstance(start, int) and start - letzte_marke >= 30_000:
            zeilen.append(f"\n[{_ms(start)}]")
            letzte_marke = start
        zeilen.append(text)
    return re.sub(r"\n{3,}", "\n\n", " ".join(zeilen)).strip()


_KOORD = re.compile(r"^-?\d{1,3}\.\d+,\s*-?\d{1,3}\.\d+(?:,\s*\d+z?)?$")


def _als_koordinaten(location: str) -> str | None:
    """Erkennt '@52.52,13.405,14z' bzw. '52.52,13.405' -- alles andere ist Text."""
    text = location.strip().lstrip("@").replace(" ", "")
    if not _KOORD.match(text):
        return None
    if not text.rstrip("z").split(",")[-1].isdigit() or text.count(",") < 2:
        text = f"{text},14z"
    return f"@{text}"


def _handle(profile_id: str) -> str:
    """Zieht den reinen Benutzernamen aus dem, was das Modell liefert.

    Modelle geben mal 'nike', mal '@nike', mal die ganze Profil-URL zurueck --
    SerpApi will nur das nackte Handle.
    """
    text = (profile_id or "").strip().strip("@").rstrip("/")
    if "/" in text:
        text = text.rsplit("/", 1)[-1]
    return text.split("?")[0].strip()


_PROFIL_FELDER = {
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
_PROFIL_URL = {
    "instagram": "https://www.instagram.com/{}",
    "facebook": "https://www.facebook.com/{}",
}


def _profil_text(platform: str, handle: str, profil: dict[str, Any]) -> str:
    lines = [f"{platform.capitalize()} profile: {_PROFIL_URL[platform].format(handle)}"]
    if profil.get("is_verified"):
        lines[0] += "  ✓ verified"
    if profil.get("is_private"):
        lines[0] += "  🔒 private"

    for schluessel, label in _PROFIL_FELDER[platform]:
        wert = profil.get(schluessel)
        if wert in (None, "", []):
            continue
        lines.append(f"{label}: {str(wert).strip()}")

    verweise: list[str] = []
    for eintrag in (profil.get("bio_links") or profil.get("links") or []):
        if isinstance(eintrag, dict) and (url := eintrag.get("url") or eintrag.get("link")):
            titel = eintrag.get("title")
            verweise.append(f"{titel}: {url}" if titel else str(url))
    if verweise:
        lines.append("Links:")
        lines += [f"- {v}" for v in verweise[:8]]

    return truncate("\n".join(lines), 4000)


def _plain(value: str | None) -> str:
    """Brave und Google markieren Treffer mit <strong> -- das stoert nur."""
    if not value:
        return ""
    return (
        value.replace("<strong>", "").replace("</strong>", "").replace("&#x27;", "'")
    )
