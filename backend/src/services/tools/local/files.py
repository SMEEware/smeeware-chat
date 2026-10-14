from __future__ import annotations

import asyncio
import codecs
import mimetypes
import os
import re
import shutil
import stat
import tempfile
import uuid
import zipfile
from contextvars import ContextVar, Token
from dataclasses import dataclass
from pathlib import Path, PurePosixPath, PureWindowsPath
from typing import TYPE_CHECKING
from xml.etree import ElementTree

from src.services.tools.base import ToolError
from src.services.tools.local.base import LocalTool

if TYPE_CHECKING:
    from src.services.uploads.store import StoredUpload, UploadStore

MAX_READ_CHARS = 12_000
CHUNK_BYTES = 64 * 1024
CHAT_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


@dataclass(slots=True)
class FileContext:
    store: UploadStore
    chat_id: str
    file_ids: set[str]
    max_extracted_bytes: int = 100_000_000
    max_archive_members: int = 1000

    def __post_init__(self) -> None:
        if not CHAT_ID.fullmatch(self.chat_id):
            raise ValueError("Invalid conversation id for file tools.")
        if self.max_extracted_bytes < 1 or self.max_archive_members < 1:
            raise ValueError("Archive limits must be positive.")

    @property
    def work_dir(self) -> Path:
        return self.store.root / ".work" / self.chat_id


FILE_CONTEXT: ContextVar[FileContext | None] = ContextVar("file_context", default=None)


def set_file_context(context: FileContext | None) -> Token:
    return FILE_CONTEXT.set(context)


def reset_file_context(token: Token) -> None:
    FILE_CONTEXT.reset(token)


def _context() -> FileContext:
    context = FILE_CONTEXT.get()
    if context is None:
        raise ToolError("No uploaded files or file workspace are available in this conversation.")
    return context


def _no_symlinks(path: Path, boundary: Path) -> None:
    current = path
    while current != boundary:
        if current.is_symlink():
            raise ToolError("Symbolic links are not allowed in the file workspace.")
        if current.parent == current:
            raise ToolError("That path is outside this conversation's file workspace.")
        current = current.parent


def _work_path(context: FileContext, raw: str) -> Path:
    if not isinstance(raw, str) or not raw.strip():
        raise ToolError("Give a file path inside the conversation's file workspace.")
    if "\\" in raw or any(ord(char) < 32 for char in raw):
        raise ToolError("Invalid file path.")
    path = Path(raw)
    if ".." in path.parts or (PureWindowsPath(raw).drive and not path.is_absolute()):
        raise ToolError("That path is outside this conversation's file workspace.")
    root = context.work_dir
    candidate = path if path.is_absolute() else root / path
    if not candidate.is_relative_to(root):
        raise ToolError("That path is outside this conversation's file workspace.")
    _no_symlinks(candidate, context.store.root)
    if not candidate.resolve().is_relative_to(root.resolve()):
        raise ToolError("That path is outside this conversation's file workspace.")
    return candidate


def _attached(context: FileContext, file_id: str) -> StoredUpload:
    if file_id not in context.file_ids:
        raise ToolError("That upload is not attached to this conversation.")
    try:
        uploaded = context.store.get(file_id)
    except Exception as exc:
        raise ToolError("That uploaded file is no longer available.") from exc
    if uploaded.chat_id not in (None, context.chat_id):
        raise ToolError("That upload belongs to a different conversation.")
    if uploaded.path.is_symlink() or not uploaded.path.is_file():
        raise ToolError("That uploaded file is no longer available.")
    return uploaded


def _read_path(context: FileContext, raw: str) -> tuple[Path, str]:
    if raw in context.file_ids:
        uploaded = _attached(context, raw)
        return uploaded.path, uploaded.filename
    if Path(raw).is_absolute():
        for file_id in context.file_ids:
            uploaded = _attached(context, file_id)
            if str(uploaded.path) == raw:
                return uploaded.path, uploaded.filename
    path = _work_path(context, raw)
    if not path.is_file():
        raise ToolError("That file does not exist in this conversation's file workspace.")
    return path, path.name


