"""Bibliothek der System-Prompts.

Prompts sind Dateien in ``prompts/`` -- eine pro Persona. Der Dateiname ohne
Endung ist ihr Name. So laesst sich eine Persona aendern, ohne Code anzufassen
oder neu zu deployen.

Platzhalter der Form ``{{NAME}}`` werden beim Laden ersetzt. Damit bleibt ein
Wert wie das Geheimnis in der Konfiguration und nicht im Prompt-Text.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from src.core.exceptions import ValidationError
from src.core.logging import get_logger

logger = get_logger(__name__)

PLACEHOLDER = re.compile(r"\{\{([A-Z_][A-Z0-9_]*)\}\}")
SUFFIXES = (".md", ".txt")
# Kein Pfad, keine Punkte -- der Name darf nie aus dem Verzeichnis herausfuehren.
VALID_NAME = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")


@dataclass(frozen=True, slots=True)
class Prompt:
    name: str
    text: str
    variables: tuple[str, ...] = ()

    @property
    def title(self) -> str:
        """Erste inhaltliche Zeile -- als Kurzbeschreibung fuer Listen.

        Ueberschriften uebersprungen: die heissen in jedem Prompt gleich und
        saehen in einer Liste alle identisch aus.
        """
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
            logger.warning("Prompt-Verzeichnis %s fehlt", self._directory)
            return []
        return sorted(
            {p.stem for p in self._directory.iterdir() if p.suffix in SUFFIXES}
        )

    def list(self) -> list[Prompt]:
        return [self.get(name) for name in self.names()]

    def get(self, name: str) -> Prompt:
        """Laedt einen Prompt und ersetzt seine Platzhalter."""
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
        """Der Text wie er auf der Platte steht -- ohne ersetzte Platzhalter.

        Zum Bearbeiten muss man das Original sehen: haette man die
        eingesetzten Werte vor sich, schriebe man sie beim Speichern fest
        und der Platzhalter waere weg.
        """
        return self._pfad(name, muss_existieren=True).read_text(encoding="utf-8")

    def save(self, name: str, text: str) -> Prompt:
        """Anlegen oder ueberschreiben. Immer als .md.

        Erst in eine Nachbardatei schreiben, dann umbenennen: ein Absturz
        mitten im Schreiben laesst so den alten Prompt stehen, statt einen
        halben zu hinterlassen.
        """
        pfad = self._pfad(name)
        pfad.parent.mkdir(parents=True, exist_ok=True)

        vorlaeufig = pfad.with_suffix(".md.tmp")
        vorlaeufig.write_text(text, encoding="utf-8")
        vorlaeufig.replace(pfad.with_suffix(".md"))

        logger.info("Prompt %r gespeichert (%d Zeichen)", name, len(text))
        return self.get(name)

    def delete(self, name: str) -> bool:
        """True, wenn wirklich eine Datei verschwunden ist."""
        weg = False
        for suffix in SUFFIXES:
            pfad = self._directory / f"{name}{suffix}"
            if pfad.is_file():
                pfad.unlink()
                weg = True
        if weg:
            logger.info("Prompt %r geloescht", name)
        return weg

    def _pfad(self, name: str, *, muss_existieren: bool = False) -> Path:
        """Name zu Pfad -- mit der Pruefung, die alles zusammenhaelt.

        ``VALID_NAME`` laesst weder Schraegstrich noch Punkt durch. Ohne das
        waere jeder dieser Aufrufe ein Weg, ausserhalb des Verzeichnisses zu
        schreiben oder zu loeschen.
        """
        if not VALID_NAME.match(name):
            raise ValidationError(f"Invalid prompt name {name!r}.")

        for suffix in SUFFIXES:
            pfad = self._directory / f"{name}{suffix}"
            if pfad.is_file():
                return pfad

        if muss_existieren:
            raise ValidationError(
                f"Prompt {name!r} not found. "
                f"Available: {', '.join(self.names()) or '-'}"
            )
        return self._directory / f"{name}.md"

    def render(self, text: str) -> str:
        def ersetzen(match: re.Match[str]) -> str:
            schluessel = match.group(1)
            if schluessel in self._variables:
                return self._variables[schluessel]
            # Unbekannte Platzhalter bleiben stehen: sichtbar im Prompt ist
            # besser als stillschweigend leer.
            logger.warning("Platzhalter {{%s}} hat keinen Wert", schluessel)
            return match.group(0)

        return PLACEHOLDER.sub(ersetzen, text)


def _used(text: str) -> list[str]:
    return sorted({m.group(1) for m in PLACEHOLDER.finditer(text)})
