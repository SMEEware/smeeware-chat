from __future__ import annotations

import os
from collections.abc import Sequence
from dataclasses import dataclass

from src.core.logging import get_logger
from src.services.plugins.catalog import CATALOG, mcp_manifest, unknown_tools
from src.services.plugins.manifest import ALWAYS_AVAILABLE, PluginManifest
from src.services.tools.base import NAME_SEPARATOR

logger = get_logger(__name__)

FALSY = {"", "0", "false", "no", "off"}

ON_BY_DEFAULT = {"IMAGE_ENABLED", "VISION_ENABLED", "TTS_ENABLED"}


def _satisfied(key: str) -> bool:
    value = os.getenv(key)
    if value is None:
        return key in ON_BY_DEFAULT
    return value.strip().lower() not in FALSY


@dataclass(frozen=True, slots=True)
class PluginState:
    manifest: PluginManifest
    available: bool
    installed: bool
    missing_requirements: tuple[str, ...]
    available_tools: tuple[str, ...]


def _missing(requires: Sequence[str]) -> tuple[str, ...]:
    return tuple(key for key in requires if not _satisfied(key))


def mcp_manifests(tool_names: Sequence[str]) -> list[PluginManifest]:
    by_server: dict[str, list[str]] = {}
    for name in tool_names:
        if NAME_SEPARATOR not in name:
            continue
        server, _, _ = name.partition(NAME_SEPARATOR)
        by_server.setdefault(server, []).append(name)

    return [
        mcp_manifest(server, sorted(tools))
        for server, tools in sorted(by_server.items())
    ]


def all_manifests(existing_tools: Sequence[str]) -> list[PluginManifest]:
    return [*CATALOG, *mcp_manifests(existing_tools)]


def plugin_states(
    existing_tools: Sequence[str], installed: set[str]
) -> list[PluginState]:
    existing = set(existing_tools)
    manifests = all_manifests(existing_tools)

    missing = unknown_tools(existing, manifests)
    if missing:
        logger.warning(
            "Tools without a plugin -- unreachable for everyone: %s",
            ", ".join(sorted(missing)),
        )

    result: list[PluginState] = []
    for manifest in manifests:
        own = tuple(tool for tool in manifest.tools if tool in existing)
        available = bool(own)

        result.append(
            PluginState(
                manifest=manifest,
                available=available,
                installed=manifest.slug in installed,
                missing_requirements=() if available else _missing(manifest.requires),
                available_tools=own,
            )
        )
    return result


def allowed_tools(
    existing_tools: Sequence[str], installed: set[str]
) -> frozenset[str]:
    from_plugins = frozenset(
        tool
        for entry in plugin_states(existing_tools, installed)
        if entry.installed
        for tool in entry.available_tools
    )
    always = ALWAYS_AVAILABLE & set(existing_tools)
    return from_plugins | always


def prompt_block(
    states: Sequence[PluginState], always: Sequence[str] = ()
) -> str:
    enabled = [state for state in states if state.installed and state.available]
    disabled = [state for state in states if not (state.installed and state.available)]

    lines = ["## Your tools in this conversation"]

    if enabled:
        lines.append("")
        lines.append("Installed and usable:")
        lines.append("")
        for state in enabled:
            tools = ", ".join(f"`{tool}`" for tool in state.available_tools)
            lines.append(f"- **{state.manifest.title}** — {tools}")
    else:
        lines.append("")
        lines.append(
            "**No optional plugin is installed.** The built-in tools listed "
            "below are still available."
        )

    if always:
        lines.append("")
        lines.append(
            "Always available, regardless of plugins: "
            + ", ".join(f"`{tool}`" for tool in sorted(always))
            + ". Especially when little else is installed, ask with "
            "`ask_user` instead of guessing."
        )

    if disabled:
        lines.append("")
        lines.append(
            "Not installed. Whatever the prompt above says about these does "
            "**not** apply here:"
        )
        lines.append("")
        for state in disabled:
            reason = (
                f" (unavailable: {', '.join(state.missing_requirements)})"
                if not state.available and state.missing_requirements
                else ""
            )
            lines.append(f"- {state.manifest.title} — `{state.manifest.slug}`{reason}")

    lines.append("")
    lines.append(
        "Do not pretend you have a tool that is not installed: no call, no "
        "call-like notation, no \"let me quickly check\". Instead, say clearly "
        "that it is not installed and name the way to get it: `/install <slug>` "
        "in the chat, or the wrench next to the message box."
    )
    return "\n".join(lines)


def fingerprint(allowed: frozenset[str]) -> str:
    if not allowed:
        return "empty"
    import hashlib

    raw = ",".join(sorted(allowed)).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()[:12]
