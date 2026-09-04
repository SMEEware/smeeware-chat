"""Shell-Befehle ausfuehren.

Das maechtigste Werkzeug hier: es laeuft mit den Rechten des Serverprozesses,
und was aufgerufen wird, entscheidet das Modell -- gesteuert von dem, was ein
Nutzer in den Chat schreibt. Deshalb Zeitlimit, gekappte Ausgabe, festes
Arbeitsverzeichnis und eine Sperrliste fuer Offensichtliches.

Die Sperrliste ist eine Stolperschwelle, kein Zaun: wer sie umgehen will,
schafft das. Wer das Werkzeug nach aussen freigibt, braucht eine echte
Sandbox (Container, eigener Benutzer) -- nicht diese Liste.
"""

from __future__ import annotations

import asyncio
import re
import shlex
from pathlib import Path

from src.core.logging import get_logger
from src.services.tools.base import ToolError
from src.services.tools.local.base import LocalTool, truncate

logger = get_logger(__name__)

GESPERRT: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"\brm\s+(-[a-zA-Z]*\s+)*-?[a-zA-Z]*[rf]", re.I), "recursive delete"),
    (re.compile(r"\bmkfs|\bfdisk|\bdiskutil\s+erase", re.I), "format a disk"),
    (re.compile(r"\bdd\s+.*\bof=/dev/", re.I), "write directly to a device"),
    (re.compile(r":\(\)\s*\{.*\};\s*:", re.S), "fork bomb"),
    (re.compile(r"\bshutdown\b|\breboot\b|\bhalt\b", re.I), "shut down the system"),
    (re.compile(r"\bchmod\s+-R\s+777\s+/", re.I), "open permissions system-wide"),
    (re.compile(r"\bsudo\b|\bsu\s", re.I), "privilege escalation"),
    (re.compile(r">\s*/dev/(sd|disk|nvme)", re.I), "redirect to a device"),
    (re.compile(r"\bcurl\b.*\|\s*(ba)?sh|\bwget\b.*\|\s*(ba)?sh", re.I),
     "run a downloaded script directly"),
)


class ShellTool(LocalTool):
    name = "run_shell"
    description = (
        "Runs a shell command on the machine and returns stdout, stderr, and "
        "the exit code. Use this for files, git, processes, system state. One "
        "command per call, no interactive programs (vim, top, ssh) -- those "
        "hang until the timeout."
    )
    parameters = {
        "type": "object",
        "properties": {
            "befehl": {"type": "string", "description": "The command to run"},
            "arbeitsverzeichnis": {
                "type": "string",
                "description": "Directory to run in (optional)",
            },
        },
        "required": ["befehl"],
    }

    def __init__(
        self,
        *,
        timeout: float = 30.0,
        workdir: Path | None = None,
        max_output: int = 8000,
    ) -> None:
        self._timeout = timeout
        self._workdir = workdir
        self._max_output = max_output

    async def run(self, befehl: str, arbeitsverzeichnis: str | None = None) -> str:
        befehl = befehl.strip()
        if not befehl:
            raise ToolError("No command given.")

        if grund := _gesperrt(befehl):
            logger.warning("Shell-Befehl abgelehnt (%s): %s", grund, befehl[:120])
            raise ToolError(f"Rejected: {grund}. This command will not be run.")

        cwd = Path(arbeitsverzeichnis) if arbeitsverzeichnis else self._workdir
        if cwd is not None and not cwd.is_dir():
            raise ToolError(f"Working directory {cwd} does not exist.")

        logger.info("Shell: %s (cwd=%s)", befehl[:160], cwd or "Prozessverzeichnis")

        prozess = await asyncio.create_subprocess_shell(
            befehl,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(cwd) if cwd else None,
        )
        try:
            if self._timeout and self._timeout > 0:
                aus, fehler = await asyncio.wait_for(
                    prozess.communicate(), timeout=self._timeout
                )
            else:
                aus, fehler = await prozess.communicate()
        except TimeoutError:
            prozess.kill()
            await prozess.wait()
            raise ToolError(
                f"Aborted: ran longer than {self._timeout:.0f}s. "
                "Interactive programs do not work here."
            )
        except asyncio.CancelledError:
            prozess.kill()
            raise

        teile = [f"exit={prozess.returncode}"]
        if text := aus.decode("utf-8", "replace").strip():
            teile.append(f"stdout:\n{truncate(text, self._max_output)}")
        if text := fehler.decode("utf-8", "replace").strip():
            teile.append(f"stderr:\n{truncate(text, self._max_output)}")
        if len(teile) == 1:
            teile.append("(no output)")
        return "\n\n".join(teile)


def _gesperrt(befehl: str) -> str | None:
    for muster, grund in GESPERRT:
        if muster.search(befehl):
            return grund
    try:
        shlex.split(befehl)
    except ValueError as exc:
        return f"command not parseable ({exc})"
    return None
