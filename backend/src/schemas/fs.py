"""Schemas fuer den Verzeichnis-Browser der Workspaces.

Der Browser zeigt die Ordner auf dem Rechner, auf dem das Backend laeuft --
also dort, wo auch die Werkzeuge (Shell, Storage) arbeiten. Lokal ist das der
eigene Rechner, im Betrieb der Host des Agenten.
"""

from __future__ import annotations

from pydantic import BaseModel


class FsEntry(BaseModel):
    """Ein Unterordner des gerade gezeigten Verzeichnisses."""

    name: str
    path: str
    hidden: bool


class FsListing(BaseModel):
    path: str
    """Der aufgeloeste, absolute Pfad, der gerade gelistet wird."""

    parent: str | None
    """Das uebergeordnete Verzeichnis -- ``None`` an der Wurzel."""

    home: str
    """Das Arbeitsverzeichnis des Agenten -- der sinnvolle Startpunkt."""

    separator: str
    """Der Pfadtrenner des Hosts (``/`` bzw. ``\\``)."""

    entries: list[FsEntry]
    """Nur Unterordner -- ein Workspace ist ein Verzeichnis."""
