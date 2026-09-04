"""Bilder erzeugen -- mit oder ohne Vorlage, und beim Entstehen zusehen.

Das Besondere ist nicht der Aufruf, sondern der Rueckkanal. Ein Bild
braucht bei ``gpt-image-2`` je nach Groesse und Qualitaet zwanzig Sekunden
bis zwei Minuten. Ohne Zwischenstaende sitzt der Nutzer so lange vor einer
Werkzeugzeile, die "laeuft" sagt, und weiss nicht, ob etwas passiert.

Die Images-API kann Zwischenstaende: mit ``stream=True`` und
``partial_images`` schickt sie ein paar Mal ein unfertiges Bild, bevor das
fertige kommt. Diese Zwischenstaende gehen hier ueber den Ereignis-Bus in
den Browser -- denselben Weg, den auch ``notify_user`` nimmt. Das Ergebnis
des Werkzeugs bleibt davon unberuehrt: das Modell bekommt am Ende einen
Satz und eine Adresse, nicht dreissig Sekunden Bildbrei.

Warum ueber den Bus und nicht ueber den Chat-Stream: der Chat-Stream
transportiert, was das *Modell* sagt. Ein Zwischenstand ist aber kein
Modelltext, sondern ein Nebenprodukt eines laufenden Werkzeugs. Ihn dort
einzuschleusen hiesse, jedem Werkzeug einen Kanal in die Antwort zu geben.

Warum png: mit webp liefert die API gar keine Zwischenstaende, nur das
fertige Bild. Das ist kein dokumentiertes Verhalten, sondern gemessen --
siehe ``ImageSettings.output_format``.

Zwei Endpunkte, ein Werkzeug: ohne Vorlage geht es an
``/images/generations``, mit Vorlage an ``/images/edits``. Der zweite
heisst "edits", ist aber der Weg fuer "nimm diese Bilder als Referenz" --
eine Maske ist optional, und ohne sie ist es reine Vorlage. Beide
streamen; ihre Ereignisse heissen nur anders (``image_generation.*`` gegen
``image_edit.*``), weshalb unten auf die Endung geprueft wird und nicht
auf den vollen Namen.
"""

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

GROESSEN = ("1024x1024", "1536x1024", "1024x1536", "auto")
QUALITAETEN = ("low", "medium", "high", "auto")

