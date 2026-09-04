"""Ein-/Ausgabe der Plugin-Verwaltung."""

from __future__ import annotations

from pydantic import BaseModel


class PluginOut(BaseModel):
    slug: str
    title: str
    category: str
    category_label: str
    summary: str
    description: str
    icon: str
    tools: list[str]
    available_tools: list[str]
    requires: list[str]
    missing_requirements: list[str]
    available: bool
    installed: bool


class PluginListResponse(BaseModel):
    count: int
    installed_count: int
    plugins: list[PluginOut]


class PluginStateResponse(BaseModel):
    slug: str
    installed: bool
