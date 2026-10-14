from __future__ import annotations

import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from src.core.config import Settings
from src.services.tools.base import ToolCall
from src.services.tools.local import create_local_toolbox


class ShellRootTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        commands = self.root / "bin"
        commands.mkdir()
        # Replace only the external OS privilege commands. The toolbox, guard,
        # subprocess, working directory and resulting file writes are real.
        for name, script in {
            "sudo": '#!/bin/sh\n[ "$1" != "-n" ] || shift\nexec "$@"\n',
            "su": '#!/bin/sh\n[ "$1" != "-c" ] || shift\nexec /bin/sh -c "$1"\n',
        }.items():
            executable = commands / name
            executable.write_text(script)
            executable.chmod(0o700)
        self.environment = {
            "PATH": f"{commands}{os.pathsep}{os.environ.get('PATH', '')}",
            "DEEPSEEK_API_KEY": "test-not-a-real-key",
            "SHELL_ENABLED": "true",
            "SHELL_WORKDIR": str(self.root),
        }

    async def invoke(self, command, root_flag=None, shell_enabled=True):
        values = {**self.environment, "SHELL_ENABLED": str(shell_enabled).lower()}
        if root_flag is not None:
            values["ROOT"] = root_flag
        with patch.dict(os.environ, values, clear=True), patch("src.core.config.load_dotenv"):
            settings = Settings.from_env()
            toolbox = create_local_toolbox(settings.tools)
            try:
                return await toolbox.invoke(ToolCall("shell-test", "run_shell", {"command": command}))
            finally:
                await toolbox.aclose()

    async def test_sudo_and_su_are_blocked_by_default_and_when_root_is_false(self):
        for flag in (None, "false", "0", "off"):
            for command in ("sudo -n sh -c 'printf changed > result.txt'", "su -c 'printf changed > result.txt'", "su"):
                with self.subTest(flag=flag, command=command):
                    result = await self.invoke(command, flag)
                    self.assertTrue(result.is_error)
                    self.assertIn("privilege escalation", result.content)
                    self.assertFalse((self.root / "result.txt").exists())

    async def test_root_true_allows_sudo_and_su_through_real_shell_pipeline(self):
        for name, command in (
            ("sudo", "sudo -n sh -c 'printf sudo-allowed > sudo.txt'"),
            ("su", "su -c 'printf su-allowed > su.txt'"),
        ):
            with self.subTest(command=name):
                result = await self.invoke(command, "true")
                self.assertFalse(result.is_error, result.content)
                self.assertIn("exit=0", result.content)
                self.assertEqual((self.root / f"{name}.txt").read_text(), f"{name}-allowed")

    async def test_root_does_not_bypass_other_rejections_or_shell_disabled(self):
        for command, reason in (
            ("sudo rm -rf /tmp/rejected", "recursive delete"),
            ("sudo reboot", "shut down the system"),
            ("sudo mkfs /dev/rejected", "format a disk"),
            ("printf 'unterminated", "command not parseable"),
        ):
            with self.subTest(command=command):
                result = await self.invoke(command, "true")
                self.assertTrue(result.is_error)
                self.assertIn(reason, result.content)
        result = await self.invoke("sudo -n sh -c 'printf changed > disabled.txt'", "true", shell_enabled=False)
        self.assertTrue(result.is_error)
        self.assertFalse((self.root / "disabled.txt").exists())

    async def test_regular_commands_still_work_with_root_disabled(self):
        result = await self.invoke("printf regular-command", "false")
        self.assertFalse(result.is_error, result.content)
        self.assertIn("regular-command", result.content)


class LauncherRootTests(unittest.TestCase):
    def test_scripts_preserve_exported_root_flag(self):
        repository = Path(__file__).resolve().parents[2]
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / "root-value"
            for name in ("start.sh", "install.sh"):
                for flag in ("true", "false"):
                    with self.subTest(script=name, flag=flag):
                        result = subprocess.run(
                            ["bash", "-c", 'trap \'printf "%s" "$ROOT" > "$SMEEWARE_TEST_ROOT_FILE"\' EXIT\nsource "$SMEEWARE_TEST_SCRIPT" --help'],
                            env={"PATH": os.environ.get("PATH", ""), "ROOT": flag,
                                 "SMEEWARE_TEST_ROOT_FILE": str(output), "SMEEWARE_TEST_SCRIPT": str(repository / name)},
                            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True, timeout=5,
                        )
                        self.assertEqual(result.returncode, 0, result.stderr)
                        self.assertEqual(output.read_text(), flag)


if __name__ == "__main__":
    unittest.main()
