"""Plugins auflisten, installieren, deinstallieren.

Ein Plugin buendelt Werkzeuge unter einem Namen. Was hier geschaltet wird,
entscheidet, was das Modell im naechsten Turn ueberhaupt angeboten bekommt.
"""

from __future__ import annotations

from fastapi import APIRouter

from src.api.deps import PluginStoreDep, ProviderDep
from src.core.exceptions import NotFoundError, ValidationError
from src.schemas.plugins import PluginListResponse, PluginOut, PluginStateResponse
from src.services.plugins.manifest import CATEGORY_LABELS
from src.services.plugins.service import PluginZustand, alle_manifeste, zustand

router = APIRouter(prefix="/plugins", tags=["plugins"])


@router.get("", response_model=PluginListResponse, summary="Every plugin and its state")
async def list_plugins(
    provider: ProviderDep, store: PluginStoreDep
) -> PluginListResponse:
    eintraege = await _zustand(provider, store)
    return PluginListResponse(
        count=len(eintraege),
        installed_count=sum(1 for e in eintraege if e.installed),
        plugins=[_out(e) for e in eintraege],
    )


@router.post(
    "/{slug}", response_model=PluginStateResponse, summary="Install a plugin"
)
async def install_plugin(
    slug: str, provider: ProviderDep, store: PluginStoreDep
) -> PluginStateResponse:
    eintrag = await _finden(provider, store, slug)

    if not eintrag.available:
        fehlt = ", ".join(eintrag.missing_requirements) or "its tools are not loaded"
        raise ValidationError(
            f"{eintrag.manifest.title} cannot run here: {fehlt}.",
            details={"slug": slug, "missing": list(eintrag.missing_requirements)},
        )

    await store.installieren(slug)
    return PluginStateResponse(slug=slug, installed=True)


@router.delete(
    "/{slug}", response_model=PluginStateResponse, summary="Uninstall a plugin"
)
async def uninstall_plugin(
    slug: str, provider: ProviderDep, store: PluginStoreDep
) -> PluginStateResponse:
    await _finden(provider, store, slug)
    await store.deinstallieren(slug)
    return PluginStateResponse(slug=slug, installed=False)


async def _zustand(
    provider: ProviderDep, store: PluginStoreDep
) -> list[PluginZustand]:
    werkzeuge = [spec.name for spec in await provider.toolbox.specs()]
    return zustand(werkzeuge, await store.installiert())


async def _finden(
    provider: ProviderDep, store: PluginStoreDep, slug: str
) -> PluginZustand:
    for eintrag in await _zustand(provider, store):
        if eintrag.manifest.slug == slug:
            return eintrag

    bekannt = [m.slug for m in alle_manifeste([])]
    raise NotFoundError(
        f"No plugin named {slug!r}.",
        details={"known": bekannt},
    )


def _out(eintrag: PluginZustand) -> PluginOut:
    m = eintrag.manifest
    return PluginOut(
        slug=m.slug,
        title=m.title,
        category=m.category,
        category_label=CATEGORY_LABELS.get(m.category, m.category.title()),
        summary=m.summary,
        description=m.description,
        icon=m.icon,
        tools=list(m.tools),
        available_tools=list(eintrag.available_tools),
        requires=list(m.requires),
        missing_requirements=list(eintrag.missing_requirements),
        available=eintrag.available,
        installed=eintrag.installed,
    )
