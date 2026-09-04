"""Bilder ansehen -- ein Aufruf an das Vision-Modell.

Das Hauptmodell ist blind. Statt jede Nachricht vorsorglich durch ein
Vision-Modell zu schicken, fragt es hier gezielt nach: "was steht auf diesem
Screenshot?", "welche Kurve steigt?". Eine gezielte Frage liefert bessere
Antworten als eine Pauschalbeschreibung -- und kostet nur, wenn wirklich
jemand hinschauen muss.

Quellen, die hier ankommen duerfen:

    https://...              oeffentlich erreichbar -> die API laedt selbst
    http://localhost/...     nicht von aussen erreichbar -> wir laden und betten ein
    data:image/png;base64,   schon eingebettet -> durchreichen
    /pfad/zum/bild.png       von der Platte -> lesen, pruefen, einbetten
    rohe Bytes               ueber den Endpunkt (Multipart) -> einbetten

Das Format wird an den Magic Bytes erkannt, nicht an der Endung -- die API
macht es genauso, und ein Fehlschlag hier ist verstaendlicher als ein 400
von dort.
"""

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

SIGNATUREN: tuple[tuple[bytes, str], ...] = (
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"GIF87a", "image/gif"),
    (b"GIF89a", "image/gif"),
)
MAX_URL = 8192
DETAILS = {"low", "high", "original", "auto"}
DATA_URL = re.compile(r"^data:(image/[\w.+-]+);base64,(.+)$", re.S | re.I)

STANDARDFRAGE = (
    "Describe this image so that someone who cannot see it can work with it: "
    "image type, content, visible text verbatim, numbers and labels, notable "
    "details. No guesses about things that are not visible."
)


class VisionError(ToolError):
    """Bild unbrauchbar oder Modell nicht erreichbar -- Meldung geht ans Modell."""


@dataclass(frozen=True, slots=True)
class Bild:
    """Ein einsatzbereites Bild -- entweder als URL oder eingebettet."""

    block: dict[str, Any]
    herkunft: str
    mime: str | None = None
    bytes_: int = 0
    eingebettet: bool = False

    @property
    def fingerabdruck(self) -> str:
        roh = self.block.get("image_url", {}).get("url", "")
        return hashlib.sha256(roh.encode("utf-8", "replace")).hexdigest()[:32]


