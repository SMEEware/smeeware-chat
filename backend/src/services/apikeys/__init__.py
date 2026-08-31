"""API-Schluessel -- damit das Backend online gehen kann.

Ein Schluessel ist ein Zufallswert, den ein Aufrufer im ``Authorization``-Kopf
mitschickt. Er haengt am einen Konto dieser Installation und erlaubt genau
das, was ohne Anmeldung sonst niemand duerfte, sobald das Backend oeffentlich
steht: die Inferenz-Endpunkte ansprechen.

Anders als der Datenschluessel der Chats entsperrt ein API-Schluessel nichts
Verschluesseltes -- er kann es gar nicht, denn der DEK haengt am Passwort und
lebt nur in einer Sitzung. Ein API-Schluessel ist deshalb kein zweiter Weg
zu den Chats, sondern ein Ausweis fuer die zustandslosen Endpunkte.
"""

from __future__ import annotations

from src.services.apikeys.store import ApiKeyStore, Schluessel

__all__ = ["ApiKeyStore", "Schluessel"]
