from __future__ import annotations

import os
import unittest
from unittest.mock import patch

from src.services.tools.base import ToolError
from src.services.tools.local import shell


class ShellBlockedTests(unittest.IsolatedAsyncioTestCase):
    def test_windows_paths_do_not_use_posix_parsing(self):
        with patch.object(os, 'name', 'nt'):
            self.assertIsNone(shell._blocked('cd C:\\'))
            self.assertIsNone(shell._blocked('cd "C:\\Users\\Jörg\\My Documents"'))
            self.assertEqual(shell._blocked('rm -rf /'), 'recursive delete')
            self.assertEqual(shell._blocked('sudo ls'), 'privilege escalation')

    async def test_shell_falls_back_when_loop_cannot_spawn(self):
        with patch('asyncio.create_subprocess_shell', side_effect=NotImplementedError):
            result = await shell.ShellTool().run('echo portable')
        self.assertEqual(result, 'exit=0\n\nstdout:\nportable')

    async def test_timeout_keeps_existing_error(self):
        from src.services.proc import SubprocessTimeout
        with patch.object(shell, 'run_shell', side_effect=SubprocessTimeout):
            with self.assertRaisesRegex(ToolError, 'Aborted: ran longer than 2s'):
                await shell.ShellTool(timeout=2).run('echo portable')
