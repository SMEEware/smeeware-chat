from __future__ import annotations

import json
import mimetypes
import os
import re
import shutil
import time
import uuid
from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any

from src.core.exceptions import ConflictError, FileTooLargeError, NotFoundError, ValidationError

FILE_ID = re.compile(r"^[0-9a-f]{32}$")
CHAT_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
UPLOAD_URL = re.compile(r"/api/(?:v1/)?uploads/([0-9a-f]{32})(?![0-9a-f])")
MEDIA_TYPE = re.compile(r"^[a-z0-9!#$&^_.+-]+/[a-z0-9!#$&^_.+-]+$")
CHUNK_SIZE = 1024 * 1024

RASTER_SUFFIXES = {
    "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/gif": ".gif",
}
LEGACY_TYPES = {
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".webp": "image/webp", ".gif": "image/gif", ".mp3": "audio/mpeg",
    ".wav": "audio/wav", ".ogg": "audio/ogg", ".m4a": "audio/mp4", ".flac": "audio/flac",
}


@dataclass(frozen=True, slots=True)
class StoredUpload:
    id: str
    filename: str
    media_type: str
    bytes: int
    path: Path
    chat_id: str | None = None


def referenced_upload_ids(messages: Sequence[dict[str, Any]], *, include_links: bool = True) -> list[str]:
    """Extract file references, ignoring IDs of the old browser-only text attachments."""
    identifiers: list[str] = []
    for message in messages:
        for attachment in message.get("attachments") or ():
            if isinstance(attachment, dict) and attachment.get("kind") in ("file", "image"):
                identifier = attachment.get("id")
                if isinstance(identifier, str) and FILE_ID.fullmatch(identifier):
                    identifiers.append(identifier)
        if not include_links:
            continue
        texts = [message.get("content")]
        for part in message.get("parts") or ():
            if isinstance(part, dict):
                texts.append(part.get("text"))
        for text in texts:
            if isinstance(text, str):
                identifiers.extend(UPLOAD_URL.findall(text))
    return list(dict.fromkeys(identifiers))


