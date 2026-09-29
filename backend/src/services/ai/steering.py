"""Eingeschobene Nachrichten -- der Nutzer redet, waehrend der Agent arbeitet.

Wie in Claude: schickt der Nutzer waehrend eines laufenden Turns eine
Nachricht, soll der Agent sie aufnehmen, sobald der aktuelle Schritt durch
ist -- nach den Werkzeugergebnissen einer Runde, bevor das Modell wieder
gefragt wird. Mitten in eine laufende Generierung laesst sich nichts
einfuegen; kommt keine Werkzeugrunde mehr, geht die Nachricht als naechster
Turn raus (das entscheidet der Client, siehe ``drain``-Quittung).

Ein Postfach je laufendem Stream, adressiert ueber eine vom Client erzeugte
``stream_id``. Bewusst im Speicher: das Backend laeuft mit einem Worker
(Sitzungen liegen ebenfalls im Speicher), und ein Postfach lebt nur so lange
wie sein Stream.
"""

from __future__ import annotations

from dataclasses import dataclass, field

# Mehr als das schickt kein Mensch waehrend eines Turns -- die Grenze schuetzt
# nur vor einem Client, der in einer Schleife haengt.
MAX_JE_STREAM = 20


@dataclass(frozen=True, slots=True)
class Einschub:
    id: str
    text: str


@dataclass(slots=True)
class _Postfach:
    offen: list[Einschub] = field(default_factory=list)


class SteeringRegistry:
    def __init__(self) -> None:
        self._postfaecher: dict[str, _Postfach] = {}

    def oeffnen(self, stream_id: str) -> None:
        self._postfaecher.setdefault(stream_id, _Postfach())

    def schliessen(self, stream_id: str) -> None:
        self._postfaecher.pop(stream_id, None)

    def einwerfen(self, stream_id: str, einschub: Einschub) -> bool:
        """False, wenn es den Stream nicht (mehr) gibt -- der Client schickt
        die Nachricht dann als naechsten Turn."""
        postfach = self._postfaecher.get(stream_id)
        if postfach is None or len(postfach.offen) >= MAX_JE_STREAM:
            return False
        if any(e.id == einschub.id for e in postfach.offen):
            return True
        postfach.offen.append(einschub)
        return True

    def zurueckziehen(self, stream_id: str, einschub_id: str) -> bool:
        postfach = self._postfaecher.get(stream_id)
        if postfach is None:
            return False
        vorher = len(postfach.offen)
        postfach.offen = [e for e in postfach.offen if e.id != einschub_id]
        return len(postfach.offen) < vorher

    def leeren(self, stream_id: str) -> list[Einschub]:
        """Alles Wartende herausnehmen -- genau einmal, in Eingangsreihenfolge."""
        postfach = self._postfaecher.get(stream_id)
        if postfach is None or not postfach.offen:
            return []
        raus, postfach.offen = postfach.offen, []
        return raus


STEERING = SteeringRegistry()
