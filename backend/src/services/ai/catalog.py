"""Welche Modelle es gibt, wo sie laufen und unter welcher Ueberschrift.

Eine feste Liste, kein Abruf beim Anbieter: die gehosteten Eintraege unten
sind das, was das Frontend im Auswahlfeld zeigt und was ``/chat`` als
``model`` akzeptiert. Wer ein gehostetes Modell hinzufuegt, aendert genau
diese Datei. Das LOKALE Modell steht bewusst NICHT hier: es entsteht zur
Laufzeit aus ``OLLAMA_MODEL`` (siehe ``lokale_modelle``), weil erst die
``.env`` weiss, welcher Tag gemeint ist.

Drei Dinge trennt ein Eintrag bewusst:

``id`` ist der Name nach aussen -- kurz, stabil, und das, was in gespeicherten
Verlaeufen steht. ``upstream`` ist der Name, den der Anbieter kennt. Bei
DeepSeek und OpenAI ist beides gleich; ein Ollama-Tag wie
``hf.co/foo/Bar-Model:Q4_K_M`` will dagegen niemand in einem Auswahlfeld
lesen, und ein Schraegstrich in einer id, die durch URLs und Ablagen wandert,
ist eine Falle -- ``lokale_modelle`` kuerzt den Tag deshalb zu einer sauberen
id ein.

``runtime`` sagt *wo*, nicht *wer*: "hosted" ist der Anbieter aus
``LLM_PROVIDER``, "local" ist Ollama, "openai" ist die Responses-API.
Stuende hier "deepseek", wuerde ein Wechsel von ``LLM_PROVIDER`` die halbe
Liste ins Leere zeigen lassen.

``group`` ist reine Anzeige -- die Ueberschrift im Auswahlfeld. Sie steht
hier und nicht im Frontend, damit ein neues Modell an genau einer Stelle
entsteht und nicht an zweien.
"""

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
    # Ueberschrift im Auswahlfeld ("OpenAI", "DeepSeek", "Local").
    group: str
    # Wie viel das Modell denken soll. Nur fuer runtime="openai" -- die
    # anderen kennen keinen Schalter dafuer.
    reasoning_effort: str | None = None
    # Kann das Modell Werkzeuge aufrufen? Steuert nur die Anzeige; wer
    # trotzdem Werkzeuge schickt, bekommt sie vom Anbieter abgelehnt.
    tools: bool = True
    # Braucht eine Freischaltung beim Anbieter. Diese Modelle stehen in der
    # Liste, weil sie gewollt sind -- ohne Freigabe antwortet die API aber
    # mit "model does not exist". Das Feld macht daraus einen Hinweis im
    # Auswahlfeld statt einer raetselhaften Fehlermeldung im Chat.
    gated: bool = False


CATALOG: tuple[ModelEntry, ...] = (
    # -- OpenAI ------------------------------------------------------- #
    ModelEntry(
        id="gpt-5.6-sol",
        name="GPT-5.6 Sol",
        description="Flagship for complex work — reasons hard, uses every tool.",
        runtime="openai",
        upstream="gpt-5.6-sol",
        group="OpenAI",
        reasoning_effort="high",
    ),
    ModelEntry(
        id="gpt-5.6-terra",
        name="GPT-5.6 Terra",
        description="Balances intelligence and cost. The one to reach for first.",
        runtime="openai",
        upstream="gpt-5.6-terra",
        group="OpenAI",
        reasoning_effort="medium",
    ),
    ModelEntry(
        id="gpt-5.6-luna",
        name="GPT-5.6 Luna",
        description="Cheap and quick for high volume — still reasons and calls tools.",
        runtime="openai",
        upstream="gpt-5.6-luna",
        group="OpenAI",
        reasoning_effort="low",
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
        gated=True,
    ),
    # -- DeepSeek ----------------------------------------------------- #
    ModelEntry(
        id="deepseek-v4-flash",
        name="DeepSeek V4 Flash",
        description="Fast and inexpensive — the default for chat.",
        runtime="hosted",
        upstream="deepseek-v4-flash",
        group="DeepSeek",
    ),
    ModelEntry(
        id="deepseek-v4-pro",
        name="DeepSeek V4 Pro",
        description="Stronger on complex tasks, but slower.",
        runtime="hosted",
        upstream="deepseek-v4-pro",
        group="DeepSeek",
    ),
    # Lokale Modelle stehen bewusst NICHT hier: sie entstehen zur Laufzeit aus
    # ``OLLAMA_MODEL`` (siehe ``lokale_modelle`` weiter unten). Welcher Tag
    # gemeint ist, weiss erst die ``.env`` -- ihn hier fest einzutragen hiesse,
    # jedem Betreiber dasselbe Modell vorzuschreiben.
)

# Was ``/chat`` ohne explizite Angabe verwendet.
DEFAULT_MODEL = "deepseek-v4-flash"

