"""Der Skill-Speicher: vertrauenswuerdige Repo-Skills und modell-gepflegte,
lokal gespeicherte Skills unter einem Dach.

Zwei Ebenen, beide auf der Platte:

    repo      skills/ im Repo -- in git versioniert, vertrauenswuerdig; ueber
              die Werkzeuge NICHT aenderbar (was im git steht, aendert man im git)
    managed   data/skills/ -- vom Modell geschrieben oder importiert, hier
              anlegbar, aenderbar und loeschbar

Frueher lag die zweite Ebene in einem privaten S3-Bucket (ueber ``mc``); jetzt
ist es ein Ordner neben der Chat-Datenbank. Kein Netz, kein Binary, kein
Alias -- ein Skill ist eine Datei, die man auch im Finder sieht.

Bei Namensgleichheit gewinnt der Repo-Skill -- er soll nicht aus dem
verwalteten Ordner ueberschrieben werden koennen.
"""

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
SKILL_DATEI = "SKILL.md"
MAX_SKILL_BYTES = 100_000


class SkillError(ToolError):
    """Skill unbrauchbar -- die Meldung geht ans Modell."""


@dataclass(frozen=True, slots=True)
class SkillMeta:
    name: str
    description: str
    source: str  # "repo" | "managed"
    enabled: bool = True
    why: str = ""

    def zeile(self) -> str:
        marke = "" if self.enabled else " [in quarantine, disabled]"
        return f"- {self.name}: {self.description}{marke}"


@dataclass(frozen=True, slots=True)
class Skill:
    meta: SkillMeta
    body: str
    files: tuple[str, ...] = ()  # zusaetzliche Dateien im Skill-Ordner


