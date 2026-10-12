from __future__ import annotations

import asyncio
import re
import shlex
from pathlib import Path

from src.core.logging import get_logger
from src.services.tools.base import ToolError
from src.services.tools.local.base import LocalTool, truncate

logger = get_logger(__name__)

BLOCKED: tuple[tuple[re.Pattern[str], str], ...] = (
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
            "command": {"type": "string", "description": "The command to run"},
            "workdir": {
                "type": "string",
                "description": "Directory to run in (optional)",
            },
        },
        "required": ["command"],
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

    async def run(self, command: str, workdir: str | None = None) -> str:
        command = command.strip()
        if not command:
            raise ToolError("No command given.")

        if reason := _blocked(command):
            logger.warning("Shell command rejected (%s): %s", reason, command[:120])
            raise ToolError(f"Rejected: {reason}. This command will not be run.")

        cwd = Path(workdir) if workdir else self._workdir
        if cwd is not None and not cwd.is_dir():
            raise ToolError(f"Working directory {cwd} does not exist.")

        logger.info("Shell: %s (cwd=%s)", command[:160], cwd or "Prozessverzeichnis")

        process = await asyncio.create_subprocess_shell(
            command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(cwd) if cwd else None,
        )
        try:
            if self._timeout and self._timeout > 0:
                stdout, error = await asyncio.wait_for(
                    process.communicate(), timeout=self._timeout
                )
            else:
                stdout, error = await process.communicate()
        except TimeoutError:
            process.kill()
            await process.wait()
            raise ToolError(
                f"Aborted: ran longer than {self._timeout:.0f}s. "
                "Interactive programs do not work here."
            )
        except asyncio.CancelledError:
            process.kill()
            raise

        parts = [f"exit={process.returncode}"]
        if text := stdout.decode("utf-8", "replace").strip():
            parts.append(f"stdout:\n{truncate(text, self._max_output)}")
        if text := error.decode("utf-8", "replace").strip():
            parts.append(f"stderr:\n{truncate(text, self._max_output)}")
        if len(parts) == 1:
            parts.append("(no output)")
        return "\n\n".join(parts)


def _blocked(command: str) -> str | None:
    for pattern, reason in BLOCKED:
        if pattern.search(command):
            return reason
    try:
        shlex.split(command)
    except ValueError as exc:
        return f"command not parseable ({exc})"
    return None