# Die Reihenfolge der Ueberschriften im Auswahlfeld. Aus dem Katalog
# abgeleitet statt fest verdrahtet: eine neue Gruppe taucht damit von
# selbst auf, und zwar dort, wo ihr erster Eintrag steht.
GROUPS: tuple[str, ...] = tuple(dict.fromkeys(entry.group for entry in CATALOG))

# Beide Namen zeigen auf denselben Eintrag. Ein Client, der den vollen Tag
# schickt -- ein aelteres Frontend, ein curl aus der Doku -- soll nicht an
# einem Namen scheitern, den wir selbst vergeben haben.
_BY_ID: dict[str, ModelEntry] = {}
for _entry in CATALOG:
    _BY_ID[_entry.id] = _entry
    _BY_ID.setdefault(_entry.upstream, _entry)


def _lokale_id(tag: str) -> str:
    """Aus einem Ollama-Tag eine kurze, stabile id fuers Auswahlfeld.

    Der Tag darf einen Registry-Pfad und ein ``:version``-Suffix tragen
    (``hf.co/foo/Bar-Model:Q4``); nichts davon will man in einer id, die durch
    URLs und Ablagen wandert. Also: letzter Pfadteil, Version ab, klein, und
    alles Uebrige zu Bindestrichen -- ein Schraegstrich in einer id waere eine
    Falle, die der Katalog sich sonst ueberall einhandelt.
    """
    kern = tag.rsplit("/", 1)[-1].split(":", 1)[0]
    schlank = re.sub(r"[^a-z0-9._-]+", "-", kern.lower()).strip("-")
    return schlank or "local"


def lokale_modelle(ollama: OllamaSettings) -> tuple[ModelEntry, ...]:
    """Die lokalen Katalogeintraege -- 0 oder 1, aus ``OLLAMA_MODEL`` gebaut.

    Kein fester Eintrag: welches Modell lokal laeuft, entscheidet die ``.env``.
    Leer, solange Ollama nicht an ist ODER kein Modell benannt wurde -- ein
    Eintrag, der beim ersten Klick scheitert, waere schlimmer als keiner.

    Ob das gewaehlte Modell wirklich denkt und Werkzeuge kann, weiss nur, wer
    es einträgt -- ``tools=True`` heisst hier "das Backend blockiert es nicht",
    nicht "das Modell beherrscht es".
    """
    if not ollama.konfiguriert:
        return ()
    tag = ollama.model.strip()
    return (
        ModelEntry(
            id=_lokale_id(tag),
            name=tag.rsplit("/", 1)[-1],
            description="Runs locally through Ollama — nothing leaves the machine.",
            runtime="local",
            upstream=tag,
            group="Local",
            tools=True,
        ),
    )


def verfuegbar(
    *, openai: bool, lokal: tuple[ModelEntry, ...] = ()
) -> tuple[ModelEntry, ...]:
    """Der Katalog, gefiltert auf das, was gerade wirklich laufen kann.

    Ein Modell anzubieten, dessen Anbieter abgeschaltet ist oder dessen
    Schluessel fehlt, waere eine Auswahl, die sicher scheitert. Die
    freischaltpflichtigen Eintraege bleiben dagegen drin: dort ist der
    Schluessel da, nur die Freigabe fehlt -- das steht als Hinweis am
    Eintrag und ist keine Frage der Konfiguration.

    Die lokalen Eintraege kommen fertig gefiltert von aussen (``lokal``): der
    Katalog kennt weder die ``.env`` noch, ob ein Ollama gerade erreichbar ist.
    """
    gehostet = tuple(
        entry for entry in CATALOG if entry.runtime != "openai" or openai
    )
    return gehostet + lokal


def resolve(model_id: str | None, *, lokal: tuple[ModelEntry, ...] = ()) -> ModelEntry:
    """Name rein, Eintrag raus. Unbekanntes wird benannt, nicht durchgereicht.

    Frueher landete jeder String beim einen Anbieter und scheiterte dort mit
    dessen Fehlermeldung. Bei drei Anbietern waere das eine Ratestunde --
    also lieber hier ein klares 422 mit der Liste dessen, was es gibt.

    ``lokal`` traegt die zur Laufzeit gebauten Ollama-Eintraege bei; sie werden
    unter id UND vollem Tag auffindbar, damit auch ein Client mit dem rohen Tag
    nicht scheitert.
    """
    tabelle = dict(_BY_ID)
    for entry in lokal:
        tabelle[entry.id] = entry
        tabelle.setdefault(entry.upstream, entry)

    if not model_id:
        return tabelle[DEFAULT_MODEL]

    if (entry := tabelle.get(model_id)) is not None:
        return entry

    bekannt = ", ".join(
        dict.fromkeys([e.id for e in CATALOG] + [e.id for e in lokal])
    )
    raise ValidationError(f"Unknown model {model_id!r}. Known: {bekannt}.")
