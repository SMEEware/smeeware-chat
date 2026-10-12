from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from src.core.exceptions import ValidationError
from src.core.logging import get_logger

logger = get_logger(__name__)

PLACEHOLDER = re.compile(r"\{\{([A-Z_][A-Z0-9_]*)\}\}")
SUFFIXES = (".md", ".txt")
VALID_NAME = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")


@dataclass(frozen=True, slots=True)
class Prompt:
    name: str
    text: str
    variables: tuple[str, ...] = ()

    @property
    def title(self) -> str:
        for line in self.text.splitlines():
            stripped = line.strip()
            if stripped and not stripped.startswith("#"):
                return stripped[:160]
        return self.name


class PromptLibrary:
    def __init__(
        self, directory: Path, variables: dict[str, str] | None = None
    ) -> None:
        self._directory = directory
        self._variables = variables or {}

    def names(self) -> list[str]:
        if not self._directory.is_dir():
            logger.warning("Prompt directory %s is missing", self._directory)
            return []
        return sorted(
            {p.stem for p in self._directory.iterdir() if p.suffix in SUFFIXES}
        )

    def list(self) -> list[Prompt]:
        return [self.get(name) for name in self.names()]

    def get(self, name: str) -> Prompt:
        if not VALID_NAME.match(name):
            raise ValidationError(f"Invalid prompt name {name!r}.")

        for suffix in SUFFIXES:
            path = self._directory / f"{name}{suffix}"
            if path.is_file():
                break
        else:
            raise ValidationError(
                f"Prompt {name!r} not found. Available: {', '.join(self.names()) or '-'}"
            )

        raw = path.read_text(encoding="utf-8")
        return Prompt(name=name, text=self.render(raw), variables=tuple(_used(raw)))

    def raw(self, name: str) -> str:
        return self._path(name, must_exist=True).read_text(encoding="utf-8")

    def save(self, name: str, text: str) -> Prompt:
        path = self._path(name)
        path.parent.mkdir(parents=True, exist_ok=True)

        temp_path = path.with_suffix(".md.tmp")
        temp_path.write_text(text, encoding="utf-8")
        temp_path.replace(path.with_suffix(".md"))

        logger.info("Prompt %r saved (%d chars)", name, len(text))
        return self.get(name)

    def delete(self, name: str) -> bool:
        removed_tags = False
        for suffix in SUFFIXES:
            path = self._directory / f"{name}{suffix}"
            if path.is_file():
                path.unlink()
                removed_tags = True
        if removed_tags:
            logger.info("Prompt %r deleted", name)
        return removed_tags

    def _path(self, name: str, *, must_exist: bool = False) -> Path:
        if not VALID_NAME.match(name):
            raise ValidationError(f"Invalid prompt name {name!r}.")

        for suffix in SUFFIXES:
            path = self._directory / f"{name}{suffix}"
            if path.is_file():
                return path

        if must_exist:
            raise ValidationError(
                f"Prompt {name!r} not found. "
                f"Available: {', '.join(self.names()) or '-'}"
            )
        return self._directory / f"{name}.md"

    def render(self, text: str) -> str:
        def replace(match: re.Match[str]) -> str:
            key = match.group(1)
            if key in self._variables:
                return self._variables[key]
            logger.warning("Placeholder {{%s}} has no value", key)
            return match.group(0)

        return PLACEHOLDER.sub(replace, text)


def _used(text: str) -> list[str]:
    return sorted({m.group(1) for m in PLACEHOLDER.finditer(text)})
