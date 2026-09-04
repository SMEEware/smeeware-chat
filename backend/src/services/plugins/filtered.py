"""Eine Toolbox, die nur durchlaesst, was installiert ist.

Eine Huelle statt einer zweiten Toolbox -- dasselbe Muster, mit dem
``EncryptedChatStore`` um den Chat-Speicher liegt. Der teure Teil (HTTP-Client,
MCP-Verbindungen) wird weiter genau einmal aufgebaut; gefiltert wird nur die
Sicht darauf.

Zwei Ebenen, mit Absicht:

``specs()`` bestimmt, was das Modell ueberhaupt angeboten bekommt -- das ist
die eigentliche Wirkung. ``invoke()`` prueft trotzdem noch einmal, weil ein
Modell einen Namen auch raten oder aus dem Verlauf wiederholen kann.
"""

from __future__ import annotations

from collections.abc import Sequence

from src.core.logging import get_logger
from src.services.tools.base import ToolBox, ToolCall, ToolResult, ToolSpec

logger = get_logger(__name__)


class FilteredToolBox(ToolBox):
    def __init__(self, inner: ToolBox, erlaubt: frozenset[str]) -> None:
        self._inner = inner
        self._erlaubt = erlaubt

    async def specs(self) -> Sequence[ToolSpec]:
        return tuple(
            spec for spec in await self._inner.specs() if spec.name in self._erlaubt
        )

    async def invoke(self, call: ToolCall) -> ToolResult:
        if call.name not in self._erlaubt:
            logger.warning("Werkzeug %r nicht installiert -- Aufruf abgewiesen", call.name)
            return ToolResult(
                call_id=call.id,
                name=call.name,
                content=(
                    f"The tool {call.name!r} is not installed. "
                    "Install its plugin first."
                ),
                is_error=True,
            )
        return await self._inner.invoke(call)

    async def aclose(self) -> None:
        """Bewusst leer.

        Die Huelle besitzt nichts. Der innere Speicher ist ein Singleton und
        wird vom Container geschlossen -- ihn hier zu schliessen wuerde ihn
        jeder anderen Anfrage unter den Fuessen wegziehen.
        """
