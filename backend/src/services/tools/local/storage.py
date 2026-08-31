"""Dateien im eigenen S3-Bucket ablegen, ansehen und loeschen -- ueber ``mc``.

Warum das Binary und keine S3-Bibliothek: die Zugangsdaten stehen bereits in
``~/.mc/config.json``. Ruft der Server ``mc`` auf, wandert kein Schluessel
durch diesen Code, durch die Konfiguration oder in ein Log.

Der Bucket ist oeffentlich lesbar. Alles, was hier hochgeht, liegt unter
``https://storage.smeeware.com/llm/...`` im Netz -- deshalb zwei Schranken:
jeder Zielpfad wird auf den Bucket festgenagelt (kein ``..``, kein anderer
Alias), und offensichtliche Geheimnistraeger auf der Platte (SSH-Schluessel,
``.env``, die mc-Konfiguration selbst) duerfen nicht die Quelle sein.

Wie beim Shell-Werkzeug gilt: die Sperrliste ist eine Stolperschwelle, kein
Zaun. Wer den Endpunkt nach aussen gibt, setzt ``STORAGE_LOCAL_ROOT`` und
begrenzt Uploads damit auf ein einziges Verzeichnis.
"""

from __future__ import annotations

import asyncio
import json
import mimetypes
import re
import shutil
import tempfile
from pathlib import Path
from typing import Any
from urllib.parse import quote

from src.core.logging import get_logger
from src.services.tools.base import ToolError
from src.services.tools.local.base import LocalTool, truncate

logger = get_logger(__name__)

MAX_CHARS = 12_000

# Wandert in einen oeffentlichen Bucket -- diese Pfade also nie.
GESPERRTE_QUELLEN: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"/\.ssh/", re.I), "an SSH directory"),
    (re.compile(r"/\.mc/config\.json$", re.I), "mc credentials"),
    (re.compile(r"/\.aws/|/\.gnupg/|/\.docker/config\.json$", re.I), "credentials"),
    (re.compile(r"/\.config/(gcloud|gh)/|/\.kube/config$", re.I), "cloud credentials"),
    (re.compile(r"(^|/)\.env(\.[\w-]+)?$", re.I), "a .env file"),
    (re.compile(r"\.(pem|key|p12|pfx|jks|keystore|ppk)$", re.I), "a key file"),
    (re.compile(r"/id_(rsa|dsa|ecdsa|ed25519)$", re.I), "a private key"),
    (re.compile(r"/\.(netrc|npmrc|pypirc|git-credentials)$", re.I), "credentials"),
    (re.compile(r"/Library/Keychains/|/etc/(shadow|sudoers)", re.I), "a system secret"),
)

# Was ``storage_get`` direkt in den Chat schreiben darf.
TEXTARTIG = re.compile(
    r"^text/|^application/(json|xml|javascript|x-yaml|x-sh|sql|toml)|\+xml$|\+json$",
    re.I,
)


class McError(ToolError):
    """mc hat nicht mitgespielt -- die Meldung geht ans Modell."""


