"""Werkzeuge, mit denen das Modell seine Skills nutzt und pflegt.

    skill_list     was es gibt (Name + Beschreibung)
    use_skill      den vollen Text eines Skills nachladen
    skill_save     einen Skill anlegen/aktualisieren (lokal in data/skills)
    skill_import   einen Skill von einem Marktplatz holen (in Quarantaene)
    skill_delete   einen verwalteten Skill entfernen

Repo-Skills (im git versioniert) sind lesbar, aber nicht ueber diese
Werkzeuge aenderbar -- was im git steht, aendert man im git.
"""

from __future__ import annotations

from typing import Any

import httpx

from src.core.logging import get_logger
from src.services.skills.library import SkillError, SkillLibrary
from src.services.tools.base import ToolError
from src.services.tools.local.base import LocalTool, truncate

logger = get_logger(__name__)

MAX_CHARS = 14_000


class _SkillTool(LocalTool):
    def __init__(self, skills: SkillLibrary) -> None:
        self._skills = skills


class SkillListTool(_SkillTool):
    name = "skill_list"
    description = (
        "Lists the available skills with name and description. A skill is a "
        "stored set of instructions for a recurring task. Call this when you "
        "want to check whether a skill already exists for the current task -- "
        "especially after you have created or imported one yourself."
    )
    parameters = {
        "type": "object",
        "properties": {
            "include_disabled": {
                "type": "boolean",
                "description": "Also show disabled/quarantined skills",
            }
        },
        "required": [],
    }

    async def run(self, include_disabled: bool = False) -> str:
        metas = await self._skills.index(include_disabled=include_disabled)
        if not metas:
            return "No skills yet. You can create one with skill_save."
        zeilen = [f"{len(metas)} skill(s):", ""]
        zeilen += [f"{m.zeile()}  ({m.source})" for m in metas]
        zeilen += ["", "Get the full text: use_skill with the name."]
        return "\n".join(zeilen)


class UseSkillTool(_SkillTool):
    name = "use_skill"
    description = (
        "Loads the full instructions of a skill. Use this before taking on a "
        "task for which skill_list shows a skill -- then follow the "
        "instructions. If the skill names companion files, they are in the "
        "same folder and can be used via the shell."
    )
    parameters = {
        "type": "object",
        "properties": {
            "name": {"type": "string", "description": "Name of the skill"},
        },
        "required": ["name"],
    }

    async def run(self, name: str) -> str:
        try:
            skill = await self._skills.get(name)
        except SkillError as exc:
            raise ToolError(str(exc)) from exc
        if not skill.meta.enabled:
            return (
                f"Skill {skill.meta.name!r} is disabled (quarantine). "
                "Enable it via skill_save with enabled=true if you trust it."
            )
        kopf = f"# Skill: {skill.meta.name}\n{skill.meta.description}"
        if skill.files:
            kopf += f"\n\nCompanion files: {', '.join(skill.files)}"
        return truncate(f"{kopf}\n\n---\n\n{skill.body}", MAX_CHARS)


class SkillSaveTool(_SkillTool):
    name = "skill_save"
    description = (
        "Creates a new skill or updates an existing one. Use this when you "
        "have worked out an approach worth keeping -- or when the user asks "
        "you to. 'content' is a complete SKILL.md: a YAML frontmatter (name, "
        "description) between '---' lines, followed by the instructions in "
        "Markdown. Keep the 'description' precise -- it is how you later "
        "recognize when the skill applies. Local skills from the repo cannot "
        "be overwritten this way."
    )
    parameters = {
        "type": "object",
        "properties": {
            "name": {
                "type": "string",
                "description": "Short name, lowercase, with - or _ (e.g. 'pdf-form')",
            },
            "content": {
                "type": "string",
                "description": (
                    "Complete SKILL.md including '---' frontmatter with "
                    "name and description"
                ),
            },
            "why": {
                "type": "string",
                "description": "Optional note on why this skill exists",
            },
        },
        "required": ["name", "content"],
    }

    async def run(self, name: str, content: str, why: str = "") -> str:
        try:
            meta = await self._skills.save(name, content, enabled=True, why=why)
        except SkillError as exc:
            raise ToolError(str(exc)) from exc
        return (
            f"Skill {meta.name!r} saved and active.\n"
            f"Description: {meta.description}\n"
            "It is now available in skill_list and via use_skill."
        )


class SkillImportTool(_SkillTool):
    name = "skill_import"
    description = (
        "Fetches a ready-made skill from a URL (e.g. a raw SKILL.md from a "
        "skill collection on GitHub) and stores it. Imported skills land in "
        "quarantine first (disabled) -- a foreign skill is foreign "
        "instructions. Tell the user; only after their okay do you enable it "
        "with skill_save (enabled=true)."
    )
    parameters = {
        "type": "object",
        "properties": {
            "url": {"type": "string", "description": "Direct link to the SKILL.md (raw text)"},
            "name": {
                "type": "string",
                "description": "Name to store the skill under (optional)",
            },
        },
        "required": ["url"],
    }

    def __init__(self, skills: SkillLibrary, client: httpx.AsyncClient) -> None:
        super().__init__(skills)
        self._client = client

    async def run(self, url: str, name: str | None = None) -> str:
        url = url.strip()
        if not url.lower().startswith(("http://", "https://")):
            raise ToolError("Please give an http(s) URL to the SKILL.md.")
        try:
            antwort = await self._client.get(url, follow_redirects=True)
        except httpx.HTTPError as exc:
            raise ToolError(f"{url} unreachable: {type(exc).__name__}: {exc}") from exc
        if antwort.status_code != 200:
            raise ToolError(f"{url} responded with HTTP {antwort.status_code}.")

        content = antwort.text
        skill_name = name or _name_aus_url(url)
        try:
            meta = await self._skills.save(
                skill_name, content, enabled=False, why=f"Imported from {url}"
            )
        except SkillError as exc:
            raise ToolError(f"Import failed: {exc}") from exc
        return (
            f"Skill {meta.name!r} imported -- **in quarantine** (disabled).\n"
            f"Description: {meta.description}\n"
            "Review it with use_skill and ask the user whether it should be "
            "enabled. Only then activate it with skill_save enabled=true."
        )


class SkillDeleteTool(_SkillTool):
    name = "skill_delete"
    description = (
        "Deletes a managed skill from your local skill store -- permanent. For "
        "skills that did not prove useful or are duplicates. Repo skills "
        "cannot be deleted this way."
    )
    parameters = {
        "type": "object",
        "properties": {
            "name": {"type": "string", "description": "Name of the skill"},
        },
        "required": ["name"],
    }

    async def run(self, name: str) -> str:
        try:
            await self._skills.delete(name)
        except SkillError as exc:
            raise ToolError(str(exc)) from exc
        return f"Skill {name!r} deleted."


def _name_aus_url(url: str) -> str:
    """Rät einen Skill-Namen aus der URL: der Ordner vor der SKILL.md."""
    teile = [t for t in url.split("?")[0].split("/") if t]
    if teile and teile[-1].lower().endswith(".md"):
        teile.pop()  # SKILL.md selbst
    return teile[-1] if teile else "imported-skill"


def create_skill_tools(
    skills: SkillLibrary, client: httpx.AsyncClient
) -> list[LocalTool]:
    return [
        SkillListTool(skills),
        UseSkillTool(skills),
        SkillSaveTool(skills),
        SkillImportTool(skills, client),
        SkillDeleteTool(skills),
    ]


__all__ = ["create_skill_tools"]
