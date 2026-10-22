"""Child processes on loops with and without asyncio subprocess support.

Windows SelectorEventLoop (used by uvicorn reload/workers) cannot spawn an
asyncio subprocess. Only that failure uses a worker owning a plain Popen;
timeout and cancellation still stop and reap its child before returning.
"""

from __future__ import annotations

import asyncio
import os
import signal
import subprocess
import threading
import time
from pathlib import Path
from typing import Any


class SubprocessTimeout(TimeoutError):
    """Raised when a child process outlives its timeout."""


async def _cleanup(task: asyncio.Task[Any]) -> None:
    # Shield cleanup even when a caller cancels more than once. A to_thread
    # cancellation alone would leave the worker and its child running.
    while not task.done():
        try:
            await asyncio.shield(task)
        except asyncio.CancelledError:
            continue
        except Exception:
            break
    try:
        task.result()
    except (Exception, asyncio.CancelledError):
        pass


async def _kill(process: asyncio.subprocess.Process) -> None:
    if process.returncode is None:
        try:
            process.kill()
        except ProcessLookupError:
            pass
    await process.wait()


async def _communicate(
    process: asyncio.subprocess.Process, timeout: float | None,
) -> tuple[int, bytes, bytes]:
    try:
        if timeout is not None and timeout > 0:
            stdout, stderr = await asyncio.wait_for(process.communicate(), timeout)
        else:
            stdout, stderr = await process.communicate()
    except TimeoutError:
        await _cleanup(asyncio.create_task(_kill(process)))
        raise SubprocessTimeout from None
    except asyncio.CancelledError:
        await _cleanup(asyncio.create_task(_kill(process)))
        raise
    return process.returncode or 0, stdout, stderr


def _kill_tree(process: subprocess.Popen[bytes]) -> None:
    if os.name == "nt":
        taskkill = os.path.join(os.environ.get("SystemRoot", r"C:\Windows"), "System32", "taskkill.exe")
        try:
            subprocess.run(
                [taskkill, "/PID", str(process.pid), "/T", "/F"],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=2,
            )
        except (OSError, subprocess.TimeoutExpired):
            pass
    else:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
    if process.poll() is None:
        process.kill()
    try:
        # Descendants must stop too: otherwise their inherited pipe handles
        # could keep communicate blocked after the shell itself was killed.
        process.communicate(timeout=1)
    except subprocess.TimeoutExpired:
        # A detached descendant can retain a pipe after its parent has exited
        # and OS tree lookup can no longer find it. Reap the direct child, but
        # do not wait indefinitely or replace the operation's timeout/cancel.
        process.wait(timeout=1)


def _run_blocking(
    args: str | list[str], *, shell: bool, cwd: str | None,
    timeout: float | None, cancelled: threading.Event,
) -> tuple[int, bytes, bytes]:
    if cancelled.is_set():
        return 0, b"", b""
    process = subprocess.Popen(
        args, shell=shell, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        start_new_session=os.name != "nt",
    )
    deadline = time.monotonic() + timeout if timeout is not None and timeout > 0 else None
    completed = False
    try:
        while True:
            if cancelled.is_set():
                break
            remaining = deadline - time.monotonic() if deadline is not None else None
            if remaining is not None and remaining <= 0:
                raise SubprocessTimeout
            try:
                stdout, stderr = process.communicate(
                    timeout=min(.05, remaining) if remaining is not None else .05,
                )
                completed = True
                return process.returncode or 0, stdout, stderr
            except subprocess.TimeoutExpired:
                continue
    finally:
        if not completed:
            _kill_tree(process)
    return process.returncode or 0, b"", b""


async def _fallback(
    args: str | list[str], *, shell: bool, cwd: str | None, timeout: float | None,
) -> tuple[int, bytes, bytes]:
    cancelled = threading.Event()
    worker = asyncio.create_task(asyncio.to_thread(
        _run_blocking, args, shell=shell, cwd=cwd, timeout=timeout, cancelled=cancelled,
    ))
    try:
        return await asyncio.shield(worker)
    except asyncio.CancelledError:
        cancelled.set()
        await _cleanup(worker)
        raise


async def run_shell(
    command: str, *, cwd: Path | None = None, timeout: float | None = None,
) -> tuple[int, bytes, bytes]:
    """Run a shell command and return (exit code, stdout bytes, stderr bytes)."""
    directory = str(cwd) if cwd is not None else None
    try:
        process = await asyncio.create_subprocess_shell(
            command, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            cwd=directory,
        )
    except NotImplementedError:
        return await _fallback(command, shell=True, cwd=directory, timeout=timeout)
    return await _communicate(process, timeout)


async def run_exec(
    argv: list[str], *, timeout: float | None = None,
) -> tuple[int, bytes, bytes]:
    """Run an argument vector without a shell; preserve every argument."""
    try:
        process = await asyncio.create_subprocess_exec(
            *argv, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
    except NotImplementedError:
        return await _fallback(argv, shell=False, cwd=None, timeout=timeout)
    return await _communicate(process, timeout)