class UploadStore:
    """Original bytes and persistent per-chat metadata, separate from agent working copies."""

    def __init__(self, root: Path, max_bytes: int = 20_000_000, max_files: int = 8) -> None:
        self.root = Path(root).expanduser().resolve()
        self.max_bytes = max_bytes
        self.max_files = max_files

    @property
    def work_root(self) -> Path:
        return self.root / ".work"

    async def save(
        self, filename: str, media_type: str, read: Callable[[int], Awaitable[bytes]],
    ) -> StoredUpload:
        name = _filename(filename)
        kind = _media_type(media_type, name)
        identifier = uuid.uuid4().hex
        self._ensure_root()
        path = self.root / f"{identifier}{_suffix(name, kind)}"
        total = 0
        prefix = b""
        try:
            with path.open("xb") as output:
                while chunk := await read(CHUNK_SIZE):
                    total += len(chunk)
                    if total > self.max_bytes:
                        raise FileTooLargeError(name, self.max_bytes)
                    if not prefix:
                        prefix = chunk[:16]
                    output.write(chunk)
            if total == 0:
                raise ValidationError(f"{name} is empty.")
            if kind == "application/octet-stream":
                detected = _raster_type(prefix)
                if detected:
                    kind = detected
                    destination = self.root / f"{identifier}{RASTER_SUFFIXES[kind]}"
                    path.rename(destination)
                    path = destination
            result = StoredUpload(identifier, name, kind, total, path)
            self._record(result)
            return result
        except BaseException:
            path.unlink(missing_ok=True)
            self._metadata_path(identifier).unlink(missing_ok=True)
            raise

    def register(
        self, path: Path, filename: str | None = None, media_type: str | None = None,
        chat_id: str | None = None,
    ) -> StoredUpload:
        source = Path(path).expanduser().resolve()
        if not source.is_file():
            raise NotFoundError("The exported file does not exist.")
        if chat_id is not None:
            _checked_chat(chat_id)
        name = _filename(filename or source.name)
        kind = _media_type(media_type or "", name)
        if source.stat().st_size > self.max_bytes:
            raise FileTooLargeError(name, self.max_bytes)
        self._ensure_root()
        identifier = uuid.uuid4().hex
        destination = self.root / f"{identifier}{_suffix(name, kind)}"
        total = 0
        try:
            with source.open("rb") as input_file, destination.open("xb") as output:
                while chunk := input_file.read(CHUNK_SIZE):
                    total += len(chunk)
                    if total > self.max_bytes:
                        raise FileTooLargeError(name, self.max_bytes)
                    output.write(chunk)
            result = StoredUpload(identifier, name, kind, total, destination, chat_id)
            self._record(result)
            return result
        except BaseException:
            destination.unlink(missing_ok=True)
            self._metadata_path(identifier).unlink(missing_ok=True)
            raise

    def get(self, file_id: str) -> StoredUpload:
        _checked_file(file_id)
        metadata = self._metadata_path(file_id)
        if metadata.is_file() and not metadata.is_symlink():
            try:
                data = json.loads(metadata.read_text(encoding="utf-8"))
                storage_name = data["storage_name"]
                if not isinstance(storage_name, str) or not re.fullmatch(rf"{file_id}\.[A-Za-z0-9]{{1,16}}", storage_name):
                    raise ValueError("Invalid stored path")
                path = self._existing_path(self.root / storage_name)
                return StoredUpload(
                    file_id, _filename(data["filename"]),
                    _media_type(data["media_type"], data["filename"]),
                    path.stat().st_size, path, data.get("chat_id"),
                )
            except (OSError, ValueError, KeyError, TypeError) as exc:
                raise NotFoundError("Attachment not found.") from exc
        # Prior releases generated UUID raster images and speech without sidecars.
        for candidate in sorted(self.root.glob(f"{file_id}.*")):
            media_type = LEGACY_TYPES.get(candidate.suffix.lower())
            if media_type is None:
                continue
            try:
                path = self._existing_path(candidate)
            except NotFoundError:
                continue
            return StoredUpload(file_id, candidate.name, media_type, path.stat().st_size, path)
        raise NotFoundError("Attachment not found.")

    def bind(self, file_ids: Sequence[str], chat_id: str) -> list[StoredUpload]:
        _checked_chat(chat_id)
        files = [self.get(identifier) for identifier in dict.fromkeys(file_ids)]
        for file in files:
            if file.chat_id is not None and file.chat_id != chat_id:
                raise ConflictError("This attachment belongs to another chat.")
        bound = [replace(file, chat_id=chat_id) for file in files]
        for file in bound:
            self._record(file)
        work = self.work_root / chat_id
        if not self.work_root.is_symlink() and not work.is_symlink() and work.is_dir():
            work.touch()
        return bound

    def delete(self, file_id: str) -> None:
        file = self.get(file_id)
        file.path.unlink(missing_ok=True)
        self._metadata_path(file_id).unlink(missing_ok=True)

    def delete_chat(self, chat_id: str) -> None:
        _checked_chat(chat_id)
        for file in self._recorded_files():
            if file.chat_id == chat_id:
                self.delete(file.id)
        self._delete_work(chat_id)

    def delete_bound(self) -> None:
        """Delete all conversation data, including scopes that never reached chat history."""
        for file in self._recorded_files():
            if file.chat_id is not None:
                self.delete(file.id)
        for work in self._workspaces():
            self._delete_work(work.name)

    def cleanup_orphans(self, existing_chat_ids: set[str], max_age: float = 86400) -> None:
        cutoff = time.time() - max_age
        activity: dict[str, float] = {}
        for file in self._recorded_files():
            if file.chat_id is not None and CHAT_ID.fullmatch(file.chat_id):
                modified = self._metadata_path(file.id).stat().st_mtime
                activity[file.chat_id] = max(activity.get(file.chat_id, 0), modified)
        for work in self._workspaces():
            activity[work.name] = max(activity.get(work.name, 0), self._work_activity(work))
        for chat_id, modified in activity.items():
            if chat_id not in existing_chat_ids and modified < cutoff:
                self.delete_chat(chat_id)

    def _delete_work(self, chat_id: str) -> None:
        work = self.work_root / chat_id
        if self.work_root.is_symlink():
            return
        if work.is_symlink():
            work.unlink()
        elif work.is_dir():
            shutil.rmtree(work)

    def _workspaces(self) -> list[Path]:
        if self.work_root.is_symlink() or not self.work_root.is_dir():
            return []
        return [
            path for path in self.work_root.iterdir()
            if CHAT_ID.fullmatch(path.name) and not path.is_symlink() and path.is_dir()
        ]

    @staticmethod
    def _work_activity(work: Path) -> float:
        modified = work.stat().st_mtime
        for current, folders, names in os.walk(work, followlinks=False):
            folders[:] = [name for name in folders if not (Path(current) / name).is_symlink()]
            for name in folders + names:
                path = Path(current) / name
                if not path.is_symlink():
                    modified = max(modified, path.stat().st_mtime)
        return modified

    def cleanup_unbound(self, max_age: float = 86400) -> None:
        cutoff = time.time() - max_age
        for file in self._recorded_files():
            metadata = self._metadata_path(file.id)
            if file.chat_id is None and metadata.stat().st_mtime < cutoff:
                self.delete(file.id)

    def _recorded_files(self) -> list[StoredUpload]:
        files: list[StoredUpload] = []
        for metadata in (self.root / ".metadata").glob("*.json"):
            if not FILE_ID.fullmatch(metadata.stem):
                continue
            try:
                files.append(self.get(metadata.stem))
            except NotFoundError:
                continue
        return files

    def _ensure_root(self) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        metadata = self.root / ".metadata"
        if metadata.is_symlink():
            raise ValidationError("The upload metadata directory is invalid.")
        metadata.mkdir(exist_ok=True)

    def _metadata_path(self, file_id: str) -> Path:
        return self.root / ".metadata" / f"{file_id}.json"

    def _record(self, file: StoredUpload) -> None:
        self._ensure_root()
        metadata = self._metadata_path(file.id)
        temporary = metadata.with_name(f"{file.id}.{uuid.uuid4().hex}.tmp")
        try:
            temporary.write_text(json.dumps({
                "filename": file.filename, "media_type": file.media_type,
                "bytes": file.bytes, "storage_name": file.path.name,
                "chat_id": file.chat_id,
            }, ensure_ascii=False), encoding="utf-8")
            temporary.replace(metadata)
        finally:
            temporary.unlink(missing_ok=True)

    def _existing_path(self, path: Path) -> Path:
        if path.is_symlink() or not path.is_file() or path.resolve().parent != self.root:
            raise NotFoundError("Attachment not found.")
        return path


