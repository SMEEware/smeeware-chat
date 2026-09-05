"""Der Katalog, wie ihn die Oberflaeche sieht.

Fuehrt drei Dinge zusammen, die getrennt entstehen: die statischen Manifeste,
die MCP-Server (die erst zur Laufzeit feststehen) und den Zustand aus der
Datenbank.

Die Trennung ist Absicht. ``available`` wird an der gebauten Toolbox GEMESSEN
und nicht im Manifest behauptet -- ``create_local_toolbox`` entscheidet das
bereits anhand der vorhandenen Schluessel, und eine zweite Quelle wuerde
davon abweichen, sobald jemand eine der beiden pflegt und die andere vergisst.
"""

from __future__ import annotations

import os
from collections.abc import Sequence
from dataclasses import dataclass

from src.core.logging import get_logger
from src.services.plugins.catalog import KATALOG, mcp_manifest, unbekannte_werkzeuge
from src.services.plugins.manifest import IMMER_VERFUEGBAR, PluginManifest
from src.services.tools.base import NAME_SEPARATOR

logger = get_logger(__name__)

FALSCH = {"", "0", "false", "no", "off"}


def _erfuellt(schluessel: str) -> bool:
    """Ist diese Voraussetzung gegeben?

    Reicht nicht, dass die Variable gesetzt ist: Schalter wie SHELL_ENABLED
    stehen auf ``false``, und ``os.getenv`` liefert dafuer einen nichtleeren
    String -- der waere wahrheitswertig und das Plugin sae faelschlich
    voraussetzungsfrei aus. Ein API-Schluessel ist nie ``false``, also
    vertraegt dieselbe Regel beide Faelle.
    """
    wert = os.getenv(schluessel)
    return wert is not None and wert.strip().lower() not in FALSCH


@dataclass(frozen=True, slots=True)
class PluginZustand:
    """Ein Plugin mit allem, was die Oberflaeche darueber wissen muss."""

    manifest: PluginManifest
    available: bool
    installed: bool
    missing_requirements: tuple[str, ...]
    available_tools: tuple[str, ...]


def _fehlt(requires: Sequence[str]) -> tuple[str, ...]:
    """Warum ein Plugin nicht laeuft -- gefragt nur, wenn es nicht laeuft.

    Die Verfuegbarkeit wird an der Toolbox gemessen, nicht hier abgeleitet.
    Der Grund dafuer ist ein Fall, den man sonst falsch anzeigt: Schalter wie
    STORAGE_ENABLED stehen standardmaessig auf an und fehlen in der .env
    voellig. ``os.getenv`` liefert dann None -- als eigenstaendige Pruefung
    hiesse das "Voraussetzung fehlt", obwohl das Werkzeug laeuft.
    """
    return tuple(schluessel for schluessel in requires if not _erfuellt(schluessel))


def mcp_manifeste(werkzeugnamen: Sequence[str]) -> list[PluginManifest]:
    """MCP-Werkzeuge nach Server gruppieren.

    Der Servername steht im Werkzeugnamen vor ``NAME_SEPARATOR`` -- so setzt
    ihn ``McpToolBox`` zusammen. Ihn von dort zu lesen ist billiger und
    robuster, als sich in die Innereien der Box zu greifen.
    """
    nach_server: dict[str, list[str]] = {}
    for name in werkzeugnamen:
        if NAME_SEPARATOR not in name:
            continue
        server, _, _ = name.partition(NAME_SEPARATOR)
        nach_server.setdefault(server, []).append(name)

    return [
        mcp_manifest(server, sorted(werkzeuge))
        for server, werkzeuge in sorted(nach_server.items())
    ]


def alle_manifeste(vorhandene_werkzeuge: Sequence[str]) -> list[PluginManifest]:
    return [*KATALOG, *mcp_manifeste(vorhandene_werkzeuge)]


def zustand(
    vorhandene_werkzeuge: Sequence[str], installiert: set[str]
) -> list[PluginZustand]:
    vorhanden = set(vorhandene_werkzeuge)
    manifeste = alle_manifeste(vorhandene_werkzeuge)

    fehlend = unbekannte_werkzeuge(vorhanden, manifeste)
    if fehlend:
        logger.warning(
            "Werkzeuge ohne Plugin -- fuer niemanden erreichbar: %s",
            ", ".join(sorted(fehlend)),
        )

    heraus: list[PluginZustand] = []
    for manifest in manifeste:
        eigene = tuple(w for w in manifest.tools if w in vorhanden)
        verfuegbar = bool(eigene)

        heraus.append(
            PluginZustand(
                manifest=manifest,
                available=verfuegbar,
                installed=manifest.slug in installiert,
                missing_requirements=() if verfuegbar else _fehlt(manifest.requires),
                available_tools=eigene,
            )
        )
    return heraus