class McClient:
    """Duenner Aufruf-Wrapper. Immer argv, nie eine Shell.

    Das Modell bestimmt Pfade und Namen; ueber eine Shell waere jedes
    Anfuehrungszeichen ein Einfallstor. ``create_subprocess_exec`` uebergibt
    die Argumente direkt an den Prozess -- da gibt es nichts zu zitieren.
    """

    def __init__(
        self,
        *,
        binary: str = "mc",
        alias: str = "smeeware",
        bucket: str = "llm",
        prefix: str = "",
        public_base: str = "https://storage.smeeware.com",
        config_dir: Path | None = None,
        timeout: float = 120.0,
    ) -> None:
        self.binary = binary
        self.alias = alias
        self.bucket = bucket
        self.prefix = prefix.strip("/")
        self.public_base = public_base.rstrip("/")
        self.config_dir = config_dir
        self.timeout = timeout

    # -- Adressen ------------------------------------------------------- #

    def key(self, roh: str) -> str:
        """Normalisiert einen Objektnamen und nagelt ihn auf den Bucket fest.

        Modelle liefern gern die volle URL oder ``llm/bild.png`` zurueck, die
        sie eben selbst bekommen haben. Beides ist gemeint, also beides
        akzeptieren -- und danach pruefen, dass nichts aus dem Bucket zeigt.
        """
        name = (roh or "").strip().replace("\\", "/")
        if not name:
            raise McError("No file name given.")

        # Volle URL oder mc-Adresse: den bekannten Vorsatz abziehen. Zeigt er
        # auf einen *anderen* Bucket, ist das ein Versehen -- sonst entstuende
        # still ein Objekt namens "assets/logo.png" im eigenen Bucket.
        for vorsatz in (f"{self.public_base}/", f"{self.alias}/"):
            if name.startswith(vorsatz):
                rest = name[len(vorsatz) :].lstrip("/")
                if not rest.startswith(f"{self.bucket}/"):
                    fremd = rest.split("/", 1)[0]
                    raise McError(
                        f"{roh!r} points at the bucket {fremd!r}. This tool "
                        f"only serves {self.alias}/{self.bucket}."
                    )
                name = rest[len(self.bucket) + 1 :]
                break
        else:
            if name.startswith(f"{self.bucket}/"):
                name = name[len(self.bucket) + 1 :]

        name = name.lstrip("/")
        teile = [t for t in name.split("/") if t not in ("", ".")]
        if any(t == ".." for t in teile):
            raise McError(f"{roh!r} points outside the bucket -- rejected.")
        if any(ord(z) < 32 for z in name):
            raise McError("Control character in the file name -- rejected.")
        if not teile:
            raise McError(f"{roh!r} does not resolve to a file name.")

        name = "/".join(teile)
        if len(name) > 512:
            raise McError("File name longer than 512 characters.")
        return name

    def target(self, key: str = "") -> str:
        """``smeeware/llm/unterordner/datei.png`` -- die Adresse fuer mc."""
        teile = [self.alias, self.bucket]
        if self.prefix:
            teile.append(self.prefix)
        if key:
            teile.append(key)
        return "/".join(teile)

    def url(self, key: str) -> str:
        """Die oeffentliche Adresse -- das, was am Ende in die Antwort soll."""
        pfad = f"{self.prefix}/{key}" if self.prefix else key
        return f"{self.public_base}/{self.bucket}/{quote(pfad)}"

    # -- Aufrufe -------------------------------------------------------- #

    async def run(
        self, *args: str, timeout: float | None = None
    ) -> tuple[int, str, str]:
        argv = [self.binary, "--no-color"]
        if self.config_dir:
            argv += ["--config-dir", str(self.config_dir)]
        argv += list(args)

        logger.info("mc %s", " ".join(args))
        try:
            prozess = await asyncio.create_subprocess_exec(
                *argv,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
        except FileNotFoundError as exc:
            raise McError(f"{self.binary!r} not found: {exc}") from exc

        # ``timeout or self.timeout`` waere hier falsch: bei 0 (kein Limit)
        # fiele es auf self.timeout zurueck. Deshalb explizit auf None pruefen.
        grenze = timeout if timeout is not None else self.timeout
        try:
            if grenze and grenze > 0:
                aus, fehler = await asyncio.wait_for(
                    prozess.communicate(), timeout=grenze
                )
            else:
                aus, fehler = await prozess.communicate()
        except TimeoutError:
            prozess.kill()
            await prozess.wait()
            raise McError(
                f"mc ran longer than {grenze:.0f}s and was aborted."
            ) from None
        except asyncio.CancelledError:
            prozess.kill()
            raise

        return (
            prozess.returncode or 0,
            aus.decode("utf-8", "replace"),
            fehler.decode("utf-8", "replace"),
        )

    async def json_lines(
        self, *args: str, timeout: float | None = None
    ) -> list[dict[str, Any]]:
        """mc --json schreibt ein Objekt pro Zeile -- auch im Fehlerfall."""
        code, aus, fehler = await self.run(*args, "--json", timeout=timeout)
        zeilen: list[dict[str, Any]] = []
        for zeile in aus.splitlines():
            if not (zeile := zeile.strip()):
                continue
            try:
                zeilen.append(json.loads(zeile))
            except json.JSONDecodeError:
                continue

        if fehlerhaft := [z for z in zeilen if z.get("status") == "error"]:
            raise McError(_fehlertext(fehlerhaft[0]))
        if code != 0:
            raise McError(_stderr_kurz(fehler) or f"mc exited with code {code}.")
        return zeilen


class _StorageTool(LocalTool):
    def __init__(self, mc: McClient) -> None:
        self._mc = mc


class StoragePutTool(_StorageTool):
    name = "storage_put"
    description = (
        "Stores a file in your own storage and returns its public URL. Two "
        "ways: 'content' writes text directly (SVG, HTML, JSON, Markdown, "
        "code), 'local_path' uploads a file from the machine -- e.g. an image "
        "you just created. Afterwards embed images and graphics with the "
        "returned URL as ![...](URL) in your answer; the user then sees them "
        "right in the chat."
    )
    parameters = {
        "type": "object",
        "properties": {
            "key": {
                "type": "string",
                "description": (
                    "Target name in storage, subfolders allowed, e.g. "
                    "'diagrams/flow.svg'. Without one, the file name from "
                    "'local_path' is used."
                ),
            },
            "content": {
                "type": "string",
                "description": "Content as text -- for anything you write yourself",
            },
            "local_path": {
                "type": "string",
                "description": "Path of an existing file on the machine",
            },
            "content_type": {
                "type": "string",
                "description": (
                    "MIME type, if the extension does not reveal it, "
                    "e.g. 'image/svg+xml'"
                ),
            },
        },
        "required": [],
    }

    def __init__(
        self,
        mc: McClient,
        *,
        max_inline: int = 200_000,
        max_bytes: int = 50_000_000,
        local_root: Path | None = None,
    ) -> None:
        super().__init__(mc)
        self._max_inline = max_inline
        self._max_bytes = max_bytes
        self._local_root = local_root

    async def run(
        self,
        key: str | None = None,
        content: str | None = None,
        local_path: str | None = None,
        content_type: str | None = None,
    ) -> str:
        if content is None and not local_path:
            raise ToolError("Nothing to upload: give either 'content' or 'local_path'.")
        if content is not None and local_path:
            raise ToolError("Give either 'content' or 'local_path', not both.")

        try:
            if local_path:
                quelle = Path(local_path).expanduser()
                if fehler := self._quelle_pruefen(quelle):
                    raise ToolError(fehler)
                ziel = self._mc.key(key or quelle.name)
                return await self._hochladen(
                    quelle, ziel, content_type, quelle.stat().st_size
                )

            if not key:
                raise ToolError("For 'content' I need a 'key' -- under what name?")
            if len(content) > self._max_inline:
                raise ToolError(
                    f"'content' is {len(content)} characters long, the limit is "
                    f"{self._max_inline}. Write the file to disk first and then "
                    "use 'local_path'."
                )
            ziel = self._mc.key(key)
            # Temporaerdatei mit derselben Endung: daran erkennt mc den MIME-Typ.
            with tempfile.NamedTemporaryFile(
                "w", suffix=Path(ziel).suffix or ".txt", delete=False, encoding="utf-8"
            ) as datei:
                datei.write(content)
                temp = Path(datei.name)
            try:
                return await self._hochladen(
                    temp, ziel, content_type, len(content.encode())
                )
            finally:
                temp.unlink(missing_ok=True)
        except McError as exc:
            raise ToolError(_bucket_hinweis(str(exc), self._mc)) from exc

    async def _hochladen(
        self, quelle: Path, ziel: str, content_type: str | None, groesse: int
    ) -> str:
        args = ["cp", "--quiet"]
        typ = content_type or mimetypes.guess_type(ziel)[0]
        if typ:
            args += ["--attr", f"Content-Type={typ}"]
        args += [str(quelle), self._mc.target(ziel)]
        await self._mc.json_lines(*args)

        url = self._mc.url(ziel)
        zeilen = [
            f"Uploaded: {ziel} ({_lesbar(groesse)}{f', {typ}' if typ else ''})",
            f"URL: {url}",
        ]
        if typ and typ.startswith("image/"):
            beschriftung = Path(ziel).stem.replace("-", " ").replace("_", " ")
            zeilen.append(f"Show in chat: ![{beschriftung}]({url})")
        return "\n".join(zeilen)

    def _quelle_pruefen(self, quelle: Path) -> str | None:
        if not quelle.exists():
            return f"{quelle} does not exist."
        if not quelle.is_file():
            return f"{quelle} is not a file."

        aufgeloest = quelle.resolve()
        if self._local_root is not None:
            wurzel = self._local_root.resolve()
            if not aufgeloest.is_relative_to(wurzel):
                return (
                    f"Uploads are restricted to {wurzel} -- "
                    f"{quelle} is outside it."
                )
        for muster, grund in GESPERRTE_QUELLEN:
            if muster.search(str(aufgeloest)):
                logger.warning("Upload abgelehnt (%s): %s", grund, aufgeloest)
                return (
                    f"Rejected: {quelle.name} looks like {grund}. The bucket is "
                    "publicly readable -- something like that does not belong in it."
                )

        groesse = quelle.stat().st_size
        if groesse > self._max_bytes:
            return (
                f"{quelle.name} is {_lesbar(groesse)}, the limit is "
                f"{_lesbar(self._max_bytes)}."
            )
        return None


class StorageListTool(_StorageTool):
    name = "storage_list"
    description = (
        "Shows what is in your own storage -- with size, date, and public "
        "URL. Use this before overwriting or deleting anything, and to find a "
        "file you stored earlier."
    )
    parameters = {
        "type": "object",
        "properties": {
            "prefix": {
                "type": "string",
                "description": "Only this subfolder, e.g. 'diagrams/'",
            },
            "limit": {
                "type": "integer",
                "description": "At most this many (default 100)",
            },
        },
        "required": [],
    }

    async def run(self, prefix: str = "", limit: int = 100) -> str:
        try:
            # mc liefert die Namen *relativ* zum aufgelisteten Ordner -- fuer
            # Anzeige und URL muss der Ordner wieder davor.
            basis = self._mc.key(prefix).rstrip("/") if prefix else ""
            eintraege = await self._mc.json_lines(
                "ls", "--recursive", self._mc.target(basis)
            )
        except McError as exc:
            raise ToolError(_bucket_hinweis(str(exc), self._mc)) from exc

        dateien = [e for e in eintraege if e.get("key")]
        if not dateien:
            wo = f" under {prefix!r}" if prefix else ""
            return f"Storage is empty{wo}."

        grenze = max(1, min(int(limit), 500))
        gesamt = sum(int(e.get("size") or 0) for e in dateien)
        zeilen = [
            f"{len(dateien)} file(s), {_lesbar(gesamt)} total "
            f"under {self._mc.public_base}/{self._mc.bucket}/",
            "",
        ]
        for nummer, eintrag in enumerate(dateien[:grenze], start=1):
            schluessel = str(eintrag["key"]).lstrip("/")
            if basis and not schluessel.startswith(f"{basis}/"):
                schluessel = f"{basis}/{schluessel}"
            datum = str(eintrag.get("lastModified", ""))[:16].replace("T", " ")
            groesse = _lesbar(int(eintrag.get("size") or 0))
            zeilen.append(f"{nummer}. {schluessel} — {groesse} — {datum}")
            zeilen.append(f"   {self._mc.url(schluessel)}")
        if len(dateien) > grenze:
            zeilen.append(f"\n[... {len(dateien) - grenze} more]")
        return truncate("\n".join(zeilen), MAX_CHARS)


class StorageGetTool(_StorageTool):
    name = "storage_get"
    description = (
        "Reads a file back from your own storage. Text files come straight "
        "into the answer; for binary files you get size, type, and URL. With "
        "'local_path' you download it to the machine instead, to keep working "
        "with it."
    )
    parameters = {
        "type": "object",
        "properties": {
            "key": {
                "type": "string",
                "description": "Name in storage or the full URL",
            },
            "local_path": {
                "type": "string",
                "description": "Where to save on the machine (instead of showing it)",
            },
            "max_chars": {
                "type": "integer",
                "description": f"Upper limit when displaying (default {MAX_CHARS})",
            },
        },
        "required": ["key"],
    }

    async def run(
        self, key: str, local_path: str | None = None, max_chars: int = MAX_CHARS
    ) -> str:
        try:
            schluessel = self._mc.key(key)
            ziel = self._mc.target(schluessel)
            infos = await self._mc.json_lines("stat", ziel)
        except McError as exc:
            raise ToolError(_bucket_hinweis(str(exc), self._mc)) from exc

        info = infos[0] if infos else {}
        groesse = int(info.get("size") or 0)
        typ = str((info.get("metadata") or {}).get("Content-Type", "")).split(";")[0]
        kopf = (
            f"{schluessel} — {_lesbar(groesse)}{f', {typ}' if typ else ''}\n"
            f"{self._mc.url(schluessel)}"
        )

        if local_path:
            ziel_lokal = Path(local_path).expanduser()
            try:
                await self._mc.json_lines("cp", "--quiet", ziel, str(ziel_lokal))
            except McError as exc:
                raise ToolError(f"{kopf}\n\nDownload failed: {exc}") from exc
            return f"{kopf}\n\nSaved to {ziel_lokal}."

        if typ and not TEXTARTIG.search(typ):
            return (
                f"{kopf}\n\n{typ} is not a text file -- I will not show it as "
                "text. Use the URL, or fetch it to the machine with 'local_path'."
            )
        grenze = max(200, min(int(max_chars), MAX_CHARS))
        if groesse > grenze * 4:
            return (
                f"{kopf}\n\nToo large to display ({_lesbar(groesse)} against a "
                f"limit of {grenze} characters). Raise 'max_chars' or fetch it "
                "to the machine with 'local_path'."
            )

        try:
            code, aus, fehler = await self._mc.run("cat", ziel)
        except McError as exc:
            raise ToolError(f"{kopf}\n\n{exc}") from exc
        if code != 0:
            raise ToolError(f"{kopf}\n\nRead failed: {_stderr_kurz(fehler)}")
        return f"{kopf}\n\n{truncate(aus, grenze)}"


class StorageDeleteTool(_StorageTool):
    name = "storage_delete"
    description = (
        "Deletes a file from your own storage. Permanent -- if unsure, check "
        "with storage_list first. With recursive=true you delete a whole "
        "subfolder; emptying storage entirely is not possible through this "
        "tool."
    )
    parameters = {
        "type": "object",
        "properties": {
            "key": {
                "type": "string",
                "description": "Name in storage or the full URL",
            },
            "recursive": {
                "type": "boolean",
                "description": "Delete the subfolder and its contents (default false)",
            },
        },
        "required": ["key"],
    }

    async def run(self, key: str, recursive: bool = False) -> str:
        try:
            schluessel = self._mc.key(key)
        except McError as exc:
            raise ToolError(str(exc)) from exc

        args = ["rm", "--force"]
        if recursive:
            args.append("--recursive")

        try:
            zeilen = await self._mc.json_lines(*args, self._mc.target(schluessel))
        except McError as exc:
            raise ToolError(_bucket_hinweis(str(exc), self._mc)) from exc

        entfernt = [z for z in zeilen if z.get("key")]
        if recursive:
            if not entfernt:
                return f"Nothing was under {schluessel}/ -- nothing deleted."
            return f"Deleted: {len(entfernt)} object(s) under {schluessel}/."
        return f"Deleted: {schluessel}."


# ---------------------------------------------------------------------- #


def _fehlertext(eintrag: dict[str, Any]) -> str:
    fehler = eintrag.get("error") or {}
    meldung = fehler.get("message") or "mc reports an error."
    ursache = (fehler.get("cause") or {}).get("message")
    return f"{meldung} ({ursache})" if ursache and ursache != meldung else str(meldung)


def _stderr_kurz(fehler: str) -> str:
    zeilen = [z.strip() for z in fehler.splitlines() if z.strip()]
    return zeilen[0][:300] if zeilen else ""


def _bucket_hinweis(meldung: str, mc: McClient) -> str:
    """Fehlender Bucket ist der Fehler beim ersten Mal -- mit Loesung statt Ratlosigkeit.

    Nur auf Bucket-Ebene: ein fehlendes *Objekt* ist ein ganz normaler Fund,
    da waere der Einrichtungshinweis eine falsche Faehrte.
    """
    tief = meldung.lower()
    bucket_weg = "bucket does not exist" in tief or "bucket not found" in tief
    if bucket_weg:
        return (
            f"{meldung}\n\nStorage is not set up yet. "
            f"One-time setup:\n"
            f"  mc mb {mc.alias}/{mc.bucket}\n"
            f"  mc anonymous set download {mc.alias}/{mc.bucket}"
        )
    return meldung


def _lesbar(bytes_: int) -> str:
    if bytes_ < 1024:
        return f"{bytes_} B"
    if bytes_ < 1024 * 1024:
        return f"{bytes_ / 1024:.1f} KB"
    return f"{bytes_ / (1024 * 1024):.1f} MB"


def create_mc_client(settings: Any) -> McClient | None:
    """Der Zugang zum Bucket -- None, wenn ``mc`` nicht auf dem Rechner liegt.

    Eigene Funktion, weil ihn zwei Seiten brauchen: die Speicher-Werkzeuge
    und die Bilderzeugung, die ihr Ergebnis in dieselbe Ablage legt. Zwei
    Clients waeren zwei Wahrheiten ueber denselben Bucket.
    """
    pfad = shutil.which(settings.storage_mc_binary)
    if pfad is None:
        logger.info(
            "%r nicht gefunden -- kein Bucket-Zugang",
            settings.storage_mc_binary,
        )
        return None

    return McClient(
        binary=pfad,
        alias=settings.storage_alias,
        bucket=settings.storage_bucket,
        prefix=settings.storage_prefix,
        public_base=settings.storage_public_base,
        config_dir=settings.storage_config_dir,
        timeout=settings.storage_timeout,
    )


def create_storage_tools(settings: Any, mc: McClient | None = None) -> list[LocalTool]:
    """Ohne ``mc`` auf dem Rechner gibt es die Werkzeuge schlicht nicht."""
    mc = mc or create_mc_client(settings)
    if mc is None:
        return []

    logger.info("Speicher: %s -> %s/%s/", mc.target(), mc.public_base, mc.bucket)
    return [
        StoragePutTool(
            mc,
            max_inline=settings.storage_max_inline,
            max_bytes=settings.storage_max_bytes,
            local_root=settings.storage_local_root,
        ),
        StorageListTool(mc),
        StorageGetTool(mc),
        StorageDeleteTool(mc),
    ]