def _filename(value: str) -> str:
    name = value.replace("\\", "/").rsplit("/", 1)[-1]
    # Multipart clients encode control characters; retain ordinary literal % text.
    name = re.sub(r"%(?:0[0-9a-f]|1[0-9a-f]|7f)", "", name, flags=re.I)
    name = "".join(character for character in name if ord(character) >= 32 and ord(character) != 127)
    name = name.strip()[:255]
    return name if name not in ("", ".", "..") else "file"


def _media_type(value: str, filename: str) -> str:
    supplied = value.split(";", 1)[0].strip().lower()
    if supplied and MEDIA_TYPE.fullmatch(supplied):
        return supplied
    return mimetypes.guess_type(filename)[0] or "application/octet-stream"


def _suffix(filename: str, media_type: str) -> str:
    if media_type in RASTER_SUFFIXES:
        return RASTER_SUFFIXES[media_type]
    suffix = Path(filename).suffix.lower()
    return suffix if re.fullmatch(r"\.[a-z0-9]{1,16}", suffix) else ".bin"


def _checked_file(file_id: str) -> None:
    if not FILE_ID.fullmatch(file_id):
        raise ValidationError("Invalid file id.")


def _checked_chat(chat_id: str) -> None:
    if not CHAT_ID.fullmatch(chat_id):
        raise ValidationError("Invalid chat id.")


def _raster_type(prefix: bytes) -> str | None:
    if prefix.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if prefix.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if prefix.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif"
    if prefix[:4] == b"RIFF" and prefix[8:12] == b"WEBP":
        return "image/webp"
    return None