def erlaubte_werkzeuge(
    vorhandene_werkzeuge: Sequence[str], installiert: set[str]
) -> frozenset[str]:
    """Was nach der Auswahl uebrig bleibt.

    Der Schnitt aus "gibt es" und "ist installiert": ein installiertes Plugin,
    dessen Schluessel fehlt, traegt nichts bei, statt einen Namen anzubieten,
    hinter dem nichts steht.
    """
    aus_plugins = frozenset(
        werkzeug
        for eintrag in zustand(vorhandene_werkzeuge, installiert)
        if eintrag.installed
        for werkzeug in eintrag.available_tools
    )
    immer = IMMER_VERFUEGBAR & set(vorhandene_werkzeuge)
    return aus_plugins | immer


def prompt_block(
    zustaende: Sequence[PluginZustand], immer: Sequence[str] = ()
) -> str:
    """Was das Modell ueber seine eigene Ausstattung wissen muss.

    Ohne diesen Abschnitt glaubt es, alles zu koennen: der System-Prompt
    beschreibt Websuche, Shell, Speicher und Skills in festen Abschnitten,
    unabhaengig davon, was tatsaechlich geladen ist. Die Werkzeugliste allein
    korrigiert das nicht -- ein Modell liest die Prosa und kuendigt eine Suche
    an, die es nicht ausfuehren kann.

    Der Abschnitt nennt beide Seiten. Nur die installierten zu nennen liesse
    offen, ob der Rest fehlt oder nur vergessen wurde; die fehlenden mit ihrem
    slug zu nennen macht die Antwort an den Nutzer brauchbar ("nicht
    installiert -- /install web-search").
    """
    an = [z for z in zustaende if z.installed and z.available]
    aus = [z for z in zustaende if not (z.installed and z.available)]

    zeilen = ["## Deine Werkzeuge in diesem Gespräch"]

    if an:
        zeilen.append("")
        zeilen.append("Installiert und benutzbar:")
        zeilen.append("")
        for z in an:
            werkzeuge = ", ".join(f"`{w}`" for w in z.available_tools)
            zeilen.append(f"- **{z.manifest.title}** — {werkzeuge}")
    else:
        zeilen.append("")
        zeilen.append(
            "**Es ist kein Plugin installiert.** Du hast in diesem Gespräch "
            "keine abrufenden oder verändernden Werkzeuge."
        )

    if immer:
        zeilen.append("")
        zeilen.append(
            "Immer verfügbar, unabhängig von den Plugins: "
            + ", ".join(f"`{w}`" for w in sorted(immer))
            + ". Gerade wenn sonst wenig installiert ist, frag lieber mit "
            "`ask_user` nach, statt zu raten."
        )

    if aus:
        zeilen.append("")
        zeilen.append(
            "Nicht installiert — alles, was oben im Prompt darüber steht, gilt "
            "hier **nicht**:"
        )
        zeilen.append("")
        for z in aus:
            grund = (
                f" (nicht verfügbar: {', '.join(z.missing_requirements)})"
                if not z.available and z.missing_requirements
                else ""
            )
            zeilen.append(f"- {z.manifest.title} — `{z.manifest.slug}`{grund}")

    zeilen.append("")
    zeilen.append(
        "Tu nicht so, als hättest du ein nicht installiertes Werkzeug: kein "
        "Aufruf, keine aufruf-ähnliche Schreibweise, kein „ich schaue kurz "
        "nach\". Sag stattdessen klar, dass es nicht installiert ist, und nenne "
        "den Weg dahin: `/install <slug>` im Chat oder der "
        "Schraubenschlüssel neben dem Eingabefeld."
    )
    return "\n".join(zeilen)


def fingerabdruck(erlaubt: frozenset[str]) -> str:
    """Stabiler Kurzschluessel fuer den Agenten-Cache.

    ``agent_for`` cacht den Agenten mit fest verdrahteter Toolbox. Ohne diesen
    Anteil im Schluessel antwortete nach dem Umschalten weiter der alte Agent
    mit der alten Werkzeugliste -- ohne Fehlermeldung, was den Fehler teuer
    macht.
    """
    if not erlaubt:
        return "leer"
    import hashlib

    roh = ",".join(sorted(erlaubt)).encode("utf-8")
    return hashlib.sha256(roh).hexdigest()[:12]
