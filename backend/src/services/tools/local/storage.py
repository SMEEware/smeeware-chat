from __future__ import annotations

import asyncio
import json
import mimetypes
import os
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

BLOCKED_SOURCES: tuple[tuple[re.Pattern[str], str], ...] = (
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

TEXT_LIKE = re.compile(
    r"^text/|^application/(json|xml|javascript|x-yaml|x-sh|sql|toml)|\+xml$|\+json$",
    re.I,
)


class McError(ToolError):
    ...


class McClient:
    def __init__(
        self,
        *,
        binary: str = "mc",
        alias: str = "smeeware",
        bucket: str = "llm",
        prefix: str = "",
        public_base: str = "",
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


    def key(self, raw: str) -> str:
        name = (raw or "").strip().replace("\\", "/")
        if not name:
            raise McError("No file name given.")

        for prefix in (f"{self.public_base}/", f"{self.alias}/"):
            if name.startswith(prefix):
                rest = name[len(prefix) :].lstrip("/")
                if not rest.startswith(f"{self.bucket}/"):
                    other_bucket = rest.split("/", 1)[0]
                    raise McError(
                        f"{raw!r} points at the bucket {other_bucket!r}. This tool "
                        f"only serves {self.alias}/{self.bucket}."
                    )
                name = rest[len(self.bucket) + 1 :]
                break
        else:
            if name.startswith(f"{self.bucket}/"):
                name = name[len(self.bucket) + 1 :]

        name = name.lstrip("/")
        parts = [t for t in name.split("/") if t not in ("", ".")]
        if any(t == ".." for t in parts):
            raise McError(f"{raw!r} points outside the bucket -- rejected.")
        if any(ord(z) < 32 for z in name):
            raise McError("Control character in the file name -- rejected.")
        if not parts:
            raise McError(f"{raw!r} does not resolve to a file name.")

        name = "/".join(parts)
        if len(name) > 512:
            raise McError("File name longer than 512 characters.")
        return name

    def target(self, key: str = "") -> str:
        parts = [self.alias, self.bucket]
        if self.prefix:
            parts.append(self.prefix)
        if key:
            parts.append(key)
        return "/".join(parts)

    def url(self, key: str) -> str:
        path = f"{self.prefix}/{key}" if self.prefix else key
        return f"{self.public_base}/{self.bucket}/{quote(path)}"


    async def run(
        self, *args: str, timeout: float | None = None
    ) -> tuple[int, str, str]:
        argv = [self.binary, "--no-color"]
        if self.config_dir:
            argv += ["--config-dir", str(self.config_dir)]
        argv += list(args)

        logger.info("mc %s", " ".join(args))
        try:
            process = await asyncio.create_subprocess_exec(
                *argv,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
        except FileNotFoundError as exc:
            raise McError(f"{self.binary!r} not found: {exc}") from exc

        cap = timeout if timeout is not None else self.timeout
        try:
            if cap and cap > 0:
                stdout, error = await asyncio.wait_for(
                    process.communicate(), timeout=cap
                )
            else:
                stdout, error = await process.communicate()
        except TimeoutError:
            process.kill()
            await process.wait()
            raise McError(
                f"mc ran longer than {cap:.0f}s and was aborted."
            ) from None
        except asyncio.CancelledError:
            process.kill()
            raise

        return (
            process.returncode or 0,
            stdout.decode("utf-8", "replace"),
            error.decode("utf-8", "replace"),
        )

    async def json_lines(
        self, *args: str, timeout: float | None = None
    ) -> list[dict[str, Any]]:
        code, stdout, error = await self.run(*args, "--json", timeout=timeout)
        lines: list[dict[str, Any]] = []
        for row in stdout.splitlines():
            if not (row := row.strip()):
                continue
            try:
                lines.append(json.loads(row))
            except json.JSONDecodeError:
                continue

        if failed := [z for z in lines if z.get("status") == "error"]:
            raise McError(_error_text(failed[0]))
        if code != 0:
            raise McError(_short_stderr(error) or f"mc exited with code {code}.")
        return lines


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
                source = Path(local_path).expanduser()
                if error := self._check_source(source):
                    raise ToolError(error)
                target = self._mc.key(key or source.name)
                return await self._upload(
                    source, target, content_type, source.stat().st_size
                )

            if not key:
                raise ToolError("For 'content' I need a 'key' -- under what name?")
            if len(content) > self._max_inline:
                raise ToolError(
                    f"'content' is {len(content)} characters long, the limit is "
                    f"{self._max_inline}. Write the file to disk first and then "
                    "use 'local_path'."
                )
            target = self._mc.key(key)
            with tempfile.NamedTemporaryFile(
                "w", suffix=Path(target).suffix or ".txt", delete=False, encoding="utf-8"
            ) as file:
                file.write(content)
                temp = Path(file.name)
            try:
                return await self._upload(
                    temp, target, content_type, len(content.encode())
                )
            finally:
                temp.unlink(missing_ok=True)
        except McError as exc:
            raise ToolError(_bucket_hint(str(exc), self._mc)) from exc

    async def _upload(
        self, source: Path, target: str, content_type: str | None, size: int
    ) -> str:
        args = ["cp", "--quiet"]
        kind = content_type or mimetypes.guess_type(target)[0]
        if kind:
            args += ["--attr", f"Content-Type={kind}"]
        args += [str(source), self._mc.target(target)]
        await self._mc.json_lines(*args)

        url = self._mc.url(target)
        lines = [
            f"Uploaded: {target} ({_readable_size(size)}{f', {kind}' if kind else ''})",
            f"URL: {url}",
        ]
        if kind and kind.startswith("image/"):
            caption = Path(target).stem.replace("-", " ").replace("_", " ")
            lines.append(f"Show in chat: ![{caption}]({url})")
        return "\n".join(lines)

    def _check_source(self, source: Path) -> str | None:
        if not source.exists():
            return f"{source} does not exist."
        if not source.is_file():
            return f"{source} is not a file."

        resolved = source.resolve()
        if self._local_root is not None:
            root = self._local_root.resolve()
            if not resolved.is_relative_to(root):
                return (
                    f"Uploads are restricted to {root} -- "
                    f"{source} is outside it."
                )
        for pattern, reason in BLOCKED_SOURCES:
            if pattern.search(str(resolved)):
                logger.warning("Upload rejected (%s): %s", reason, resolved)
                return (
                    f"Rejected: {source.name} looks like {reason}. The bucket is "
                    "publicly readable -- something like that does not belong in it."
                )

        size = source.stat().st_size
        if size > self._max_bytes:
            return (
                f"{source.name} is {_readable_size(size)}, the limit is "
                f"{_readable_size(self._max_bytes)}."
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
            basis = self._mc.key(prefix).rstrip("/") if prefix else ""
            entries = await self._mc.json_lines(
                "ls", "--recursive", self._mc.target(basis)
            )
        except McError as exc:
            raise ToolError(_bucket_hint(str(exc), self._mc)) from exc

        files = [e for e in entries if e.get("key")]
        if not files:
            where = f" under {prefix!r}" if prefix else ""
            return f"Storage is empty{where}."

        cap = max(1, min(int(limit), 500))
        total = sum(int(e.get("size") or 0) for e in files)
        lines = [
            f"{len(files)} file(s), {_readable_size(total)} total "
            f"under {self._mc.public_base}/{self._mc.bucket}/",
            "",
        ]
        for number, entry in enumerate(files[:cap], start=1):
            object_key = str(entry["key"]).lstrip("/")
            if basis and not object_key.startswith(f"{basis}/"):
                object_key = f"{basis}/{object_key}"
            date = str(entry.get("lastModified", ""))[:16].replace("T", " ")
            size = _readable_size(int(entry.get("size") or 0))
            lines.append(f"{number}. {object_key} — {size} — {date}")
            lines.append(f"   {self._mc.url(object_key)}")
        if len(files) > cap:
            lines.append(f"\n[... {len(files) - cap} more]")
        return truncate("\n".join(lines), MAX_CHARS)


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
            object_key = self._mc.key(key)
            target = self._mc.target(object_key)
            infos = await self._mc.json_lines("stat", target)
        except McError as exc:
            raise ToolError(_bucket_hint(str(exc), self._mc)) from exc

        info = infos[0] if infos else {}
        size = int(info.get("size") or 0)
        kind = str((info.get("metadata") or {}).get("Content-Type", "")).split(";")[0]
        head = (
            f"{object_key} — {_readable_size(size)}{f', {kind}' if kind else ''}\n"
            f"{self._mc.url(object_key)}"
        )

        if local_path:
            target_local = Path(local_path).expanduser()
            try:
                await self._mc.json_lines("cp", "--quiet", target, str(target_local))
            except McError as exc:
                raise ToolError(f"{head}\n\nDownload failed: {exc}") from exc
            return f"{head}\n\nSaved to {target_local}."

        if kind and not TEXT_LIKE.search(kind):
            return (
                f"{head}\n\n{kind} is not a text file -- I will not show it as "
                "text. Use the URL, or fetch it to the machine with 'local_path'."
            )
        cap = max(200, min(int(max_chars), MAX_CHARS))
        if size > cap * 4:
            return (
                f"{head}\n\nToo large to display ({_readable_size(size)} against a "
                f"limit of {cap} characters). Raise 'max_chars' or fetch it "
                "to the machine with 'local_path'."
            )

        try:
            code, stdout, error = await self._mc.run("cat", target)
        except McError as exc:
            raise ToolError(f"{head}\n\n{exc}") from exc
        if code != 0:
            raise ToolError(f"{head}\n\nRead failed: {_short_stderr(error)}")
        return f"{head}\n\n{truncate(stdout, cap)}"


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
            object_key = self._mc.key(key)
        except McError as exc:
            raise ToolError(str(exc)) from exc

        args = ["rm", "--force"]
        if recursive:
            args.append("--recursive")

        try:
            lines = await self._mc.json_lines(*args, self._mc.target(object_key))
        except McError as exc:
            raise ToolError(_bucket_hint(str(exc), self._mc)) from exc

        removed = [z for z in lines if z.get("key")]
        if recursive:
            if not removed:
                return f"Nothing was under {object_key}/ -- nothing deleted."
            return f"Deleted: {len(removed)} object(s) under {object_key}/."
        return f"Deleted: {object_key}."


def _error_text(entry: dict[str, Any]) -> str:
    error = entry.get("error") or {}
    message = error.get("message") or "mc reports an error."
    cause = (error.get("cause") or {}).get("message")
    return f"{message} ({cause})" if cause and cause != message else str(message)


def _short_stderr(error: str) -> str:
    lines = [z.strip() for z in error.splitlines() if z.strip()]
    return lines[0][:300] if lines else ""


def _bucket_hint(message: str, mc: McClient) -> str:
    lowered = message.lower()
    bucket_missing = "bucket does not exist" in lowered or "bucket not found" in lowered
    if bucket_missing:
        return (
            f"{message}\n\nStorage is not set up yet. "
            f"One-time setup:\n"
            f"  mc mb {mc.alias}/{mc.bucket}\n"
            f"  mc anonymous set download {mc.alias}/{mc.bucket}"
        )
    return message


def _readable_size(bytes_: int) -> str:
    if bytes_ < 1024:
        return f"{bytes_} B"
    if bytes_ < 1024 * 1024:
        return f"{bytes_ / 1024:.1f} KB"
    return f"{bytes_ / (1024 * 1024):.1f} MB"


def create_mc_client(settings: Any) -> McClient | None:
    if not settings.storage_alias or not settings.storage_public_base:
        logger.info("STORAGE_ALIAS or STORAGE_PUBLIC_BASE missing -- no bucket access")
        return None

    path = shutil.which(settings.storage_mc_binary)
    if path is None:
        logger.info(
            "%r not found -- no bucket access",
            settings.storage_mc_binary,
        )
        return None

    if not _alias_configured(settings.storage_alias, settings.storage_config_dir):
        logger.info(
            "mc alias %r is not configured -- no bucket access",
            settings.storage_alias,
        )
        return None

    return McClient(
        binary=path,
        alias=settings.storage_alias,
        bucket=settings.storage_bucket,
        prefix=settings.storage_prefix,
        public_base=settings.storage_public_base,
        config_dir=settings.storage_config_dir,
        timeout=settings.storage_timeout,
    )


def create_storage_tools(settings: Any, mc: McClient | None = None) -> list[LocalTool]:
    mc = mc or create_mc_client(settings)
    if mc is None:
        return []

    logger.info("Storage: %s -> %s/%s/", mc.target(), mc.public_base, mc.bucket)
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


def _alias_configured(alias: str, config_dir: Path | None) -> bool:
    if os.getenv(f"MC_HOST_{alias}"):
        return True
    config = (config_dir or Path.home() / ".mc") / "config.json"
    try:
        aliases = json.loads(config.read_text()).get("aliases", {})
    except OSError:
        return False
    except ValueError:
        return True
    return alias in aliases
