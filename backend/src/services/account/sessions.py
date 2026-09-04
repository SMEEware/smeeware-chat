"""Offene Sitzungen -- und mit ihnen der Datenschluessel.

Der DEK liegt ausschliesslich hier, im Speicher des laufenden Prozesses. Er
wandert nie in ein Cookie, nie in ein Log, nie auf die Platte. Das hat eine
Folge, die Absicht ist: nach einem Neustart des Backends muss man sich neu
anmelden, weil der Schluessel mit dem Prozess verschwunden ist. Genau das
macht "verschluesselt auf der Platte" ueberhaupt erst wahr -- laege er
irgendwo bereit, koennte ihn auch jemand anderes finden.

Was ins Cookie geht, ist nur die Sitzungskennung: ein Zufallswert, der fuer
sich genommen nichts entschluesselt.
"""

from __future__ import annotations

import secrets
import time
from dataclasses import dataclass

from src.core.logging import get_logger

logger = get_logger(__name__)


@dataclass(slots=True)
class Sitzung:
    dek: bytes
    username: str
    laeuft_ab: float


class SessionStore:
    def __init__(self, ttl_seconds: float = 12 * 3600) -> None:
        self._ttl = ttl_seconds
        self._sitzungen: dict[str, Sitzung] = {}

    def oeffnen(self, username: str, dek: bytes) -> str:
        self._aufraeumen()
        kennung = secrets.token_urlsafe(32)
        self._sitzungen[kennung] = Sitzung(
            dek=dek, username=username, laeuft_ab=time.time() + self._ttl
        )
        return kennung

    def holen(self, kennung: str | None) -> Sitzung | None:
        if not kennung:
            return None
        sitzung = self._sitzungen.get(kennung)
        if sitzung is None:
            return None
        if sitzung.laeuft_ab <= time.time():
            del self._sitzungen[kennung]
            return None
        sitzung.laeuft_ab = time.time() + self._ttl
        return sitzung

    def aktiver_schluessel(self) -> bytes | None:
        """Der Datenschluessel des Kontos -- aus irgendeiner offenen Sitzung.

        Wirkt lose, ist es aber nicht: diese Anwendung hat genau ein Konto,
        und alle Sitzungen tragen denselben Schluessel. Wer ihn hier holt,
        bekommt den des Kontos, nicht "irgendeinen".

        Gedacht fuer Stellen ohne Anfrage im Ruecken -- ein Werkzeug im
        Agenten etwa, das einen Hinweis wegschreiben will. Ist niemand
        angemeldet, gibt es keinen Schluessel, und dann gibt es auch
        niemanden, der den Hinweis lesen wollte.
        """
        self._aufraeumen()
        for sitzung in self._sitzungen.values():
            return sitzung.dek
        return None

    def schliessen(self, kennung: str | None) -> None:
        if kennung:
            self._sitzungen.pop(kennung, None)

    def alle_schliessen(self) -> None:
        """Nach einer Passwortaenderung -- alte Sitzungen halten alte Schluessel."""
        self._sitzungen.clear()

    def _aufraeumen(self) -> None:
        jetzt = time.time()
        for kennung in [
            k for k, s in self._sitzungen.items() if s.laeuft_ab <= jetzt
        ]:
            del self._sitzungen[kennung]
