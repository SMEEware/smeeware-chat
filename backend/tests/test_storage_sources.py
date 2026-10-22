from __future__ import annotations

import tempfile
import unittest
from pathlib import Path, PureWindowsPath
from unittest.mock import patch

from src.services.tools.local import storage


class StorageSourceTests(unittest.TestCase):
    def test_windows_credentials_match_existing_patterns(self):
        for path in (r'C:\Users\x\.ssh\id_rsa', r'C:\Users\x\.aws\credentials',
                     r'C:\Users\x\.mc\config.json', r'C:\proj\.env',
                     r'C:\Users\x\.kube\config', r'C:\Users\x\.gnupg\private-keys-v1.d\secret'):
            with self.subTest(path=path):
                self.assertTrue(any(pattern.search(storage._portable(path))
                                    for pattern, _ in storage.BLOCKED_SOURCES))
        self.assertFalse(any(pattern.search(storage._portable(r'C:\work\report.pdf'))
                             for pattern, _ in storage.BLOCKED_SOURCES))

    def test_resolved_windows_source_is_checked_before_upload(self):
        with tempfile.TemporaryDirectory() as temporary:
            harmless = Path(temporary) / 'report.txt'
            harmless.write_text('test')
            tool = storage.StoragePutTool(storage.McClient())
            self.assertIsNone(tool._check_source(harmless))
            with patch.object(type(harmless), 'resolve', return_value=PureWindowsPath(r'C:\Users\Jörg\.ssh\config')):
                self.assertIn('an SSH directory', tool._check_source(harmless))

    def test_resolved_root_and_sensitive_symlink_guards_remain(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            allowed = root / 'allowed'
            allowed.mkdir()
            outside = root / 'outside.txt'
            outside.write_text('test')
            tool = storage.StoragePutTool(storage.McClient(), local_root=allowed)
            self.assertIn('outside it', tool._check_source(outside))
            credentials = allowed / '.aws' / 'credentials'
            credentials.parent.mkdir()
            credentials.write_text('secret')
            self.assertIn('credentials', tool._check_source(credentials))
            alias = allowed / 'report.txt'
            try:
                alias.symlink_to(credentials)
            except (OSError, NotImplementedError):
                self.skipTest('Symlink creation is unavailable on this machine.')
            self.assertIn('credentials', tool._check_source(alias))


class McProcessTests(unittest.IsolatedAsyncioTestCase):
    async def test_argv_timeout_and_decoding_are_preserved(self):
        from src.services.proc import SubprocessTimeout
        with patch.object(storage, 'run_exec', return_value=(7, 'Grüße'.encode(), b'problem')) as run:
            client = storage.McClient(binary='C:\\Program Files\\mc.exe', config_dir=Path('config dir'))
            result = await client.run('cp', 'a "quoted" value', timeout=2)
            self.assertEqual(result, (7, 'Grüße', 'problem'))
            run.assert_awaited_once_with(['C:\\Program Files\\mc.exe', '--no-color', '--config-dir',
                str(Path('config dir')), 'cp', 'a "quoted" value'], timeout=2)
        with patch.object(storage, 'run_exec', side_effect=SubprocessTimeout):
            with self.assertRaisesRegex(storage.McError, 'mc ran longer than 2s and was aborted'):
                await storage.McClient().run('ls', timeout=2)
