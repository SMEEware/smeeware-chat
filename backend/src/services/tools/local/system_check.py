"""Der Systemcheck als Werkzeug.

Der Kniff steckt in der Aufteilung: dieselbe Messung geht zweimal raus, in
zwei sehr verschiedenen Formen.

Ans **Frontend** ueber den Ereignis-Bus, vollstaendig und strukturiert. Das
kostet keine Tokens, also darf das Modal alles zeigen.

Ans **Modell** nur eine Handvoll Zeilen mit den Befunden -- nicht die
Rohwerte. Beides zu schicken waere die teure Variante ohne jeden Gewinn:
das Modell soll einschaetzen, nicht rechnen, und das Modal zeigt die Zahlen
ohnehin schon.
"""

from __future__ import annotations

from typing import Any

from src.core.logging import get_logger
from src.services.events import EventBus
from src.services.system import SystemProbe
from src.services.tools.local.base import LocalTool

logger = get_logger(__name__)


class SystemCheckTool(LocalTool):
    name = "system_check"
    description = (
        "Measures the machine this backend runs on: CPU load, memory, disk, "
        "swap, uptime, the backend's own footprint, and whether a local model "
        "is loaded. "
        "Use it when the user asks how the system is doing, why something is "
        "slow, whether there is room for a large model or a big download, or "
        "before you start something expensive. "
        "You get the findings, not raw numbers -- thresholds are already "
        "applied, and anything unusual is listed under 'Notable'. The user "
        "simultaneously sees the full readings in a panel, so do not repeat "
        "the numbers back to them. Give them your reading of it: what stands "
        "out, what it means, what to do. If nothing stands out, say so in one "
        "sentence."
    )
    parameters = {"type": "object", "properties": {}}

    def __init__(self, probe: SystemProbe, bus: EventBus) -> None:
        self._probe = probe
        self._bus = bus

    async def run(self, **kwargs: Any) -> str:
        daten = await self._probe.messen()

        # Erst ans Frontend, damit das Modal steht, waehrend das Modell noch
        # formuliert -- der Nutzer liest die Zahlen und die Einschaetzung
        # dann nebeneinander statt nacheinander.
        erreicht = await self._bus.publish(
            {"type": "system", "daten": daten.als_dict()}
        )

        logger.info(
            "system_check: %d Hinweis(e), %d Client(s)",
            len(daten.hinweise),
            erreicht,
        )
        return daten.kurzfassung()
