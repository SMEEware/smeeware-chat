"""Was ein Plugin ist -- und was es ueber sich sagt.

Ein Plugin buendelt zusammengehoerige Werkzeuge unter einem Namen, den ein
Mensch versteht. Aus 37 Werkzeugen werden so 13 Karten.

Die Inhalte sind englisch, weil die Oberflaeche es ist. Das gilt fuer Titel,
Zusammenfassung und Beschreibung; die Kommentare hier bleiben deutsch wie im
uebrigen Backend.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

Category = Literal[
    "search",
    "web",
    "media",
    "files",
    "skills",
    "system",
    "security",
]

CATEGORY_LABELS: dict[Category, str] = {
    "search": "Search",
    "web": "Web",
    "media": "Media",
    "files": "Files",
    "skills": "Skills",
    "system": "System",
    "security": "Security",
}


IMMER_VERFUEGBAR = frozenset({"notify_user", "ask_user"})
"""Werkzeuge, die kein Plugin sind und nie gefiltert werden.

Keine Faehigkeiten, sondern Gespraechsfuehrung: eine Einblendung und eine
Rueckfrage. Sie abwaehlbar zu machen hiesse, dem Modell die Stimme zu nehmen
-- und ausgerechnet wenn wenig installiert ist, braucht es die Rueckfrage am
ehesten, um nicht ins Blaue zu raten.
"""


@dataclass(frozen=True, slots=True)
class PluginManifest:
    """Die Selbstbeschreibung eines Plugins.

    ``requires`` nennt Env-Variablen, ohne die es nicht laufen kann -- rein
    zur Anzeige. Ob es wirklich laeuft, wird nicht hier behauptet, sondern
    daran gemessen, ob seine Werkzeuge in der gebauten Toolbox stehen. Zwei
    Quellen fuer dieselbe Wahrheit wuerden auseinanderlaufen.

    ``icon`` traegt einen lucide-Namen. So bekommt ein neues Plugin ein Symbol,
    ohne dass im Frontend eine Zuordnungstabelle gepflegt werden muss.
    """

    slug: str
    title: str
    category: Category
    summary: str
    description: str
    tools: tuple[str, ...]
    requires: tuple[str, ...] = ()
    icon: str = "Puzzle"
