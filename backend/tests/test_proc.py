from __future__ import annotations

import asyncio
import importlib
import json
import os
import shlex
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, Mock, patch


def shell_command(argv):
    return subprocess.list2cmdline(argv) if os.name == 'nt' else shlex.join(argv)


class ProcessTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.proc = importlib.import_module('src.services.proc')

    async def test_exec_preserves_argv_output_and_exit_code_in_both_paths(self):
        args = ['two words', 'a "quoted" value', 'C:\\Users\\Jörg\\report.pdf', 'Grüße 日本語']
        code = ('import json,sys; sys.stdout.buffer.write(json.dumps(sys.argv[1:], '
                'ensure_ascii=False).encode("utf-8")); sys.stderr.buffer.write(b"problem"); sys.exit(7)')
        for fallback in (False, True):
            with self.subTest(fallback=fallback):
                original = asyncio.create_subprocess_exec
                create = AsyncMock(side_effect=NotImplementedError) if fallback else original
                with patch('src.services.proc.asyncio.create_subprocess_exec', create):
                    result, stdout, stderr = await self.proc.run_exec([sys.executable, '-c', code, *args])
                self.assertEqual(result, 7)
                self.assertEqual(json.loads(stdout.decode('utf-8')), args)
                self.assertEqual(stderr, b'problem')

    async def test_shell_uses_unicode_workdir_in_both_paths(self):
        with tempfile.TemporaryDirectory() as temporary:
            cwd = Path(temporary) / 'Arbeitsordner Grüße 日本語'
            cwd.mkdir()
            command = shell_command([sys.executable, '-c',
                'import os,sys; sys.stdout.buffer.write(os.getcwd().encode("utf-8"))'])
            for fallback in (False, True):
                with self.subTest(fallback=fallback):
                    original = asyncio.create_subprocess_shell
                    create = AsyncMock(side_effect=NotImplementedError) if fallback else original
                    with patch('src.services.proc.asyncio.create_subprocess_shell', create):
                        result, stdout, stderr = await self.proc.run_shell(command, cwd=cwd, timeout=3)
                    self.assertEqual(result, 0)
                    self.assertEqual(Path(stdout.decode('utf-8')).resolve(), cwd.resolve())
                    self.assertEqual(stderr, b'')

    async def test_timeout_and_cancellation_reap_the_child_in_both_paths(self):
        for fallback in (False, True):
            for cancelled in (False, True):
                with self.subTest(fallback=fallback, cancelled=cancelled):
                    children = []
                    real_popen = subprocess.Popen
                    real_create = asyncio.create_subprocess_exec
                    def popen(*args, **kwargs):
                        child = real_popen(*args, **kwargs)
                        children.append(child)
                        return child
                    async def create(*args, **kwargs):
                        if fallback:
                            raise NotImplementedError
                        child = await real_create(*args, **kwargs)
                        children.append(child)
                        return child
                    with tempfile.TemporaryDirectory() as temporary:
                        ready = Path(temporary) / 'ready.txt'
                        script = 'from pathlib import Path; import sys,time; Path(sys.argv[1]).write_text("ready"); time.sleep(30)'
                        with patch('src.services.proc.asyncio.create_subprocess_exec', side_effect=create), \
                             patch('src.services.proc.subprocess.Popen', side_effect=popen):
                            task = asyncio.create_task(self.proc.run_exec(
                                [sys.executable, '-c', script, str(ready)], timeout=None if cancelled else .5))
                            try:
                                if cancelled:
                                    async with asyncio.timeout(3):
                                        while not ready.exists():
                                            await asyncio.sleep(.01)
                                    task.cancel()
                                    with self.assertRaises(asyncio.CancelledError):
                                        await asyncio.wait_for(task, 3)
                                else:
                                    with self.assertRaises(self.proc.SubprocessTimeout):
                                        await asyncio.wait_for(task, 3)
                                self.assertTrue(children)
                                self.assertTrue(all(child.returncode is not None for child in children))
                            finally:
                                for child in children:
                                    if child.returncode is None:
                                        child.kill()
                                if not task.done():
                                    task.cancel()
                                    await asyncio.gather(task, return_exceptions=True)

    async def test_fallback_cancellation_during_spawn_waits_for_cleanup(self):
        entered, release = threading.Event(), threading.Event()
        children = []
        real_popen = subprocess.Popen
        def popen(*args, **kwargs):
            entered.set()
            release.wait(3)
            child = real_popen(*args, **kwargs)
            children.append(child)
            return child
        with patch('src.services.proc.asyncio.create_subprocess_exec', side_effect=NotImplementedError), \
             patch('src.services.proc.subprocess.Popen', side_effect=popen):
            task = asyncio.create_task(self.proc.run_exec([sys.executable, '-c', 'import time; time.sleep(30)']))
            try:
                self.assertTrue(await asyncio.to_thread(entered.wait, 3))
                task.cancel()
                await asyncio.sleep(.02)
                self.assertFalse(task.done())
                task.cancel()
                await asyncio.sleep(.02)
                self.assertFalse(task.done())
                release.set()
                with self.assertRaises(asyncio.CancelledError):
                    await asyncio.wait_for(task, 3)
                self.assertTrue(children)
                self.assertTrue(all(child.returncode is not None for child in children))
            finally:
                release.set()
                for child in children:
                    if child.returncode is None:
                        child.kill()
                if not task.done():
                    task.cancel()
                    await asyncio.gather(task, return_exceptions=True)

    async def test_fallback_drains_both_pipes_across_polling_and_zero_timeout(self):
        script = ('import sys,time; sys.stdout.buffer.write(b"x"*100000); sys.stdout.flush(); '
                  'sys.stderr.buffer.write(b"y"*100000); sys.stderr.flush(); time.sleep(.15)')
        with patch('src.services.proc.asyncio.create_subprocess_exec', side_effect=NotImplementedError):
            code, stdout, stderr = await self.proc.run_exec([sys.executable, '-c', script], timeout=0)
        self.assertEqual(code, 0)
        self.assertEqual(stdout, b'x' * 100000)
        self.assertEqual(stderr, b'y' * 100000)

    async def test_fallback_shell_timeout_and_cancel_stop_descendants_before_returning(self):
        for cancelled in (False, True):
            with self.subTest(cancelled=cancelled), tempfile.TemporaryDirectory() as temporary:
                marker = Path(temporary) / 'must-not-be-written.txt'
                ready = Path(temporary) / 'ready.txt'
                script = ('from pathlib import Path; import sys,time; '
                          'Path(sys.argv[1]).write_text("ready"); time.sleep(1.2); '
                          'Path(sys.argv[2]).write_text("escaped cleanup")')
                command = shell_command([sys.executable, '-c', script, str(ready), str(marker)])
                # Keep the shell alive while Python holds both output handles.
                command += ' & rem keep-shell' if os.name == 'nt' else '; :'
                with patch('src.services.proc.asyncio.create_subprocess_shell', side_effect=NotImplementedError):
                    started = time.monotonic()
                    task = asyncio.create_task(self.proc.run_shell(command, timeout=None if cancelled else .2))
                    if cancelled:
                        async with asyncio.timeout(3):
                            while not ready.exists():
                                await asyncio.sleep(.01)
                        started = time.monotonic()
                        task.cancel()
                        with self.assertRaises(asyncio.CancelledError):
                            await asyncio.wait_for(task, 3)
                    else:
                        with self.assertRaises(self.proc.SubprocessTimeout):
                            await asyncio.wait_for(task, 3)
                    with self.subTest(check='deadline'):
                        self.assertLess(time.monotonic() - started, 1.0)
                await asyncio.sleep(1.3)
                self.assertFalse(marker.exists(), 'A shell descendant kept executing after cleanup.')

    async def test_fallback_preserves_timeout_when_reaped_parent_has_inherited_pipes(self):
        # Model an already reaped shell whose detached child still owns the
        # output handles. OS tree termination can no longer find that parent.
        child = Mock(pid=999999999, returncode=0)
        child.poll.return_value = 0
        child.wait.return_value = 0
        def communicate(*, timeout):
            if timeout < 1:
                time.sleep(timeout)
            raise subprocess.TimeoutExpired('already-reaped-shell', timeout)
        child.communicate.side_effect = communicate
        with patch('src.services.proc.asyncio.create_subprocess_shell', side_effect=NotImplementedError), \
             patch('src.services.proc.subprocess.Popen', return_value=child), \
             patch('src.services.proc.subprocess.run'), \
             patch('src.services.proc.os.killpg', side_effect=ProcessLookupError, create=True):
            with self.assertRaises(self.proc.SubprocessTimeout):
                await self.proc.run_shell('unused', timeout=.01)

    async def test_missing_executable_propagates_in_both_paths(self):
        for fallback in (False, True):
            original = asyncio.create_subprocess_exec
            create = AsyncMock(side_effect=NotImplementedError) if fallback else original
            with patch('src.services.proc.asyncio.create_subprocess_exec', create):
                with self.assertRaises(FileNotFoundError):
                    await self.proc.run_exec(['smeeware-test-nonexistent-executable'])