@dataclass
class _Eintrag:
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
        self._cache: dict[str, _Eintrag] | None = None
        self._cache_zeit = 0.0
        self._lock = asyncio.Lock()

    # -- Lesen ---------------------------------------------------------- #

    async def index(self, *, include_disabled: bool = False) -> list[SkillMeta]:
        eintraege = await self._laden()
        metas = [e.meta for e in eintraege.values()]
        metas.sort(key=lambda m: m.name)
        return [m for m in metas if include_disabled or m.enabled]

    async def get(self, name: str) -> Skill:
        schluessel = _norm(name)
        eintraege = await self._laden()
        eintrag = eintraege.get(schluessel)
        if eintrag is None:
            bekannt = ", ".join(sorted(eintraege)) or "-"
            raise SkillError(f"Skill {name!r} does not exist. Available: {bekannt}")
        return Skill(meta=eintrag.meta, body=eintrag.body, files=eintrag.files)

    # -- Schreiben ------------------------------------------------------ #

    async def save(
        self, name: str, content: str, *, enabled: bool = True, why: str = ""
    ) -> SkillMeta:
        if len(content.encode()) > MAX_SKILL_BYTES:
            raise SkillError(
                f"SKILL.md is too large (> {MAX_SKILL_BYTES // 1000} KB). "
                "Move details into companion files."
            )

        # Der Name, unter dem der Skill sich selbst fuehrt (Frontmatter), ist
        # die Identitaet -- der uebergebene Name nur der Fallback. So landet ein
        # importierter Skill unter seinem eigenen Namen, nicht unter dem aus der
        # URL geratenen. Ordner UND Frontmatter tragen danach denselben Namen.
        meta, body = _parse(name, content, source="managed")
        schluessel = meta.name
        if not VALID_NAME.match(schluessel):
            raise SkillError(
                f"Invalid skill name {schluessel!r}. Allowed: lowercase "
                "letters, digits, - and _, no paths."
            )

        # Ein Repo-Skill ist die Quelle der Wahrheit -- nicht ueberschreiben.
        if (self._local_dir / schluessel / SKILL_DATEI).is_file():
            raise SkillError(
                f"{schluessel!r} is a repo skill and is not overwritten from "
                "the managed store."
            )
        # Frontmatter normalisieren: Name/enabled/why an das anheften, was das
        # Modell mitgibt -- so bleibt die Datei ein gueltiger Skill, auch wenn
        # das Modell das Frontmatter unvollstaendig geschrieben hat.
        normiert = _mit_frontmatter(
            name=schluessel,
            description=meta.description,
            enabled=enabled,
            why=why or meta.why,
            body=body,
        )
        self._managed_schreiben(schluessel, normiert)
        self._invalidieren()
        logger.info("Skill gespeichert: %s (enabled=%s)", schluessel, enabled)
        return SkillMeta(
            name=schluessel,
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
            _mit_frontmatter(
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
        schluessel = _norm(name)
        if (self._local_dir / schluessel / SKILL_DATEI).is_file():
            raise SkillError(f"{schluessel!r} is a repo skill -- delete it in the repo.")
        ziel = self._managed_dir / schluessel
        if not (ziel / SKILL_DATEI).is_file():
            raise SkillError(f"Skill {schluessel!r} does not exist in the managed store.")
        shutil.rmtree(ziel, ignore_errors=True)
        self._invalidieren()
        logger.info("Skill geloescht: %s", schluessel)

    def _invalidieren(self) -> None:
        self._cache = None

    # -- intern --------------------------------------------------------- #

    async def _laden(self) -> dict[str, _Eintrag]:
        if self._cache is not None and time.monotonic() - self._cache_zeit < self._cache_ttl:
            return self._cache
        async with self._lock:
            if self._cache is not None and time.monotonic() - self._cache_zeit < self._cache_ttl:
                return self._cache
            eintraege = self._scan(self._local_dir, source="repo")
            for schluessel, eintrag in self._scan(
                self._managed_dir, source="managed"
            ).items():
                eintraege.setdefault(schluessel, eintrag)  # Repo gewinnt
            self._cache = eintraege
            self._cache_zeit = time.monotonic()
            logger.info(
                "Skill-Index: %d (%s)",
                len(eintraege),
                ", ".join(sorted(eintraege)) or "-",
            )
            return eintraege

    def _scan(self, basis: Path, *, source: str) -> dict[str, _Eintrag]:
        """Liest alle Skill-Ordner unter ``basis`` -- ein SKILL.md je Ordner."""
        eintraege: dict[str, _Eintrag] = {}
        if not basis.is_dir():
            return eintraege
        for ordner in sorted(basis.iterdir()):
            datei = ordner / SKILL_DATEI
            if not datei.is_file():
                continue
            try:
                meta, body = _parse(ordner.name, datei.read_text("utf-8"), source=source)
            except SkillError as exc:
                logger.warning("Skill %s (%s) uebersprungen: %s", ordner.name, source, exc)
                continue
            files = tuple(
                sorted(
                    p.name
                    for p in ordner.iterdir()
                    if p.is_file() and p.name != SKILL_DATEI
                )
            )
            eintraege[meta.name] = _Eintrag(meta=meta, body=body, files=files)
        return eintraege

    def _managed_schreiben(self, name: str, inhalt: str) -> None:
        """Schreibt data/skills/<name>/SKILL.md -- atomar (temp + umbenennen)."""
        ziel = self._managed_dir / name
        ziel.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(
            "w", dir=ziel, suffix=".tmp", delete=False, encoding="utf-8"
        ) as datei:
            datei.write(inhalt)
            temp = Path(datei.name)
        temp.replace(ziel / SKILL_DATEI)


# ---------------------------------------------------------------------- #


def _norm(name: str) -> str:
    return (name or "").strip().strip("/").lower()


def _parse(name: str, text: str, *, source: str) -> tuple[SkillMeta, str]:
    """Zerlegt eine SKILL.md in Metadaten und Anweisungstext."""
    treffer = FRONTMATTER.match(text)
    if not treffer:
        raise SkillError(
            "SKILL.md without frontmatter. Expected a YAML header between "
            "'---' lines with at least 'name' and 'description'."
        )
    try:
        kopf = yaml.safe_load(treffer.group(1)) or {}
    except yaml.YAMLError as exc:
        raise SkillError(f"Frontmatter is not valid YAML: {exc}") from exc
    if not isinstance(kopf, dict):
        raise SkillError("Frontmatter must be a YAML object (key: value).")

    beschreibung = str(kopf.get("description") or "").strip()
    if not beschreibung:
        raise SkillError("Frontmatter needs a 'description' field.")

    body = treffer.group(2).strip()
    if not body:
        raise SkillError("The skill has no instruction text below the frontmatter.")

    return (
        SkillMeta(
            name=_norm(str(kopf.get("name") or name)),
            description=beschreibung[:400],
            source=source,
            enabled=bool(kopf.get("enabled", True)),
            why=str(kopf.get("why") or "").strip(),
        ),
        body,
    )


def _mit_frontmatter(
    *, name: str, description: str, enabled: bool, why: str, body: str
) -> str:
    kopf: dict[str, Any] = {"name": name, "description": description, "enabled": enabled}
    if why:
        kopf["why"] = why
    yaml_kopf = yaml.safe_dump(kopf, allow_unicode=True, sort_keys=False).strip()
    return f"---\n{yaml_kopf}\n---\n\n{body.strip()}\n"
