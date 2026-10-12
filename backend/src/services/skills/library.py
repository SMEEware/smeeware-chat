from __future__ import annotations

import asyncio
import re
import shutil
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from src.core.logging import get_logger
from src.services.tools.base import ToolError

logger = get_logger(__name__)

VALID_NAME = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")
FRONTMATTER = re.compile(r"^\s*---\s*\n(.*?)\n---\s*\n?(.*)$", re.S)
SKILL_FILE = "SKILL.md"
MAX_SKILL_BYTES = 100_000


class SkillError(ToolError):
    ...


@dataclass(frozen=True, slots=True)
class SkillMeta:
    name: str
    description: str
    source: str
    enabled: bool = True
    why: str = ""

    def row(self) -> str:
        marker = "" if self.enabled else " [in quarantine, disabled]"
        return f"- {self.name}: {self.description}{marker}"


@dataclass(frozen=True, slots=True)
class Skill:
    meta: SkillMeta
    body: str
    files: tuple[str, ...] = ()


@dataclass
class _Entry:
    meta: SkillMeta
    body: str
    files: tuple[str, ...]


class SkillLibrary:
    def __init__(
        self,
        *,
        local_dir: Path,
        managed_dir: Path,
        cache_ttl: float = 300.0,
    ) -> None:
        self._local_dir = local_dir
        self._managed_dir = managed_dir
        self._cache_ttl = cache_ttl
        self._cache: dict[str, _Entry] | None = None
        self._cache_time = 0.0
        self._lock = asyncio.Lock()


    async def index(self, *, include_disabled: bool = False) -> list[SkillMeta]:
        entries = await self._load()
        metas = [e.meta for e in entries.values()]
        metas.sort(key=lambda m: m.name)
        return [m for m in metas if include_disabled or m.enabled]

    async def get(self, name: str) -> Skill:
        key = _norm(name)
        entries = await self._load()
        entry = entries.get(key)
        if entry is None:
            known = ", ".join(sorted(entries)) or "-"
            raise SkillError(f"Skill {name!r} does not exist. Available: {known}")
        return Skill(meta=entry.meta, body=entry.body, files=entry.files)


    async def save(
        self, name: str, content: str, *, enabled: bool = True, why: str = ""
    ) -> SkillMeta:
        if len(content.encode()) > MAX_SKILL_BYTES:
            raise SkillError(
                f"SKILL.md is too large (> {MAX_SKILL_BYTES // 1000} KB). "
                "Move details into companion files."
            )

        meta, body = _parse(name, content, source="managed")
        key = meta.name
        if not VALID_NAME.match(key):
            raise SkillError(
                f"Invalid skill name {key!r}. Allowed: lowercase "
                "letters, digits, - and _, no paths."
            )

        if (self._local_dir / key / SKILL_FILE).is_file():
            raise SkillError(
                f"{key!r} is a repo skill and is not overwritten from "
                "the managed store."
            )
        normalized = _with_frontmatter(
            name=key,
            description=meta.description,
            enabled=enabled,
            why=why or meta.why,
            body=body,
        )
        self._write_managed(key, normalized)
        self._invalidate()
        logger.info("Skill saved: %s (enabled=%s)", key, enabled)
        return SkillMeta(
            name=key,
            description=meta.description,
            source="managed",
            enabled=enabled,
            why=why or meta.why,
        )

    async def set_enabled(self, name: str, enabled: bool) -> SkillMeta:
        skill = await self.get(name)
        if skill.meta.source == "repo":
            raise SkillError(f"{name!r} is a repo skill and always active.")
        return await self.save(
            name,
            _with_frontmatter(
                name=skill.meta.name,
                description=skill.meta.description,
                enabled=enabled,
                why=skill.meta.why,
                body=skill.body,
            ),
            enabled=enabled,
            why=skill.meta.why,
        )

    async def delete(self, name: str) -> None:
        key = _norm(name)
        if (self._local_dir / key / SKILL_FILE).is_file():
            raise SkillError(f"{key!r} is a repo skill -- delete it in the repo.")
        target = self._managed_dir / key
        if not (target / SKILL_FILE).is_file():
            raise SkillError(f"Skill {key!r} does not exist in the managed store.")
        shutil.rmtree(target, ignore_errors=True)
        self._invalidate()
        logger.info("Skill deleted: %s", key)

    def _invalidate(self) -> None:
        self._cache = None


    async def _load(self) -> dict[str, _Entry]:
        if self._cache is not None and time.monotonic() - self._cache_time < self._cache_ttl:
            return self._cache
        async with self._lock:
            if self._cache is not None and time.monotonic() - self._cache_time < self._cache_ttl:
                return self._cache
            entries = self._scan(self._local_dir, source="repo")
            for key, entry in self._scan(
                self._managed_dir, source="managed"
            ).items():
                entries.setdefault(key, entry)
            self._cache = entries
            self._cache_time = time.monotonic()
            logger.info(
                "Skill-Index: %d (%s)",
                len(entries),
                ", ".join(sorted(entries)) or "-",
            )
            return entries

    def _scan(self, basis: Path, *, source: str) -> dict[str, _Entry]:
        entries: dict[str, _Entry] = {}
        if not basis.is_dir():
            return entries
        for folder in sorted(basis.iterdir()):
            file = folder / SKILL_FILE
            if not file.is_file():
                continue
            try:
                meta, body = _parse(folder.name, file.read_text("utf-8"), source=source)
            except SkillError as exc:
                logger.warning("Skill %s (%s) skipped: %s", folder.name, source, exc)
                continue
            files = tuple(
                sorted(
                    p.name
                    for p in folder.iterdir()
                    if p.is_file() and p.name != SKILL_FILE
                )
            )
            entries[meta.name] = _Entry(meta=meta, body=body, files=files)
        return entries

    def _write_managed(self, name: str, content: str) -> None:
        target = self._managed_dir / name
        target.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(
            "w", dir=target, suffix=".tmp", delete=False, encoding="utf-8"
        ) as file:
            file.write(content)
            temp = Path(file.name)
        temp.replace(target / SKILL_FILE)


def _norm(name: str) -> str:
    return (name or "").strip().strip("/").lower()


def _parse(name: str, text: str, *, source: str) -> tuple[SkillMeta, str]:
    matched = FRONTMATTER.match(text)
    if not matched:
        raise SkillError(
            "SKILL.md without frontmatter. Expected a YAML header between "
            "'---' lines with at least 'name' and 'description'."
        )
    try:
        head = yaml.safe_load(matched.group(1)) or {}
    except yaml.YAMLError as exc:
        raise SkillError(f"Frontmatter is not valid YAML: {exc}") from exc
    if not isinstance(head, dict):
        raise SkillError("Frontmatter must be a YAML object (key: value).")

    description = str(head.get("description") or "").strip()
    if not description:
        raise SkillError("Frontmatter needs a 'description' field.")

    body = matched.group(2).strip()
    if not body:
        raise SkillError("The skill has no instruction text below the frontmatter.")

    return (
        SkillMeta(
            name=_norm(str(head.get("name") or name)),
            description=description[:400],
            source=source,
            enabled=bool(head.get("enabled", True)),
            why=str(head.get("why") or "").strip(),
        ),
        body,
    )


def _with_frontmatter(
    *, name: str, description: str, enabled: bool, why: str, body: str
) -> str:
    head: dict[str, Any] = {"name": name, "description": description, "enabled": enabled}
    if why:
        head["why"] = why
    yaml_header = yaml.safe_dump(head, allow_unicode=True, sort_keys=False).strip()
    return f"---\n{yaml_header}\n---\n\n{body.strip()}\n"
