from __future__ import annotations

import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from src.services.system import probe


class WindowsSystemProbeTests(unittest.IsolatedAsyncioTestCase):
    async def test_missing_unix_load_api_still_returns_system_check_summary(self):
        monitor = probe.SystemProbe()
        with patch.object(probe.os, "getloadavg", side_effect=AttributeError, create=True):
            data = await monitor.measure()
            self.assertEqual(data.cpu["load"], [])
            self.assertIsNone(data.cpu["load_per_core"])
            self.assertIn("CPU", data.summary())
            self.assertIn("Backend", data.summary())

    async def test_unavailable_load_average_stays_empty_on_unix(self):
        monitor = probe.SystemProbe()
        with patch.object(probe.os, "getloadavg", side_effect=OSError, create=True):
            self.assertEqual((await monitor.measure()).cpu["load"], [])


class DiskRootTests(unittest.TestCase):
    def test_windows_reports_the_system_drive_instead_of_the_current_drive(self):
        usage = SimpleNamespace(total=100, free=50, percent=50)
        for system_drive, expected in (("D:", "D:\\"), (None, "C:\\")):
            with self.subTest(system_drive=system_drive), patch.object(probe.sys, "platform", "win32"), patch.dict(os.environ):
                os.environ.pop("SystemDrive", None)
                if system_drive:
                    os.environ["SystemDrive"] = system_drive
                with patch.object(probe.psutil, "disk_usage", return_value=usage) as measure:
                    self.assertEqual(probe._disk(), (expected, usage))
                    measure.assert_called_once_with(expected)

    def test_unix_roots_and_macos_fallback_remain_unchanged(self):
        usage = SimpleNamespace(total=100, free=50, percent=50)
        for system, expected in (("darwin", "/System/Volumes/Data"), ("linux", "/")):
            with self.subTest(system=system), patch.object(probe.sys, "platform", system), patch.object(probe.psutil, "disk_usage", return_value=usage) as measure:
                self.assertEqual(probe._disk(), (expected, usage))
                measure.assert_called_once_with(expected)
        with patch.object(probe.sys, "platform", "darwin"), patch.object(probe.psutil, "disk_usage", side_effect=[OSError, usage]) as measure:
            self.assertEqual(probe._disk(), ("/", usage))
            self.assertEqual([call.args[0] for call in measure.call_args_list], ["/System/Volumes/Data", "/"])