VORLAGE_TYPEN: dict[str, str] = {
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
                "enum": list(GROESSEN),
                "description": (
                    "Square, landscape or portrait. Leave out for square."
                ),
            },
            "quality": {
                "type": "string",
                "enum": list(QUALITAETEN),
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
        sauber = (prompt or "").strip()
        if not sauber:
            raise ToolError("prompt must not be empty.")

        vorlagen = await self._vorlagen_laden(reference_images or [])

        self._dir.mkdir(parents=True, exist_ok=True)
        lauf = uuid.uuid4().hex
        beschriftung = (alt or sauber)[:200]

        await self._melde(
            {
                "type": "image",
                "phase": "start",
                "run": lauf,
                "prompt": sauber[:400],
                "alt": beschriftung,
                "references": len(vorlagen),
            }
        )

        entwuerfe: list[Path] = []
        try:
            daten = await self._erzeugen(
                sauber, vorlagen, size, quality, lauf, beschriftung, entwuerfe
            )
        except openai.APIStatusError as exc:
            await self._melde({"type": "image", "phase": "error", "run": lauf})
            raise ToolError(
                f"The image API refused this request (HTTP {exc.status_code}): "
                f"{_grund(exc)}"
            ) from exc
        except openai.APIError as exc:
            await self._melde({"type": "image", "phase": "error", "run": lauf})
            raise ToolError(f"Image generation failed: {exc}") from exc
        finally:
            for pfad in entwuerfe:
                pfad.unlink(missing_ok=True)

        pfad = self._ablegen(daten)
        url = _url(pfad)
        await self._melde(
            {
                "type": "image",
                "phase": "done",
                "run": lauf,
                "url": url,
                "alt": beschriftung,
            }
        )
        logger.info(
            "image.generated",
            extra={
                "model": self._cfg.model,
                "bytes": len(daten),
                "references": len(vorlagen),
            },
        )

        return self._bericht(url, beschriftung, len(daten), vorlagen, await self._ablegen_im_bucket(pfad, beschriftung))


    async def _erzeugen(
        self,
        prompt: str,
        vorlagen: list[tuple[str, bytes, str]],
        size: str | None,
        quality: str | None,
        lauf: str,
        alt: str,
        entwuerfe: list[Path],
    ) -> bytes:
        gemeinsam: dict[str, Any] = {
            "model": self._cfg.model,
            "prompt": prompt,
            "size": size or self._cfg.size,
            "quality": quality or self._cfg.quality,
            "output_format": self._cfg.output_format,
            "stream": True,
            "partial_images": self._cfg.partial_images,
        }

        if vorlagen:
            strom = await self._client.images.edit(image=vorlagen, **gemeinsam)
        else:
            strom = await self._client.images.generate(
                moderation=self._cfg.moderation, **gemeinsam
            )

        letztes: bytes | None = None

        async for ereignis in strom:
            roh = getattr(ereignis, "b64_json", None)
            if not roh:
                continue
            daten = base64.b64decode(roh)

            if ereignis.type.endswith(".partial_image"):
                pfad = self._ablegen(daten)
                entwuerfe.append(pfad)
                await self._melde(
                    {
                        "type": "image",
                        "phase": "partial",
                        "run": lauf,
                        "index": getattr(ereignis, "partial_image_index", 0),
                        "url": _url(pfad),
                        "alt": alt,
                    }
                )
            else:
                letztes = daten

        if letztes is None:
            raise ToolError("The image API returned no image.")
        return letztes


    async def _vorlagen_laden(
        self, referenzen: list[str]
    ) -> list[tuple[str, bytes, str]]:
        """Adressen zu Bytes. Reihenfolge bleibt -- die erste ist das Hauptmotiv."""
        if not referenzen:
            return []
        if self._cfg.max_references == 0:
            raise ToolError("Reference images are disabled (IMAGE_MAX_REFERENCES=0).")
        if len(referenzen) > self._cfg.max_references:
            raise ToolError(
                f"At most {self._cfg.max_references} reference images, "
                f"got {len(referenzen)}."
            )

        geladen: list[tuple[str, bytes, str]] = []
        for referenz in referenzen:
            geladen.append(await self._vorlage_laden(str(referenz).strip()))
        return geladen

    async def _vorlage_laden(self, referenz: str) -> tuple[str, bytes, str]:
        if not referenz:
            raise ToolError("An empty reference image was given.")

        if referenz.startswith(("http://", "https://")):
            daten, typ = await self._holen(referenz)
        else:
            daten, typ = self._von_platte(referenz)

        if typ not in VORLAGE_TYPEN:
            raise ToolError(
                f"{referenz}: {typ or 'unknown type'} cannot be used as a "
                f"reference. Use PNG, JPEG or WebP."
            )
        if len(daten) > self._cfg.reference_max_bytes:
            raise ToolError(
                f"{referenz} is larger than "
                f"{self._cfg.reference_max_bytes // 1_000_000} MB."
            )
        return (f"reference.{VORLAGE_TYPEN[typ]}", daten, typ)

    def _von_platte(self, referenz: str) -> tuple[bytes, str]:
        """Eine Adresse auf dieser Maschine -- und zwar nur aus den Anhaengen.

        Beschraenkt auf ``uploads_dir``, weil dort alles liegt, was aus
        diesem Chat stammt: hochgeladene Bilder wie erzeugte. Ein beliebiger
        Pfad waere ein Weg, jede Datei der Maschine an einen fremden Dienst
        zu schicken -- und das Modell waehlt diesen Pfad, nicht der Nutzer.
        """
        if (treffer := re.search(r"/api/uploads/([0-9a-f]{32})", referenz)) is not None:
            kandidaten = sorted(self._dir.glob(f"{treffer.group(1)}.*"))
            if not kandidaten:
                raise ToolError(f"{referenz} is not stored here (any more).")
            pfad = kandidaten[0]
        else:
            pfad = Path(referenz).expanduser()

        try:
            aufgeloest = pfad.resolve(strict=True)
        except OSError as exc:
            raise ToolError(f"{referenz} does not exist.") from exc

        if not aufgeloest.is_relative_to(self._dir.resolve()):
            raise ToolError(
                f"{referenz} is outside the attachment folder. Reference "
                f"images have to be files from this conversation -- something "
                f"the user attached, or an image you generated."
            )
        if not aufgeloest.is_file():
            raise ToolError(f"{referenz} is not a file.")

        typ = mimetypes.guess_type(aufgeloest.name)[0] or ""
        return aufgeloest.read_bytes(), typ

    async def _holen(self, url: str) -> tuple[bytes, str]:
        if self._http is None:
            raise ToolError("Fetching reference images by URL is not available.")
        try:
            antwort = await self._http.get(url)
            antwort.raise_for_status()
        except httpx.HTTPError as exc:
            raise ToolError(f"{url} could not be fetched: {exc}") from exc

        typ = (antwort.headers.get("content-type") or "").split(";")[0].strip().lower()
        return antwort.content, typ


    def _ablegen(self, daten: bytes) -> Path:
        pfad = self._dir / f"{uuid.uuid4().hex}.{self._cfg.output_format}"
        pfad.write_bytes(daten)
        return pfad

    async def _ablegen_im_bucket(self, pfad: Path, alt: str) -> str | None:
        """Das fertige Bild zusaetzlich in den Bucket -- die Galerie des Modells.

        Damit findet es seine eigenen Bilder spaeter wieder: ``storage_list``
        zeigt sie, ``storage_delete`` raeumt auf. Der Name traegt Datum und
        Motiv, damit diese Liste lesbar ist und nicht aus dreissig Hex-Ketten
        besteht.

        Scheitert das, ist es kein Fehlschlag des Werkzeugs: das Bild
        existiert, wird angezeigt und liegt lokal. Es fehlt dann nur der
        Eintrag in der Galerie, und das ist eine Zeile im Ergebnis wert --
        keine Ausnahme.
        """
        if not self._cfg.archive or self._mc is None:
            return None

        schluessel = (
            f"{self._cfg.archive_prefix}/"
            f"{dt.date.today().isoformat()}-{_slug(alt)}-{pfad.stem[:8]}{pfad.suffix}"
        )
        try:
            await self._mc.json_lines(
                "cp",
                "--quiet",
                "--attr",
                f"Content-Type=image/{self._cfg.output_format}",
                str(pfad),
                self._mc.target(schluessel),
            )
        except Exception as exc:  # noqa: BLE001 -- die Galerie ist Beiwerk
            logger.warning("Bild nicht im Bucket abgelegt: %s", exc)
            return None
        return self._mc.url(schluessel)

    def _bericht(
        self,
        url: str,
        alt: str,
        groesse: int,
        vorlagen: list[tuple[str, bytes, str]],
        galerie: str | None,
    ) -> str:
        zeilen = [
            f"Image generated ({groesse // 1024} KB, {self._cfg.model}"
            + (f", from {len(vorlagen)} reference image(s)" if vorlagen else "")
            + ")."
        ]
        if galerie:
            zeilen.append(
                f"Also filed in your gallery under "
                f"{self._cfg.archive_prefix}/ -- storage_list shows it, and "
                f"its public address is {galerie}"
            )
        zeilen += [
            "",
            "Show it to the user by putting exactly this in your answer:",
            "",
            f"![{alt}]({url})",
            "",
            "To change this image later, pass this same URL back in "
            "reference_images and describe only what should differ.",
        ]
        return "\n".join(zeilen)

    async def _melde(self, ereignis: dict[str, Any]) -> None:
        if self._bus is not None:
            await self._bus.publish(ereignis)

    async def aclose(self) -> None:
        await self._client.close()


def _url(pfad: Path) -> str:
    """Die Adresse, unter der das Frontend die Datei holt.

    Relativ und nicht absolut: sie wandert in den gespeicherten Verlauf,
    und dort waere ein fester Host genau das, was nach einem Umzug bricht.
    """
    return f"/api/uploads/{pfad.stem}"


def _slug(text: str) -> str:
    """Aus der Beschriftung ein Stueck Dateiname -- fuer eine lesbare Galerie."""
    klein = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return (klein[:48].rstrip("-")) or "image"


def _grund(exc: openai.APIStatusError) -> str:
    """Die Meldung des Anbieters -- meist die Moderation."""
    koerper = getattr(exc, "body", None)
    if isinstance(koerper, dict):
        fehler = koerper.get("error")
        if isinstance(fehler, dict) and (m := fehler.get("message")):
            return str(m)
    return str(exc)[:200]