def _regular_files(context: FileContext, directory: Path) -> list[Path]:
    result: list[Path] = []
    for current, folders, names in os.walk(directory, followlinks=False):
        for name in folders + names:
            path = Path(current) / name
            _work_path(context, str(path))
            if path.is_file():
                if not stat.S_ISREG(path.stat().st_mode):
                    raise ToolError("Only regular files can be read or exported.")
                result.append(path)
            elif not path.is_dir():
                raise ToolError("Only regular files and directories are allowed.")
    return sorted(result)


def _list_files() -> str:
    context = _context()
    lines = ["Attached originals (read-only):"]
    for file_id in sorted(context.file_ids):
        uploaded = _attached(context, file_id)
        lines.append(f"- {uploaded.filename} | id={uploaded.id} | {uploaded.bytes} bytes | {uploaded.media_type} | {uploaded.path}")
    if not context.file_ids:
        lines.append("(none)")
    root = _work_path(context, str(context.work_dir))
    lines.extend(["", f"Working directory: {root}"])
    if root.exists():
        paths = _regular_files(context, root)
        for path in paths[:1000]:
            lines.append(f"- {path.relative_to(root)} ({path.stat().st_size} bytes)")
        if len(paths) > 1000:
            lines.append(f"({len(paths) - 1000} additional files)")
        if not paths:
            lines.append("(empty)")
    else:
        lines.append("(empty)")
    return "\n".join(lines)


def _page(text: str, offset: int, max_chars: int, *, base_offset: int = 0) -> str:
    content = text[offset : offset + max_chars]
    remaining = max(0, len(text) - offset - len(content))
    suffix = f"\n\n[More content: call read_file with offset={base_offset + offset + len(content)}.]" if remaining else ""
    return f"{content}{suffix}"


def _xml_text(path: Path, name: str, context: FileContext) -> str:
    suffix = Path(name).suffix.lower()
    try:
        with zipfile.ZipFile(path) as archive:
            entries = archive.infolist()
            if len(entries) > context.max_archive_members:
                raise ToolError("This document has too many archive members.")
            if suffix == ".docx":
                wanted = [info for info in entries if info.filename == "word/document.xml" or re.fullmatch(r"word/(header|footer)\d+\.xml", info.filename)]
            elif suffix == ".pptx":
                wanted = sorted((info for info in entries if re.fullmatch(r"ppt/slides/slide\d+\.xml", info.filename)), key=lambda info: int(re.search(r"slide(\d+)\.xml", info.filename).group(1)))
            else:
                wanted = [info for info in entries if info.filename == "xl/sharedStrings.xml" or re.fullmatch(r"xl/worksheets/sheet\d+\.xml", info.filename)]
            total = 0
            texts: list[str] = []
            shared: list[str] = []
            for info in sorted(wanted, key=lambda item: item.filename != "xl/sharedStrings.xml"):
                data = bytearray()
                with archive.open(info) as source:
                    while chunk := source.read(CHUNK_BYTES):
                        total += len(chunk)
                        if total > context.max_extracted_bytes:
                            raise ToolError("Expanded document exceeds the configured archive size limit.")
                        data.extend(chunk)
                if b"<!DOCTYPE" in data.upper() or b"<!ENTITY" in data.upper():
                    raise ToolError("XML documents with entities are not supported.")
                tree = ElementTree.fromstring(data)
                if suffix == ".xlsx":
                    if info.filename == "xl/sharedStrings.xml":
                        shared = ["".join(node.itertext()) for node in tree if node.tag.rsplit("}", 1)[-1] == "si"]
                        continue
                    rows: list[str] = []
                    for row in tree.iter():
                        if row.tag.rsplit("}", 1)[-1] != "row":
                            continue
                        cells: list[str] = []
                        for cell in row:
                            if cell.tag.rsplit("}", 1)[-1] != "c":
                                continue
                            value = "".join(node.text or "" for node in cell.iter() if node.tag.rsplit("}", 1)[-1] in ("v", "t"))
                            if cell.get("t") == "s":
                                try:
                                    value = shared[int(value)]
                                except (ValueError, IndexError):
                                    value = "[invalid shared string]"
                            cells.append(f"{cell.get('r', '')}: {value}")
                        rows.append("\t".join(cells))
                    texts.append(f"{info.filename}\n" + "\n".join(rows))
                else:
                    texts.append("\n".join(node.text or "" for node in tree.iter() if node.tag.rsplit("}", 1)[-1] == "t"))
            if not texts:
                raise ToolError("No readable document text was found.")
            return "\n\n".join(texts)
    except (zipfile.BadZipFile, ElementTree.ParseError, RuntimeError) as exc:
        raise ToolError(f"Could not read this document: {exc}") from exc


