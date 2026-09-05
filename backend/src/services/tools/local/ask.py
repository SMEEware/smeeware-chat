"""Eine Rueckfrage an den Menschen -- mit vorbereiteten Antworten.

Kein abrufendes Werkzeug, sondern Gespraechsfuehrung: es holt nichts und
veraendert nichts, es haelt an und fragt. Deshalb ist es wie ``notify_user``
immer verfuegbar und kein Plugin -- gerade wenn wenig installiert ist, soll
das Modell nachfragen koennen, statt ins Blaue zu raten.

Es blockiert nicht. Der Aufruf endet sofort, das Modell beendet seinen Turn,
und die Antwort kommt als naechste Nutzernachricht zurueck. Zu warten hiesse,
den Strom offen zu halten und die Frage bei jedem Neuladen zu verlieren; so
steht sie im gespeicherten Verlauf und ueberlebt alles.
"""

from __future__ import annotations

from typing import Any

from src.core.logging import get_logger
from src.services.tools.base import ToolError
from src.services.tools.local.base import LocalTool

logger = get_logger(__name__)

MAX_OPTIONEN = 4
MIN_OPTIONEN = 2
MAX_LAENGE = 120


class AskUserTool(LocalTool):
    name = "ask_user"
    description = (
        "Asks the user a question and offers them ready-made answers to pick "
        "from. Use it when you genuinely cannot proceed without knowing "
        "something: a decision only they can make, a fork where guessing wrong "
        "wastes the work, a missing detail that changes the answer. "
        "Give two options for a yes/no question and three when there is a real "
        "spread of choices -- never pad a yes/no question with an invented "
        "third. Each option must be a complete answer in the user's voice, "
        "short enough to read at a glance, and meaningfully different from the "
        "others. The user can always write their own answer instead. "
        "Do NOT use it to check in, to ask whether you should continue, or to "
        "offer help you could simply give. Asking costs the user a turn; be "
        "sure it buys something. "
        "After calling it, stop. Do not answer your own question, do not guess "
        "ahead, do not keep writing -- end your turn and wait for their reply."
    )
    parameters = {
        "type": "object",
        "properties": {
            "question": {
                "type": "string",
                "description": "The question, in one clear sentence",
            },
            "options": {
                "type": "array",
                "items": {"type": "string"},
                "minItems": MIN_OPTIONEN,
                "maxItems": MAX_OPTIONEN,
                "description": (
                    "Two to four answers the user can pick with one click. "
                    "Two for yes/no, three for an open choice."
                ),
            },
        },
        "required": ["question", "options"],
    }

    async def run(self, question: str, options: Any = None) -> str:
        frage = (question or "").strip()
        if not frage:
            raise ToolError("The question is empty.")

        gewaehlt = _optionen(options)

        logger.info("Rueckfrage: %s (%d Optionen)", frage[:100], len(gewaehlt))

        return (
            "The question and its options are now on screen. "
            "End your turn here: write nothing further, do not answer it "
            "yourself, do not anticipate. The user's reply arrives as their "
            "next message."
        )


def _optionen(roh: Any) -> list[str]:
    """Die Optionen pruefen, bevor sie auf dem Schirm landen.

    Streng, weil ein Modell hier gern schludert: leere Eintraege, Dubletten,
    ein ganzer Absatz als "Option". Was durchkaeme, waere eine Karte, die
    niemand bedienen kann.
    """
    if not isinstance(roh, list):
        raise ToolError("options must be a list of strings.")

    sauber: list[str] = []
    for eintrag in roh:
        if not isinstance(eintrag, str):
            raise ToolError("Every option must be a string.")
        text = " ".join(eintrag.split())
        if not text:
            continue
        if len(text) > MAX_LAENGE:
            raise ToolError(
                f"The option {text[:40]!r}... is too long. "
                f"Keep every option under {MAX_LAENGE} characters."
            )
        if text.lower() in {vorhanden.lower() for vorhanden in sauber}:
            continue
        sauber.append(text)

    if len(sauber) < MIN_OPTIONEN:
        raise ToolError(
            f"Give at least {MIN_OPTIONEN} distinct options -- "
            "a question with one answer is not a question."
        )
    return sauber[:MAX_OPTIONEN]