class VisionService:
    """Schmale Huelle um genau einen Modellaufruf."""

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


    async def load(self, quelle: str | bytes, *, detail: str | None = None) -> Bild:
        """Macht aus einer beliebigen Quelle einen Block fuer die API."""
        stufe = detail if detail in DETAILS else self._detail

        if isinstance(quelle, bytes):
            return self._aus_bytes(quelle, "uploaded file", stufe)

        text = quelle.strip()
        if not text:
            raise VisionError("No image provided.")

        if treffer := DATA_URL.match(text):
            roh = _base64_dekodieren(treffer.group(2))
            return self._aus_bytes(roh, "data URL", stufe, mime_hinweis=treffer.group(1))

        if text.lower().startswith(("http://", "https://")):
            return await self._aus_url(text, stufe)

        pfad = Path(text).expanduser()
        if pfad.is_file():
            return self._aus_bytes(_lesen(pfad, self._max_bytes), str(pfad), stufe)

        if len(text) > 100 and re.fullmatch(r"[A-Za-z0-9+/=\s]+", text):
            return self._aus_bytes(_base64_dekodieren(text), "base64 data", stufe)

        raise VisionError(
            f"{text[:120]!r} is neither a URL nor an existing file. "
            "Give an http(s) address, a file path, or a data: URL."
        )

    async def _aus_url(self, url: str, detail: str) -> Bild:
        if len(url) > MAX_URL:
            raise VisionError(
                f"The URL is {len(url)} characters long, the limit is {MAX_URL}."
            )
        if grund := _endung_ungeeignet(url):
            raise VisionError(grund)
        if await _nur_intern(urlparse(url).hostname):
            logger.info("Nicht oeffentlich erreichbar, wird eingebettet: %s", url)
            return self._aus_bytes(await self._holen(url), url, detail)

        return Bild(
            block={"type": "image_url", "image_url": {"url": url, "detail": detail}},
            herkunft=url,
        )

    def _aus_bytes(
        self,
        roh: bytes,
        herkunft: str,
        detail: str,
        *,
        mime_hinweis: str | None = None,
    ) -> Bild:
        if not roh:
            raise VisionError(f"{herkunft}: empty file.")
        if len(roh) > self._max_bytes:
            raise VisionError(
                f"{herkunft} is {_lesbar(len(roh))}, the limit is "
                f"{_lesbar(self._max_bytes)}."
            )

        mime = _format_erkennen(roh)
        if mime is None:
            gemeint = f" (announced as {mime_hinweis})" if mime_hinweis else ""
            raise VisionError(
                f"{herkunft}{gemeint} is not a JPEG, PNG, GIF, or WebP. "
                f"The format is detected from the content, not the extension."
                f"{_rat(roh)}"
            )

        kodiert = base64.b64encode(roh).decode("ascii")
        return Bild(
            block={
                "type": "image_url",
                "image_url": {
                    "url": f"data:{mime};base64,{kodiert}",
                    "detail": detail,
                },
            },
            herkunft=herkunft,
            mime=mime,
            bytes_=len(roh),
            eingebettet=True,
        )

    async def _holen(self, url: str) -> bytes:
        try:
            antwort = await self._http.get(url, follow_redirects=True)
        except httpx.HTTPError as exc:
            raise VisionError(f"{url} unreachable: {exc}") from exc
        if antwort.status_code != 200:
            raise VisionError(f"{url} responded with HTTP {antwort.status_code}.")
        if len(antwort.content) > self._max_bytes:
            raise VisionError(
                f"{url} returns {_lesbar(len(antwort.content))}, the limit is "
                f"{_lesbar(self._max_bytes)}."
            )
        return antwort.content


    async def ask(
        self,
        quellen: list[str | bytes],
        frage: str | None = None,
        *,
        detail: str | None = None,
    ) -> tuple[str, list[Bild]]:
        """Laedt die Bilder und stellt dem Vision-Modell eine Frage dazu."""
        if not quellen:
            raise VisionError("No image provided.")
        if len(quellen) > self._max_images:
            raise VisionError(
                f"{len(quellen)} images at once -- the limit is {self._max_images}."
            )

        bilder = [await self.load(q, detail=detail) for q in quellen]
        text = (frage or STANDARDFRAGE).strip() or STANDARDFRAGE

        schluessel = _cache_schluessel(bilder, text)
        if (gecacht := self._aus_cache(schluessel)) is not None:
            logger.info("Vision aus dem Cache (%d Bild(er))", len(bilder))
            return gecacht, bilder

        antwort = await self._fragen(bilder, text)
        self._cache[schluessel] = (time.monotonic(), antwort)
        return antwort, bilder

    async def _fragen(self, bilder: list[Bild], text: str) -> str:
        inhalt: list[dict[str, Any]] = [{"type": "text", "text": text}]
        inhalt += [bild.block for bild in bilder]

        logger.info(
            "Vision: %s, %d Bild(er) (%s)",
            self.model,
            len(bilder),
            ", ".join("eingebettet" if b.eingebettet else "URL" for b in bilder),
        )
        try:
            antwort = await self._client.chat.completions.create(
                model=self.model,
                max_tokens=self._max_tokens,
                messages=[{"role": "user", "content": inhalt}],
            )
        except openai.APIStatusError as exc:
            raise VisionError(_api_fehler(exc)) from exc
        except openai.APIError as exc:
            raise ProviderError(f"Vision model unreachable: {exc}") from exc

        ergebnis = (antwort.choices[0].message.content or "").strip()
        if not ergebnis:
            raise VisionError("The vision model returned nothing.")
        return ergebnis

    def _aus_cache(self, schluessel: str) -> str | None:
        eintrag = self._cache.get(schluessel)
        if eintrag is None:
            return None
        zeit, antwort = eintrag
        if time.monotonic() - zeit > self._cache_ttl:
            self._cache.pop(schluessel, None)
            return None
        return antwort

    async def health(self) -> bool:
        return True

    async def aclose(self) -> None:
        await self._client.close()
        await self._http.aclose()


