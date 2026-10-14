from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

Category = Literal[
    "search",
    "web",
    "media",
    "files",
    "skills",
    "system",
    "security",
]

CATEGORY_LABELS: dict[Category, str] = {
    "search": "Search",
    "web": "Web",
    "media": "Media",
    "files": "Files",
    "skills": "Skills",
    "system": "System",
    "security": "Security",
}


ALWAYS_AVAILABLE = frozenset({
    "notify_user", "ask_user", "list_files", "read_file", "write_file",
    "copy_file", "edit_file", "extract_archive", "export_file",
})


@dataclass(frozen=True, slots=True)
class PluginManifest:
    slug: str
    title: str
    category: Category
    summary: str
    description: str
    tools: tuple[str, ...]
    requires: tuple[str, ...] = ()
    icon: str = "Puzzle"
