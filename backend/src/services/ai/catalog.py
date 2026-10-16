from __future__ import annotations

import re
from dataclasses import dataclass
from typing import TYPE_CHECKING, Literal

from src.core.exceptions import ValidationError

if TYPE_CHECKING:
    from src.core.config import OllamaSettings

Runtime = Literal["hosted", "local", "openai"]


@dataclass(frozen=True, slots=True)
class ModelEntry:
    id: str
    name: str
    description: str
    runtime: Runtime
    upstream: str
    group: str
    reasoning_effort: str | None = None
    reasoning_efforts: tuple[str, ...] = ()
    tools: bool = True
    gated: bool = False


OPENAI_56_EFFORTS = ("none", "low", "medium", "high", "xhigh", "max")
DEEPSEEK_V4_EFFORTS = ("low", "high", "max")

CATALOG: tuple[ModelEntry, ...] = (
    ModelEntry(
        id="gpt-5.6-sol",
        name="GPT-5.6 Sol",
        description="Flagship for complex work — reasons hard, uses every tool.",
        runtime="openai",
        upstream="gpt-5.6-sol",
        group="OpenAI",
        reasoning_effort="high",
        reasoning_efforts=OPENAI_56_EFFORTS,
    ),
    ModelEntry(
        id="gpt-5.6-terra",
        name="GPT-5.6 Terra",
        description="Balances intelligence and cost. The one to reach for first.",
        runtime="openai",
        upstream="gpt-5.6-terra",
        group="OpenAI",
        reasoning_effort="medium",
        reasoning_efforts=OPENAI_56_EFFORTS,
    ),
    ModelEntry(
        id="gpt-5.6-luna",
        name="GPT-5.6 Luna",
        description="Cheap and quick for high volume — still reasons and calls tools.",
        runtime="openai",
        upstream="gpt-5.6-luna",
        group="OpenAI",
        reasoning_effort="low",
        reasoning_efforts=OPENAI_56_EFFORTS,
    ),
    ModelEntry(
        id="gpt-5.6-cyber",
        name="GPT-5.6 Cyber",
        description=(
            "Security model for authorised vulnerability research. "
            "Needs approval from OpenAI before it answers."
        ),
        runtime="openai",
        upstream="gpt-5.6-cyber",
        group="OpenAI",
        reasoning_effort="high",
        gated=True,
    ),
    ModelEntry(
        id="daybreak-red",
        name="Daybreak Red",
        description=(
            "Offensive security research. Needs approval from OpenAI "
            "before it answers."
        ),
        runtime="openai",
        upstream="gpt-daybreak-red-latest",
        group="OpenAI",
        reasoning_effort="high",
        gated=True,
    ),
    ModelEntry(
        id="daybreak-blue",
        name="Daybreak Blue",
        description=(
            "Defensive security work with safeguards. Needs approval from "
            "OpenAI before it answers."
        ),
        runtime="openai",
        upstream="gpt-daybreak-blue-latest",
        group="OpenAI",
        reasoning_effort="high",
        # The documented alias points to GPT-5.6 Sol.
        reasoning_efforts=OPENAI_56_EFFORTS,
        gated=True,
    ),
    ModelEntry(
        id="deepseek-v4-flash",
        name="DeepSeek V4 Flash",
        description="Fast and inexpensive — the default for chat.",
        runtime="hosted",
        upstream="deepseek-v4-flash",
        group="DeepSeek",
        reasoning_effort="max",
        reasoning_efforts=DEEPSEEK_V4_EFFORTS,
    ),
    ModelEntry(
        id="deepseek-v4-pro",
        name="DeepSeek V4 Pro",
        description="Stronger on complex tasks, but slower.",
        runtime="hosted",
        upstream="deepseek-v4-pro",
        group="DeepSeek",
        reasoning_effort="max",
        reasoning_efforts=DEEPSEEK_V4_EFFORTS,
    ),
)

DEFAULT_MODEL = "deepseek-v4-flash"

GROUPS: tuple[str, ...] = tuple(dict.fromkeys(entry.group for entry in CATALOG))

_BY_ID: dict[str, ModelEntry] = {}
for _entry in CATALOG:
    _BY_ID[_entry.id] = _entry
    _BY_ID.setdefault(_entry.upstream, _entry)


def known_model(model_id: str, *, runtime: Runtime) -> ModelEntry | None:
    entry = _BY_ID.get(model_id)
    return entry if entry is not None and entry.runtime == runtime else None


def reasoning_effort_for(entry: ModelEntry, requested: str | None) -> str | None:
    """Only offer documented overrides; stale preferences retain the model default."""
    if requested in entry.reasoning_efforts:
        return requested
    return entry.reasoning_effort


def _local_id(tag: str) -> str:
    core = tag.rsplit("/", 1)[-1].split(":", 1)[0]
    slug = re.sub(r"[^a-z0-9._-]+", "-", core.lower()).strip("-")
    slug = slug or "local"
    return f"local-{slug}" if slug in _BY_ID else slug


def local_models(ollama: OllamaSettings) -> tuple[ModelEntry, ...]:
    if not ollama.configured:
        return ()
    tag = ollama.model.strip()
    return (
        ModelEntry(
            id=_local_id(tag),
            name=tag.rsplit("/", 1)[-1],
            description="Runs locally through Ollama — nothing leaves the machine.",
            runtime="local",
            upstream=tag,
            group="Local",
            tools=True,
        ),
    )


def available(
    *, openai: bool, local: tuple[ModelEntry, ...] = (),
    hosted: tuple[ModelEntry, ...] | None = None,
) -> tuple[ModelEntry, ...]:
    entries = tuple(
        entry for entry in CATALOG if entry.runtime != "openai" or openai
    )
    if hosted is not None:
        entries = tuple(entry for entry in entries if entry.runtime != "hosted") + hosted
    return entries + local


def resolve(model_id: str | None, *, local: tuple[ModelEntry, ...] = ()) -> ModelEntry:
    table = dict(_BY_ID)
    for entry in local:
        table[entry.id] = entry
        table.setdefault(entry.upstream, entry)

    if not model_id:
        return table[DEFAULT_MODEL]

    if (entry := table.get(model_id)) is not None:
        return entry

    known = ", ".join(
        dict.fromkeys([e.id for e in CATALOG] + [e.id for e in local])
    )
    raise ValidationError(f"Unknown model {model_id!r}. Known: {known}.")
