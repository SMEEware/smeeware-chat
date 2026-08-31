"""Die Stimme, die *dieser* Aufruf benutzen soll.

Das Vorlese-Werkzeug wird einmal gebaut und lebt so lange wie der Prozess.
Die gewuenschte Stimme dagegen kommt pro Anfrage aus dem Browser -- sie ist
eine Vorliebe des Nutzers, kein Bestandteil des Werkzeugs.

Der Weg dazwischen ist ein ``ContextVar``: die Chat-Route setzt ihn aus dem
Anfragerumpf, bevor der Agent laeuft, und das Werkzeug liest ihn beim Aufruf.
Weil ``asyncio.create_task`` den aktuellen Kontext kopiert, sieht die Aufgabe,
in der der Agent laeuft, genau den Wert, den die Route gesetzt hat -- ohne dass
Stimme und Modell durch jede Zwischenschicht gereicht werden muessen.

Das Modell waehlt die Stimme bewusst NICHT: welche Stimme spricht, entscheidet
der Nutzer in den Einstellungen, nicht ein Werkzeugaufruf.
"""

from __future__ import annotations

from contextvars import ContextVar
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class SprachWahl:
    """Was der Nutzer fuer diese Anfrage gewaehlt hat -- beides optional."""

    model: str | None = None
    voice: str | None = None


_WAHL: ContextVar[SprachWahl | None] = ContextVar("sprach_wahl", default=None)


def setze_wahl(model: str | None, voice: str | None) -> None:
    """Aus dem Anfragerumpf -- leere Werte gelten als "nicht gesetzt"."""
    model = (model or "").strip() or None
    voice = (voice or "").strip() or None
    _WAHL.set(SprachWahl(model=model, voice=voice) if (model or voice) else None)


def hole_wahl() -> SprachWahl:
    """Die Wahl dieses Aufrufs -- oder eine leere, dann gelten die Vorgaben."""
    return _WAHL.get() or SprachWahl()