def _format_erkennen(roh: bytes) -> str | None:
    """WebP braucht zwei Stellen, die anderen nur den Anfang."""
    for signatur, mime in SIGNATUREN:
        if roh.startswith(signatur):
            return mime
    if roh[:4] == b"RIFF" and roh[8:12] == b"WEBP":
        return "image/webp"
    return None


_UNGEEIGNET = {
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


def _endung_ungeeignet(url: str) -> str | None:
    pfad = urlparse(url).path.lower()
    for endung, rat in _UNGEEIGNET.items():
        if pfad.endswith(endung):
            return f"{url} cannot be read by the vision model. {rat}"
    return None


def _rat(roh: bytes) -> str:
    """Bei bekannten Nicht-Bildformaten den sinnvollen Umweg nennen.

    SVG ist der haeufigste Fall: das Modell legt selbst gern welche im
    Speicher ab und will sie danach ansehen. Ein SVG ist aber Text -- es
    zu *lesen* ist genauer als es anzuschauen und kostet kein Vision-Token.
    """
    anfang = roh[:512].lstrip()
    if anfang[:5].lower() == b"<?xml" or b"<svg" in anfang[:200].lower():
        return (
            " This looks like SVG: SVG is text -- read it with storage_get or "
            "fetch_page, that is more precise than looking at it. If you need "
            "an image of it, render it to PNG first (e.g. rsvg-convert)."
        )
    if anfang.startswith(b"%PDF"):
        return " This is a PDF -- convert the desired page to a PNG first."
    if anfang[:2] in (b"BM", b"II", b"MM"):
        return " BMP and TIFF are not supported -- convert the file to PNG first."
    return ""


def _lesen(pfad: Path, grenze: int) -> bytes:
    groesse = pfad.stat().st_size
    if groesse > grenze:
        raise VisionError(
            f"{pfad} is {_lesbar(groesse)}, the limit is {_lesbar(grenze)}."
        )
    try:
        return pfad.read_bytes()
    except OSError as exc:
        raise VisionError(f"{pfad} not readable: {exc}") from exc


def _base64_dekodieren(text: str) -> bytes:
    try:
        return base64.b64decode(re.sub(r"\s+", "", text), validate=True)
    except (ValueError, TypeError) as exc:
        raise VisionError(f"Base64 data could not be decoded: {exc}") from exc


async def _nur_intern(host: str | None) -> bool:
    """Zeigt der Host auf localhost oder ein privates Netz?"""
    if not host:
        return True
    if host in ("localhost", "localhost.localdomain") or host.endswith(".local"):
        return True
    try:
        adressen = await asyncio.get_running_loop().getaddrinfo(
            host, None, type=socket.SOCK_STREAM
        )
    except OSError:
        return False

    for eintrag in adressen:
        try:
            adresse = ipaddress.ip_address(eintrag[4][0])
        except ValueError:
            continue
        if not (adresse.is_private or adresse.is_loopback or adresse.is_link_local):
            return False
    return bool(adressen)


def _cache_schluessel(bilder: list[Bild], frage: str) -> str:
    roh = "|".join(b.fingerabdruck for b in bilder) + "|" + frage
    return hashlib.sha256(roh.encode("utf-8")).hexdigest()


def _api_fehler(exc: openai.APIStatusError) -> str:
    """Die 400er des Vision-Modells sind aussagekraeftig -- durchreichen."""
    meldung = ""
    if isinstance(getattr(exc, "body", None), dict):
        fehler = exc.body.get("error")
        if isinstance(fehler, dict):
            meldung = str(fehler.get("message") or "")
    return f"Vision model rejected (HTTP {exc.status_code}): {meldung or exc}"


def _lesbar(bytes_: int) -> str:
    if bytes_ < 1024:
        return f"{bytes_} B"
    if bytes_ < 1024 * 1024:
        return f"{bytes_ / 1024:.1f} KB"
    return f"{bytes_ / (1024 * 1024):.1f} MB"
