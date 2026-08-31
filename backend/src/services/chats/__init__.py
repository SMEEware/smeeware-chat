"""Chat-Persistenz -- Verlaeufe, die einen Reload ueberleben.

Bewusst getrennt vom Chat selbst: ``routes/chat.py`` bleibt zustandslos und
bekommt bei jedem Turn den vollen Verlauf geschickt. Wer speichert, ist das
Frontend -- es vergibt die ID (``crypto.randomUUID``) und schiebt nach jedem
Turn den kompletten Verlauf per PUT hierher.

Gespeichert wird das Nachrichtenformat des Frontends, nicht
``schemas/chat.py::ChatMessage``: neben role/content also auch ``parts[]``
(Reasoning-Abschnitte und Tool-Calls in Reihenfolge), id, model, durationMs
und aborted. Das Backend interpretiert davon nichts -- es legt ab und gibt
unveraendert zurueck.
"""

from __future__ import annotations

from src.services.chats.base import ChatInfo, ChatStore, StoredChat
from src.services.chats.sqlite import SqliteChatStore

__all__ = ["ChatInfo", "ChatStore", "SqliteChatStore", "StoredChat"]
