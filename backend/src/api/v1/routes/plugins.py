from __future__ import annotations

from fastapi import APIRouter

from src.api.deps import PluginStoreDep, ProviderDep
from src.core.exceptions import NotFoundError, ValidationError
from src.schemas.plugins import PluginListResponse, PluginOut, PluginStateResponse
from src.services.plugins.manifest import CATEGORY_LABELS
from src.services.plugins.service import PluginState, all_manifests, plugin_states

router = APIRouter(prefix="/plugins", tags=["plugins"])


@router.get("", response_model=PluginListResponse, summary="Every plugin and its state")
async def list_plugins(
    provider: ProviderDep, store: PluginStoreDep
) -> PluginListResponse:
    entries = await _zustand(provider, store)
    return PluginListResponse(
        count=len(entries),
        installed_count=sum(1 for e in entries if e.installed),
        plugins=[_out(e) for e in entries],
    )


@router.post(
    "/{slug}", response_model=PluginStateResponse, summary="Install a plugin"
)
async def install_plugin(
    slug: str, provider: ProviderDep, store: PluginStoreDep
) -> PluginStateResponse:
    entry = await _find(provider, store, slug)

    if not entry.available:
        missing = ", ".join(entry.missing_requirements) or "its tools are not loaded"
        raise ValidationError(
            f"{entry.manifest.title} cannot run here: {missing}.",
            details={"slug": slug, "missing": list(entry.missing_requirements)},
        )

    await store.install(slug)
    return PluginStateResponse(slug=slug, installed=True)


@router.delete(
    "/{slug}", response_model=PluginStateResponse, summary="Uninstall a plugin"
)
async def uninstall_plugin(
    slug: str, provider: ProviderDep, store: PluginStoreDep
) -> PluginStateResponse:
    await _find(provider, store, slug)
    await store.uninstall(slug)
    return PluginStateResponse(slug=slug, installed=False)


async def _zustand(
    provider: ProviderDep, store: PluginStoreDep
) -> list[PluginState]:
    tools = [spec.name for spec in await provider.toolbox.specs()]
    return plugin_states(tools, await store.installed())


async def _find(
    provider: ProviderDep, store: PluginStoreDep, slug: str
) -> PluginState:
    for entry in await _zustand(provider, store):
        if entry.manifest.slug == slug:
            return entry

    known = [m.slug for m in all_manifests([])]
    raise NotFoundError(
        f"No plugin named {slug!r}.",
        details={"known": known},
    )


def _out(entry: PluginState) -> PluginOut:
    m = entry.manifest
    return PluginOut(
        slug=m.slug,
        title=m.title,
        category=m.category,
        category_label=CATEGORY_LABELS.get(m.category, m.category.title()),
        summary=m.summary,
        description=m.description,
        icon=m.icon,
        tools=list(m.tools),
        available_tools=list(entry.available_tools),
        requires=list(m.requires),
        missing_requirements=list(entry.missing_requirements),
        available=entry.available,
        installed=entry.installed,
    )