def _read_file(path: str, offset: int, max_chars: int) -> str:
    context = _context()
    resolved, name = _read_path(context, path)
    if not stat.S_ISREG(resolved.stat().st_mode):
        raise ToolError("Only regular files can be read.")
    if offset < 0 or max_chars < 1:
        raise ToolError("offset must be non-negative and max_chars must be positive.")
    cap = min(max_chars, MAX_READ_CHARS)
    size = resolved.stat().st_size
    kind = mimetypes.guess_type(name)[0] or "application/octet-stream"
    head = f"{name} | {kind} | {size} bytes\n"
    suffix = Path(name).suffix.lower()
    if suffix in (".docx", ".xlsx", ".pptx"):
        return head + _page(_xml_text(resolved, name, context), offset, cap)
    if suffix == ".pdf":
        try:
            from pypdf import PdfReader
        except ImportError:
            raise ToolError("PDF text reading is unavailable because the PDF reader is not installed.")
        try:
            reader = PdfReader(resolved)
            if reader.is_encrypted:
                raise ToolError("Password-protected PDFs cannot be read.")
            text = "\n\n".join(page.extract_text() or "" for page in reader.pages)
        except ToolError:
            raise
        except Exception as exc:
            raise ToolError(f"Could not read this PDF: {exc}") from exc
        return head + (_page(text, offset, cap) if text.strip() else "No embedded text was found; scanned pages need image analysis/OCR.")
    with resolved.open("rb") as source:
        sample = source.read(4096)
    if suffix == ".zip" or zipfile.is_zipfile(resolved):
        try:
            with zipfile.ZipFile(resolved) as archive:
                names = "\n".join(f"{entry.filename} ({entry.file_size} expanded bytes)" for entry in archive.infolist()[:context.max_archive_members])
            return head + "Archive members (not extracted):\n" + _page(names, offset, cap)
        except zipfile.BadZipFile as exc:
            raise ToolError("This ZIP file is corrupt.") from exc
    encoding = "utf-8-sig"
    if sample.startswith((b"\xff\xfe", b"\xfe\xff")):
        encoding = "utf-16"
    binary = encoding != "utf-16" and (
        b"\0" in sample
        or sum(byte < 32 and byte not in (9, 10, 12, 13, 27) for byte in sample) > len(sample) * 0.1
    )
    try:
        codecs.getincrementaldecoder(encoding)(errors="strict").decode(sample, final=False)
    except UnicodeDecodeError:
        binary = True
    if binary:
        with resolved.open("rb") as source:
            source.seek(offset)
            data = source.read(min(cap // 3 or 1, 256))
        return head + f"Binary file; byte offset={offset}. Hex preview:\n{data.hex(' ')}\nUse a format-specific tool for analysis or editing."
    try:
        with resolved.open("r", encoding=encoding, newline="") as source:
            remaining = offset
            while remaining:
                skipped = source.read(min(remaining, CHUNK_BYTES))
                if not skipped:
                    break
                remaining -= len(skipped)
            text = source.read(cap + 1)
    except UnicodeDecodeError:
        raise ToolError("This file contains non-text bytes. It needs a format-specific reader.")
    return head + _page(text, 0, cap, base_offset=offset)


def _save_work_bytes(context: FileContext, path: str, data: bytes) -> Path:
    target = _work_path(context, path)
    if target == context.work_dir or target.is_dir():
        raise ToolError("Give a file name, not a directory.")
    if len(data) > context.store.max_bytes:
        raise ToolError(f"The file exceeds the {context.store.max_bytes} byte upload limit.")
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(dir=target.parent, prefix=".write-", delete=False) as output:
            temporary = Path(output.name)
            output.write(data)
        _work_path(context, str(target))
        temporary.replace(target)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
    return target


def _write_file(path: str, content: str) -> str:
    context = _context()
    data = content.encode("utf-8")
    target = _save_work_bytes(context, path, data)
    return f"Written: {target.relative_to(context.work_dir)} ({len(data)} bytes). Original uploads are unchanged."


def _bounded_bytes(context: FileContext, path: Path) -> bytes:
    if not path.is_file() or not stat.S_ISREG(path.stat().st_mode):
        raise ToolError("Only regular files can be copied or edited.")
    with path.open("rb") as source:
        data = source.read(context.store.max_bytes + 1)
    if len(data) > context.store.max_bytes:
        raise ToolError(f"The file exceeds the {context.store.max_bytes} byte upload limit.")
    return data


def _copy_file(source: str, path: str) -> str:
    context = _context()
    original, _ = _read_path(context, source)
    _work_path(context, path)
    data = _bounded_bytes(context, original)
    target = _save_work_bytes(context, path, data)
    return f"Copied: {target.relative_to(context.work_dir)} ({len(data)} bytes). Original uploads are unchanged."


def _edit_file(path: str, old_text: str, new_text: str, replace_all: bool) -> str:
    context = _context()
    target = _work_path(context, path)
    if not old_text:
        raise ToolError("old_text must not be empty.")
    data = _bounded_bytes(context, target)
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ToolError("Exact text edits require a UTF-8 working file.") from exc
    first = text.find(old_text)
    if first < 0:
        raise ToolError("old_text was not found; the working file is unchanged.")
    if not replace_all and text.find(old_text, first + 1) >= 0:
        raise ToolError("old_text matches more than once. Give a unique match or set replace_all=true.")
    count = text.count(old_text) if replace_all else 1
    resulting_bytes = len(data) + count * (len(new_text.encode("utf-8")) - len(old_text.encode("utf-8")))
    if resulting_bytes > context.store.max_bytes:
        raise ToolError(f"The edited file exceeds the {context.store.max_bytes} byte upload limit.")
    replacement = text.replace(old_text, new_text, count).encode("utf-8")
    _save_work_bytes(context, path, replacement)
    return f"Edited: {target.relative_to(context.work_dir)} ({count} replacement{'s' if count != 1 else ''}, {len(replacement)} bytes). Original uploads are unchanged."


def _archive_member(name: str) -> PurePosixPath:
    if not name or "\\" in name or any(ord(char) < 32 for char in name):
        raise ToolError("Archive contains an unsafe member path.")
    path = PurePosixPath(name)
    if path.is_absolute() or PureWindowsPath(name).drive or ".." in path.parts or not path.parts:
        raise ToolError("Archive contains a member outside its destination.")
    return path


def _extract_archive(path: str, destination: str | None) -> str:
    context = _context()
    source, name = _read_path(context, path)
    if not zipfile.is_zipfile(source):
        raise ToolError("Only ZIP archives are supported. This file is not a valid ZIP.")
    folder = destination or f"{Path(name).stem or 'archive'}-{uuid.uuid4().hex[:8]}"
    target = _work_path(context, folder)
    if target == context.work_dir or target.exists():
        raise ToolError("Extraction destination already exists. Choose a new working folder.")
    staging: Path | None = None
    try:
        with zipfile.ZipFile(source) as archive:
            members = archive.infolist()
            if len(members) > context.max_archive_members:
                raise ToolError(f"Archive exceeds the {context.max_archive_members} member limit.")
            paths: set[str] = set()
            for member in members:
                relative = _archive_member(member.filename)
                mode = member.external_attr >> 16
                if stat.S_ISLNK(mode) or (stat.S_IFMT(mode) not in (0, stat.S_IFREG, stat.S_IFDIR)):
                    raise ToolError("Archive contains a symbolic link or special file.")
                if member.flag_bits & 1:
                    raise ToolError("Password-protected ZIP archives are not supported.")
                key = str(relative)
                if key in paths:
                    raise ToolError("Archive contains duplicate member paths.")
                paths.add(key)
            if sum(member.file_size for member in members) > context.max_extracted_bytes:
                raise ToolError(f"Expanded archive exceeds the {context.max_extracted_bytes} byte limit.")
            target.parent.mkdir(parents=True, exist_ok=True)
            staging = Path(tempfile.mkdtemp(prefix=".extract-", dir=target.parent))
            expanded = 0
            for member in members:
                output_path = staging / str(_archive_member(member.filename))
                if member.is_dir():
                    output_path.mkdir(parents=True, exist_ok=True)
                    continue
                output_path.parent.mkdir(parents=True, exist_ok=True)
                with archive.open(member) as input_file, output_path.open("xb") as output:
                    while chunk := input_file.read(CHUNK_BYTES):
                        expanded += len(chunk)
                        if expanded > context.max_extracted_bytes:
                            raise ToolError(f"Expanded archive exceeds the {context.max_extracted_bytes} byte limit.")
                        output.write(chunk)
            _work_path(context, str(target))
            if target.exists():
                raise ToolError("Extraction destination already exists.")
            staging.rename(target)
            staging = None
        names = "\n".join(f"- {member.filename}" for member in members[:100])
        return f"Extracted {len(members)} members ({expanded} bytes) to {target.relative_to(context.work_dir)}.\n{names}"
    except ToolError:
        raise
    except (OSError, zipfile.BadZipFile, RuntimeError, NotImplementedError) as exc:
        raise ToolError(f"Archive extraction failed: {exc}") from exc
    finally:
        if staging is not None:
            shutil.rmtree(staging, ignore_errors=True)


def _export_file(path: str, filename: str | None) -> str:
    context = _context()
    source = _work_path(context, path)
    if not source.exists():
        raise ToolError("That working file or directory does not exist.")
    temporary: Path | None = None
    try:
        if source.is_dir():
            paths = _regular_files(context, source)
            if len(paths) > context.max_archive_members:
                raise ToolError(f"Export exceeds the {context.max_archive_members} file limit.")
            if sum(file.stat().st_size for file in paths) > context.max_extracted_bytes:
                raise ToolError("Export exceeds the expanded archive size limit.")
            name = filename or f"{source.name}.zip"
            context.work_dir.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(dir=context.work_dir, suffix=".zip", prefix=".export-", delete=False) as output:
                temporary = Path(output.name)
            with zipfile.ZipFile(temporary, "w", zipfile.ZIP_DEFLATED) as archive:
                for file in paths:
                    _work_path(context, str(file))
                    archive.write(file, file.relative_to(source).as_posix())
                    if temporary.stat().st_size > context.store.max_bytes:
                        raise ToolError("The exported ZIP exceeds the upload size limit.")
            source = temporary
        elif source.is_file() and stat.S_ISREG(source.stat().st_mode):
            name = filename or source.name
        else:
            raise ToolError("Only regular files or directories can be exported.")
        if source.stat().st_size > context.store.max_bytes:
            raise ToolError("The exported file exceeds the upload size limit.")
        uploaded = context.store.register(source, filename=name, chat_id=context.chat_id)
        context.file_ids.add(uploaded.id)
        label = uploaded.filename.replace("\\", "\\\\").replace("[", "\\[").replace("]", "\\]")
        return f"[{label}](/api/uploads/{uploaded.id}) ({uploaded.bytes} bytes)"
    except ToolError:
        raise
    except Exception as exc:
        raise ToolError(f"Could not export the file: {exc}") from exc
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


class ListFilesTool(LocalTool):
    name = "list_files"
    description = "List the original uploads and working files in this conversation. Originals are read-only; all edits stay in its working directory."

    async def run(self) -> str:
        return await asyncio.to_thread(_list_files)


class ReadFileTool(LocalTool):
    name = "read_file"
    description = "Read an attached upload by id/its original path, or a relative working file. Returns paged text, PDF/Office document text, ZIP member listing, or metadata and hex for unsupported binaries. offset counts characters for text or bytes for binary."
    parameters = {"type": "object", "properties": {
        "path": {"type": "string", "description": "Upload id, original upload path, or relative working file path"},
        "offset": {"type": "integer", "minimum": 0, "description": "Start position (default 0)"},
        "max_chars": {"type": "integer", "minimum": 1, "maximum": MAX_READ_CHARS, "description": "Maximum returned text characters (default 12000)"},
    }, "required": ["path"]}

    async def run(self, path: str, offset: int = 0, max_chars: int = MAX_READ_CHARS) -> str:
        return await asyncio.to_thread(_read_file, path, int(offset), int(max_chars))


class WriteFileTool(LocalTool):
    name = "write_file"
    description = "Create or replace a UTF-8 text working file. Use a relative path in this conversation's working directory. Uploaded originals cannot be modified. Export the result with export_file to give the user a download."
    parameters = {"type": "object", "properties": {
        "path": {"type": "string", "description": "Relative working path, e.g. project/main.py"},
        "content": {"type": "string", "description": "Complete new UTF-8 text content"},
    }, "required": ["path", "content"]}

    async def run(self, path: str, content: str) -> str:
        return await asyncio.to_thread(_write_file, path, content)


class CopyFileTool(LocalTool):
    name = "copy_file"
    description = "Copy an attached original or scoped working file byte-for-byte into a working path. Use this before editing a large original, or to export an unchanged binary. Original uploads remain immutable."
    parameters = {"type": "object", "properties": {
        "source": {"type": "string", "description": "Upload id/original path or relative working source file"},
        "path": {"type": "string", "description": "Destination relative working file path"},
    }, "required": ["source", "path"]}

    async def run(self, source: str, path: str) -> str:
        return await asyncio.to_thread(_copy_file, source, path)


class EditFileTool(LocalTool):
    name = "edit_file"
    description = "Replace exact text inside a UTF-8 working file without rewriting its untouched content. Use copy_file first for an uploaded original. By default old_text must match exactly once; absent or ambiguous matches fail without changing the file. Preserves existing BOM and line endings."
    parameters = {"type": "object", "properties": {
        "path": {"type": "string", "description": "Relative UTF-8 working file path"},
        "old_text": {"type": "string", "minLength": 1, "description": "Exact nonempty text to replace, including original line endings"},
        "new_text": {"type": "string", "description": "Replacement text (empty deletes the match)"},
        "replace_all": {"type": "boolean", "description": "Replace every non-overlapping occurrence (default false)"},
    }, "required": ["path", "old_text", "new_text"]}

    async def run(self, path: str, old_text: str, new_text: str, replace_all: bool = False) -> str:
        return await asyncio.to_thread(_edit_file, path, old_text, new_text, replace_all)


class ExtractArchiveTool(LocalTool):
    name = "extract_archive"
    description = "Safely extract an attached/working ZIP into a NEW working directory. Rejects unsafe paths, links, encrypted archives and archives exceeding expansion/member limits. Does not execute uploaded code."
    parameters = {"type": "object", "properties": {
        "path": {"type": "string", "description": "Upload id/original path or relative ZIP working path"},
        "destination": {"type": "string", "description": "New relative working folder (optional; otherwise generated)"},
    }, "required": ["path"]}

    async def run(self, path: str, destination: str | None = None) -> str:
        return await asyncio.to_thread(_extract_archive, path, destination)


class ExportFileTool(LocalTool):
    name = "export_file"
    description = "Give the user a download of a working file, or ZIP a whole working directory and return its download link. An explicit filename is preserved, including Office/other ZIP container extensions when rebuilding them. Does not require shell access or object storage."
    parameters = {"type": "object", "properties": {
        "path": {"type": "string", "description": "Relative working file or folder path"},
        "filename": {"type": "string", "description": "Suggested download filename (optional)"},
    }, "required": ["path"]}

    async def run(self, path: str, filename: str | None = None) -> str:
        return await asyncio.to_thread(_export_file, path, filename)


def create_file_tools() -> list[LocalTool]:
    return [ListFilesTool(), ReadFileTool(), WriteFileTool(), CopyFileTool(), EditFileTool(), ExtractArchiveTool(), ExportFileTool()]
