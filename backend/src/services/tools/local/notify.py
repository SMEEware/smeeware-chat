"""Ein Hinweis, der beim Nutzer aufpoppt.

Das einzige Werkzeug, das auch dann bereitsteht, wenn alle anderen
abgeschaltet sind -- es ruft nichts ab und veraendert nichts, es sagt nur
etwas. Deshalb ist es keine Faehigkeit, die man abwaehlen wuerde, sondern
eher eine Stimme.

Die Beschreibung unten ist bewusst streng. Ein Modell, das ein Werkzeug
sieht, will es benutzen; ohne klare Schwelle wuerde jeder zweite Turn mit
einer Einblendung enden, und nach dem dritten Mal sieht sie niemand mehr an.
"""

from __future__ import annotations

from typing import Any

from src.core.logging import get_logger
from collections.abc import Callable

from src.services.events import EventBus
from src.services.notifications import VerschluesselteHinweise

HinweisQuelle = Callable[[], VerschluesselteHinweise | None]
from src.services.tools.base import ToolError
from src.services.tools.local.base import LocalTool

logger = get_logger(__name__)

STUFEN = ("info", "success", "warning", "error")


class NotifyUserTool(LocalTool):
    name = "notify_user"
    description = (
        "Shows a short notification to the user, outside the conversation. "
        "USE THIS ALMOST NEVER. The normal way to tell the user something is "
        "to write it in your answer, where they are already reading. A "
        "notification interrupts, and one that was not worth interrupting for "
        "teaches them to ignore the next one. "
        "Justified only when something happened that they need to know about "
        "and would otherwise miss: a long task finished while they were "
        "elsewhere, an action had a consequence they did not ask for, "
        "something failed in a way that silently changes what your answer is "
        "worth. "
        "Never use it to greet, to confirm you understood, to announce that "
        "you are starting, to repeat what your answer already says, or "
        "because the notification would look nice. If you are unsure, that is "
        "the answer: do not send one."
    )
    parameters = {
        "type": "object",
        "properties": {
            "title": {
                "type": "string",
                "description": (
                    "One short line, the point itself. Not 'Notice' or "
                    "'Info' -- say what happened."
                ),
            },
            "body": {
                "type": "string",
                "description": (
                    "Optional second line with the detail that makes the "
                    "title actionable. Leave it out if the title says it all."
                ),
            },
            "level": {
                "type": "string",
                "enum": list(STUFEN),
                "description": (
                    "info for something worth knowing, success for a task "
                    "that finished, warning for something that needs "
                    "attention, error for something that went wrong."
                ),
            },
        },
        "required": ["title"],
    }

    def __init__(self, bus: EventBus, hinweise: HinweisQuelle | None = None) -> None:
        self._bus = bus
        self._hinweise = hinweise

    async def run(self, **kwargs: Any) -> str:
        titel = str(kwargs.get("title") or "").strip()
        if not titel:
            raise ToolError("title must not be empty.")

        stufe = str(kwargs.get("level") or "info").lower()
        if stufe not in STUFEN:
            stufe = "info"

        text = str(kwargs.get("body") or "").strip() or None

        titel = titel[:120]
        text = text[:280] if text else None

        gespeichert = None
        if self._hinweise is not None and (speicher := self._hinweise()):
            try:
                gespeichert = await speicher.add(stufe, titel, text)
            except Exception:  # noqa: BLE001 -- Anzeigen ist wichtiger
                logger.exception("Hinweis liess sich nicht speichern")

        erreicht = await self._bus.publish(
            {
                "type": "toast",
                "id": gespeichert.id if gespeichert else None,
                "level": stufe,
                "title": titel,
                "body": text,
            }
        )

        logger.info("notify_user(%s): %s -> %d Client(s)", stufe, titel[:60], erreicht)

        if erreicht == 0:
            return (
                "No client was connected, so the notification was not shown. "
                "Put anything important into your answer instead."
            )
        return f"Notification shown to the user ({stufe})."
