"""Die Werkzeuge zum Scrapen.

Sechs Stueck, entlang der Frage "wie viel von der Seite brauche ich?":

    fetch_page        ganze Seite als Markdown (mit Blaettern per offset)
    extract_selectors nur die Stellen, die ein CSS-Selektor trifft
    extract_tables    nur die Tabellen
    list_links        nur die Links -- der Einstieg ins Weiterklicken
    fetch_json        APIs statt HTML, mit Strukturuebersicht
    batch_fetch       mehrere Seiten auf einmal

Alle teilen sich den ``PageFetcher``: gleicher Cache, gleiche Bremse.
"""

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
    """Gemeinsamer Bauplan: jedes Werkzeug bekommt denselben Fetcher."""

    def __init__(self, fetcher: PageFetcher, max_chars: int = MAX_CHARS) -> None:
        self._fetcher = fetcher
        self._max_chars = max_chars

    async def _seite(self, url: str) -> Page | str:
        """Holt die Seite oder liefert die Fehlermeldung als Text."""
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
        seite = await self._seite(url)
        if isinstance(seite, str):
            raise ToolError(seite)
        if fehler := _inhaltspruefung(seite):
            raise ToolError(fehler)

        suppe = md.parse(seite.text)
        ueberschrift = md.titel(suppe)
        md.saeubern(suppe, beiwerk=mode == "full" or bool(selector))

        if selector:
            treffer = _select(suppe, selector)
            if isinstance(treffer, str):
                raise ToolError(treffer)
            if not treffer:
                return f"{seite.herkunft()}\n\nNo match for selector {selector!r}."
            teile = [md.zu_markdown(k, seite.url, bilder=images) for k in treffer]
            inhalt = "\n\n".join(t for t in teile if t)
        else:
            wurzel = md.hauptinhalt(suppe) if mode == "article" else (suppe.body or suppe)
            inhalt = md.zu_markdown(wurzel, seite.url, bilder=images)

        if mode == "text":
            inhalt = _entmarkieren(inhalt)
        if not inhalt.strip():
            return (
                f"{seite.herkunft()}\n\nNo readable text found -- the page "
                "probably builds its content via JavaScript."
            )

        kopf = seite.herkunft()
        if ueberschrift:
            kopf += f"\nTitle: {ueberschrift}"
        return f"{kopf}\n\n{_ausschnitt(inhalt, offset, max_chars or self._max_chars)}"


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
        gewuenscht = _selektoren(selectors)
        if isinstance(gewuenscht, str):
            raise ToolError(gewuenscht)

        seite = await self._seite(url)
        if isinstance(seite, str):
            raise ToolError(seite)
        if fehler := _inhaltspruefung(seite):
            raise ToolError(fehler)

        suppe = md.saeubern(md.parse(seite.text), beiwerk=True)
        grenze = max(1, min(int(limit), 200))
        zeilen = [seite.herkunft(), ""]

        for name, ausdruck in gewuenscht.items():
            selektor, attribut = _attribut_abtrennen(ausdruck)
            treffer = _select(suppe, selektor)
            if isinstance(treffer, str):
                zeilen += [f"## {name}", treffer, ""]
                continue
            if not treffer:
                zeilen += [f"## {name} — no match ({selektor})", ""]
                continue

            werte = [
                w
                for knoten in treffer[:grenze]
                if (w := _wert(knoten, attribut, content, seite.url))
            ]
            kopf = f"## {name} — {len(treffer)} matches"
            if len(treffer) > grenze:
                kopf += f" (the first {grenze})"
            zeilen.append(kopf)
            zeilen += [f"{i}. {w}" for i, w in enumerate(werte, start=1)]
            zeilen.append("")

        return _ausschnitt(
            "\n".join(zeilen),
            0,
            self._max_chars,
            weiter="use narrower selectors or a smaller 'limit'",
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
        seite = await self._seite(url)
        if isinstance(seite, str):
            raise ToolError(seite)
        if fehler := _inhaltspruefung(seite):
            raise ToolError(fehler)

        suppe = md.saeubern(md.parse(seite.text), beiwerk=True)
        tabellen = [t for t in suppe.find_all("table") if t.find("tr")]
        if not tabellen:
            return f"{seite.herkunft()}\n\nNo tables on this page."

        grenze = max(1, min(int(max_rows), 500))
        if index is not None:
            if not 1 <= index <= len(tabellen):
                return (
                    f"{seite.herkunft()}\n\nThere are {len(tabellen)} tables, "
                    f"index={index} is out of range."
                )
            gewaehlt = [(index, tabellen[index - 1])]
            zeilen_pro_tabelle = grenze
        else:
            gewaehlt = list(enumerate(tabellen, start=1))
            zeilen_pro_tabelle = min(grenze, 5 if len(tabellen) > 1 else grenze)

        zeilen = [seite.herkunft(), f"{len(tabellen)} table(s) found.", ""]
        for nummer, tabelle in gewaehlt:
            beschriftung = tabelle.find("caption")
            titel = beschriftung.get_text(" ", strip=True) if beschriftung else ""
            zeilen.append(f"## Table {nummer}{f' — {titel}' if titel else ''}")
            zeilen.append(md.tabelle_zu_markdown(tabelle, max_zeilen=zeilen_pro_tabelle))
            zeilen.append("")

        if index is None and len(tabellen) > 1:
            zeilen.append("Full table: extract_tables with index=<number>.")
        return _ausschnitt(
            "\n".join(zeilen),
            0,
            self._max_chars,
            weiter="fetch a single table with index=<number>",
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
        seite = await self._seite(url)
        if isinstance(seite, str):
            raise ToolError(seite)
        if fehler := _inhaltspruefung(seite):
            raise ToolError(fehler)

        suppe = md.saeubern(md.parse(seite.text), beiwerk=True)
        eigen = urlparse(seite.url).netloc
        filter_ = _muster(pattern)

        gefunden: dict[str, str] = {}
        for anker in suppe.find_all("a"):
            ziel = str(anker.get("href") or "").strip()
            if not ziel or ziel.startswith(("javascript:", "mailto:", "tel:", "#")):
                continue
            absolut = urljoin(seite.url, ziel).split("#")[0]
            if not absolut.startswith(("http://", "https://")):
                continue
            intern = urlparse(absolut).netloc == eigen
            if (scope == "internal" and not intern) or (scope == "external" and intern):
                continue
            text = re.sub(r"\s+", " ", anker.get_text(" ", strip=True))[:120]
            if filter_ and not (filter_.search(absolut) or filter_.search(text)):
                continue
            gefunden.setdefault(absolut, text or "(no text)")

        if not gefunden:
            hinweis = f" with filter {pattern!r}" if pattern else ""
            return f"{seite.herkunft()}\n\nNo matching links{hinweis}."

        grenze = max(1, min(int(limit), 300))
        zeilen = [seite.herkunft(), f"{len(gefunden)} link(s), scope={scope}", ""]
        for nummer, (ziel, text) in enumerate(list(gefunden.items())[:grenze], start=1):
            zeilen.append(f"{nummer}. {text}\n   {ziel}")
        if len(gefunden) > grenze:
            zeilen.append(f"\n[... {len(gefunden) - grenze} more links]")
        return _ausschnitt(
            "\n".join(zeilen),
            0,
            self._max_chars,
            weiter="filter more narrowly with 'pattern' or 'scope'",
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
        kopfzeilen = {"Accept": "application/json"}
        if isinstance(headers, dict):
            kopfzeilen.update({str(k): str(v) for k, v in headers.items()})

        try:
            seite = await self._fetcher.get(
                url,
                method=method,
                headers=kopfzeilen,
                json_body=_als_objekt(body) if method.upper() == "POST" else None,
            )
        except FetchError as exc:
            raise ToolError(str(exc)) from exc

        try:
            daten = json.loads(seite.text)
        except json.JSONDecodeError as exc:
            auszug = seite.text.strip()[:500]
            raise ToolError(
                f"{seite.herkunft()}\n\nResponse is not JSON ({exc.msg}). "
                f"Content-Type: {seite.content_type or 'unknown'}.\n\n{auszug}"
            ) from exc

        if path:
            daten = _pfad(daten, path)
            if isinstance(daten, str) and daten.startswith("__fehler__"):
                raise ToolError(f"{seite.herkunft()}\n\n{daten.removeprefix('__fehler__')}")

        kopf = seite.herkunft()
        if seite.status >= 400:
            kopf += " (error response -- the body is below)"

        hinweis = "reach into the response with 'path', e.g. path='data.items[0]'"
        text = json.dumps(daten, indent=2, ensure_ascii=False, default=str)
        return (
            f"{kopf}\n\nStructure{f' at {path}' if path else ''}:\n"
            f"{_struktur(daten)}\n\nData:\n"
            f"{_ausschnitt(text, 0, max_chars or self._max_chars, weiter=hinweis)}"
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
        liste = _urlliste(urls)
        if isinstance(liste, str):
            raise ToolError(liste)

        je_seite = max(200, min(int(max_chars), self._max_chars))
        ergebnisse = await self._fetcher.get_many(liste)

        teile = [f"{len(liste)} page(s) fetched.", ""]
        for nummer, (url, ergebnis) in enumerate(zip(liste, ergebnisse), start=1):
            teile.append(f"═══ {nummer}/{len(liste)}: {url}")
            if isinstance(ergebnis, FetchError):
                teile += [f"Failed: {ergebnis}", ""]
                continue
            if fehler := _inhaltspruefung(ergebnis):
                teile += [fehler, ""]
                continue

            suppe = md.parse(ergebnis.text)
            ueberschrift = md.titel(suppe)
            md.saeubern(suppe, beiwerk=mode == "full")
            wurzel = md.hauptinhalt(suppe) if mode == "article" else (suppe.body or suppe)
            inhalt = md.zu_markdown(wurzel, ergebnis.url)
            if mode == "text":
                inhalt = _entmarkieren(inhalt)

            if ueberschrift:
                teile.append(f"Title: {ueberschrift}")
            teile += [
                _ausschnitt(
                    inhalt, 0, je_seite, weiter="fetch the whole page with fetch_page"
                )
                or "(no readable text)",
                "",
            ]

        return "\n".join(teile)


def _inhaltspruefung(seite: Page) -> str | None:
    """Sagt dem Modell frueh, wenn hier kein Text zu holen ist."""
    if seite.status >= 400:
        return (
            f"{seite.url} responded with HTTP {seite.status}. "
            + ("The page probably requires a login or blocks bots."
               if seite.status in (401, 403, 429)
               else "Check the address.")
        )
    typ = seite.content_type
    if typ and not seite.is_html and "text" not in typ:
        if seite.is_json:
            return f"{seite.url} returns JSON -- use fetch_json for that."
        return f"{seite.url} returns {typ!r}, which is not text."
    return None


def _select(suppe: Any, selektor: str) -> list[Tag] | str:
    try:
        return list(suppe.select(selektor))
    except Exception as exc:  # noqa: BLE001 -- ungueltiger Selektor ist Modellfehler
        return f"Selector {selektor!r} is invalid: {exc}"


def _attribut_abtrennen(ausdruck: str) -> tuple[str, str | None]:
    """'a.item @href' → ('a.item', 'href')"""
    if "@" in ausdruck:
        selektor, _, attribut = ausdruck.rpartition("@")
        if selektor.strip():
            return selektor.strip(), attribut.strip()
    return ausdruck.strip(), None


def _wert(knoten: Tag, attribut: str | None, content: str, basis: str) -> str:
    if attribut:
        roh = knoten.get(attribut)
        if roh is None:
            return ""
        wert = " ".join(roh) if isinstance(roh, list) else str(roh)
        return urljoin(basis, wert) if attribut in ("href", "src", "action") else wert
    if content == "html":
        return re.sub(r"\s+", " ", str(knoten))[:1000]
    if content == "markdown":
        return md.zu_markdown(knoten, basis).replace("\n", " ").strip()
    return re.sub(r"\s+", " ", knoten.get_text(" ", strip=True))


def _selektoren(rohwert: Any) -> dict[str, str] | str:
    """Nimmt Dict, Liste oder JSON-Text -- Modelle liefern alle drei Formen."""
    if isinstance(rohwert, str):
        try:
            rohwert = json.loads(rohwert)
        except json.JSONDecodeError:
            rohwert = [rohwert]
    if isinstance(rohwert, dict):
        paare = {str(k): str(v) for k, v in rohwert.items() if v}
    elif isinstance(rohwert, list):
        paare = {str(v): str(v) for v in rohwert if v}
    else:
        return f"'selectors' must be an object, got {type(rohwert).__name__}."
    if not paare:
        return "No selectors given."
    return dict(list(paare.items())[:20])


def _urlliste(rohwert: Any) -> list[str] | str:
    if isinstance(rohwert, str):
        try:
            rohwert = json.loads(rohwert)
        except json.JSONDecodeError:
            rohwert = [teil for teil in re.split(r"[\s,]+", rohwert) if teil]
    if not isinstance(rohwert, list):
        return f"'urls' must be a list, got {type(rohwert).__name__}."
    sauber = [str(u).strip() for u in rohwert if str(u).strip()]
    if not sauber:
        return "No URLs given."
    if len(sauber) > MAX_URLS:
        logger.info("batch_fetch: %d URLs auf %d gekuerzt", len(sauber), MAX_URLS)
    return sauber[:MAX_URLS]


def _als_objekt(rohwert: Any) -> Any:
    if isinstance(rohwert, str):
        try:
            return json.loads(rohwert)
        except json.JSONDecodeError:
            return rohwert
    return rohwert


def _muster(pattern: str | None) -> re.Pattern[str] | None:
    """Erst als Regex versuchen, sonst als schlichter Textfilter."""
    if not pattern:
        return None
    try:
        return re.compile(pattern, re.I)
    except re.error:
        return re.compile(re.escape(pattern), re.I)


def _pfad(daten: Any, pfad: str) -> Any:
    """'data.items[0].name' Schritt fuer Schritt ablaufen."""
    aktuell = daten
    for teil in re.findall(r"[^.\[\]]+|\[\d+\]", pfad):
        if teil.startswith("["):
            index = int(teil[1:-1])
            if not isinstance(aktuell, list) or not -len(aktuell) <= index < len(aktuell):
                return f"__fehler__Path {pfad!r}: index {index} does not exist."
            aktuell = aktuell[index]
        else:
            if not isinstance(aktuell, dict) or teil not in aktuell:
                verfuegbar = ", ".join(list(aktuell)[:15]) if isinstance(aktuell, dict) else "-"
                return f"__fehler__Path {pfad!r}: {teil!r} is missing. Available: {verfuegbar}"
            aktuell = aktuell[teil]
    return aktuell


def _struktur(wert: Any, tiefe: int = 0, max_tiefe: int = 4) -> str:
    """Kurzbeschreibung der Form -- damit das Modell weiss, wonach es greifen kann."""
    if isinstance(wert, dict):
        if not wert:
            return "{}"
        if tiefe >= max_tiefe:
            return f"{{...{len(wert)} fields}}"
        felder = list(wert.items())[:25]
        inneres = ", ".join(f"{k}: {_struktur(v, tiefe + 1, max_tiefe)}" for k, v in felder)
        if len(wert) > 25:
            inneres += f", ...{len(wert) - 25} more"
        return "{" + inneres + "}"
    if isinstance(wert, list):
        if not wert:
            return "[]"
        return f"[{len(wert)} × {_struktur(wert[0], tiefe + 1, max_tiefe)}]"
    if wert is None:
        return "null"
    if isinstance(wert, bool):
        return "bool"
    if isinstance(wert, str):
        return "str"
    return type(wert).__name__


def _entmarkieren(text: str) -> str:
    """Markdown-Auszeichnung wieder abstreifen -- fuer mode='text'.

    Tabellen bleiben als Zeilen mit Trennstrichen stehen: ohne sie waere
    nicht mehr zu erkennen, welcher Wert zu welcher Spalte gehoert.
    """
    text = re.sub(r"!?\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"^\s*```.*$", "", text, flags=re.M)
    text = re.sub(r"^#{1,6}\s*", "", text, flags=re.M)
    text = re.sub(r"^ *\|[\s\-|]+\|[^\S\n]*\n", "", text, flags=re.M)
    text = re.sub(r"[*_~`>]", "", text)
    text = re.sub(r"^ (?=\S)", "", text, flags=re.M)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def _ausschnitt(
    text: str, offset: int, max_chars: int, *, weiter: str | None = None
) -> str:
    """Schneidet ein Stueck heraus und sagt, wie es weitergeht.

    Der Hinweis am Ende ist wichtiger als er aussieht: ohne ihn haelt das
    Modell die gekappte Seite fuer die ganze Seite. ``weiter`` nennt den Weg
    zum Rest -- bei Werkzeugen ohne ``offset`` also ein anderes Werkzeug.
    """
    grenze = max(200, int(max_chars))
    gesamt = len(text)
    start = max(0, min(int(offset), gesamt))
    ende = min(start + grenze, gesamt)

    teile = []
    if start:
        teile.append(f"[... {start} characters skipped before this]\n\n")
    teile.append(text[start:ende])
    if ende < gesamt:
        rat = weiter or f"read on with offset={ende}"
        teile.append(f"\n\n[... truncated at character {ende} of {gesamt} -- {rat}]")
    return "".join(teile)
