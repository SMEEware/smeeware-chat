from __future__ import annotations

import json
import os
import shlex
import shutil
import subprocess
import sys
import tempfile
import unittest
import venv
from pathlib import Path


REPOSITORY = Path(__file__).resolve().parents[2]
POWERSHELL = shutil.which("powershell") or shutil.which("pwsh")


class LauncherBehavior:
    """Exercise the real launcher with inexpensive backend/frontend processes."""

    script: str

    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="smeeware launcher ")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        self.addCleanup(self.stop_backend)
        self.backend = self.root / "backend"
        self.frontend = self.root / "frontend"
        self.commands = self.root / "commands"
        for folder in (self.backend, self.frontend, self.commands):
            folder.mkdir()
        shutil.copyfile(REPOSITORY / self.script, self.root / self.script)
        (self.backend / ".env").write_text("DEEPSEEK_API_KEY=launcher-test\n")
        (self.backend / "run.py").write_text(
            "import json, os, sys, time\n"
            "from pathlib import Path\n"
            "record = {key: os.getenv(key) for key in "
            "('ENVIRONMENT', 'ROOT', 'SHELL_ENABLED')}\n"
            "record.update(pid=os.getpid(), cwd=os.getcwd())\n"
            "Path(os.environ['LAUNCHER_TEST_TRACE'], 'backend.json').write_text(json.dumps(record))\n"
            "if os.getenv('LAUNCHER_TEST_BACKEND_FAIL'): sys.exit(7)\n"
            "time.sleep(60)\n"
        )
        npx = self.commands / "npx.py"
        npx.write_text(
            "import json, os, sys\n"
            "from pathlib import Path\n"
            "record = {'args': sys.argv[1:], 'cwd': os.getcwd(), "
            "'environment': os.getenv('ENVIRONMENT')}\n"
            "with Path(os.environ['LAUNCHER_TEST_TRACE'], 'frontend.jsonl').open('a') as out:\n"
            "    out.write(json.dumps(record) + '\\n')\n"
            "sys.exit(9 if sys.argv[-1] == os.getenv('LAUNCHER_TEST_FRONTEND_FAIL') else 0)\n"
        )
        if self.script.endswith(".ps1"):
            venv.EnvBuilder(with_pip=False).create(self.backend / ".venv")
            (self.commands / "npx.cmd").write_text(
                f'@"{sys.executable}" "{npx}" %*\r\n@exit /b %errorlevel%\r\n'
            )
        else:
            activate = self.backend / ".venv" / "bin" / "activate"
            activate.parent.mkdir(parents=True)
            activate.write_text(":\n")
            for name, command in {
                "python": f"exec {shlex.quote(sys.executable)} \"$@\"",
                "npx": f"exec {shlex.quote(sys.executable)} {shlex.quote(str(npx))} \"$@\"",
            }.items():
                executable = self.commands / name
                executable.write_text(f"#!/bin/sh\n{command}\n")
                executable.chmod(0o700)

    def launch(self, *args, **overrides):
        return self.run_script(self.script, *args, **overrides)

    def run_script(self, script_name, *args, **overrides):
        for name in ("backend.json", "frontend.jsonl"):
            (self.root / name).unlink(missing_ok=True)
        environment = dict(os.environ)
        for name in ("ENVIRONMENT", "SMEEWARE_ENVIRONMENT", "SMEEWARE_ROOT",
                     "LAUNCHER_TEST_BACKEND_FAIL", "LAUNCHER_TEST_FRONTEND_FAIL"):
            environment.pop(name, None)
        environment.update({
            "PATH": f"{self.commands}{os.pathsep}{environment.get('PATH', '')}",
            "BACKEND_DIR": str(self.backend), "FRONTEND_DIR": str(self.frontend),
            "SKIP_DEPS": "1", "DEEPSEEK_API_KEY": "launcher-test",
            "LAUNCHER_TEST_TRACE": str(self.root), "ROOT": "false", "SHELL_ENABLED": "false",
        })
        environment.update(overrides)
        script = str(self.root / script_name)
        if script_name.endswith(".ps1"):
            command = [POWERSHELL, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, *args]
        else:
            command = [shutil.which("bash"), script, *args]
        result = subprocess.run(command, cwd=self.root, env=environment,
                                capture_output=True, text=True, timeout=20)
        return result

    def stop_backend(self):
        record = self.root / "backend.json"
        if not record.exists():
            return
        pid = json.loads(record.read_text())["pid"]
        if os.name == "nt":
            subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], capture_output=True)
        else:
            try:
                os.kill(pid, 15)
            except ProcessLookupError:
                pass

    def backend_record(self):
        return json.loads((self.root / "backend.json").read_text())

    def frontend_records(self):
        path = self.root / "frontend.jsonl"
        return [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []

    def assert_success(self, result):
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_build_overrides_inherited_development_and_reports_effective_environment(self):
        result = self.launch("-build", ENVIRONMENT="development")
        self.assert_success(result)
        self.assertEqual(self.backend_record()["ENVIRONMENT"], "production")
        self.assertIn("Environment: production", result.stdout)
        self.assertEqual([record["args"] for record in self.frontend_records()],
                         [["next", "build"], ["next", "start"]])
        self.assertTrue(all(record["environment"] == "production" for record in self.frontend_records()))

    def test_default_dev_overrides_inherited_production(self):
        result = self.launch(ENVIRONMENT="production")
        self.assert_success(result)
        self.assertEqual(self.backend_record()["ENVIRONMENT"], "development")
        self.assertIn("Environment: development", result.stdout)
        self.assertEqual([record["args"] for record in self.frontend_records()], [["next", "dev"]])

    def test_explicit_environment_override_wins_over_mode(self):
        for mode, explicit in (("-build", "staging"), ("-dev", "production")):
            with self.subTest(mode=mode, explicit=explicit):
                result = self.launch(mode, ENVIRONMENT="development", SMEEWARE_ENVIRONMENT=explicit)
                self.assert_success(result)
                self.assertEqual(self.backend_record()["ENVIRONMENT"], explicit)
                self.assertIn(f"Environment: {explicit}", result.stdout)

    def test_empty_override_uses_mode_and_preserves_shell_and_root_flags(self):
        result = self.launch("-build", "-shell", SMEEWARE_ENVIRONMENT="", ROOT="true")
        self.assert_success(result)
        record = self.backend_record()
        self.assertEqual((record["ENVIRONMENT"], record["SHELL_ENABLED"], record["ROOT"]),
                         ("production", "true", "true"))
        self.assertEqual(Path(record["cwd"]), self.backend)
        self.assertTrue(all(Path(entry["cwd"]) == self.frontend for entry in self.frontend_records()))
        if os.name == "nt":
            alive = subprocess.run([POWERSHELL, "-NoProfile", "-Command",
                                    f"if (Get-Process -Id {record['pid']} -ErrorAction SilentlyContinue) {{ exit 1 }}"],
                                   capture_output=True, timeout=5)
            self.assertEqual(alive.returncode, 0, "Launcher left the backend running")
        else:
            with self.assertRaises(ProcessLookupError):
                os.kill(record["pid"], 0)

    def test_backend_startup_failure_prevents_frontend_start(self):
        result = self.launch(LAUNCHER_TEST_BACKEND_FAIL="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("backend crashed on startup", result.stdout + result.stderr)
        self.assertEqual(self.frontend_records(), [])

    def test_frontend_build_failure_prevents_start_and_returns_failure(self):
        result = self.launch("-build", LAUNCHER_TEST_FRONTEND_FAIL="build")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual([record["args"] for record in self.frontend_records()], [["next", "build"]])

    def test_frontend_server_startup_failures_return_failure(self):
        for mode, phase in (("-dev", "dev"), ("-build", "start")):
            with self.subTest(mode=mode):
                result = self.launch(mode, LAUNCHER_TEST_FRONTEND_FAIL=phase)
                self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_installer_rejects_python_310_and_keeps_python_312_uv_fallback(self):
        installer = "install.ps1" if self.script.endswith(".ps1") else "install.sh"
        shutil.copyfile(REPOSITORY / installer, self.root / installer)
        shutil.rmtree(self.backend / ".venv")
        command = self.commands / "installer-command.py"
        command.write_text(
            "import json, os, sys\n"
            "from pathlib import Path\n"
            "kind, args = sys.argv[1], sys.argv[2:]\n"
            "if kind == 'python' and args[0] == '-c':\n"
            "    sys.version_info = (3, int(os.environ['LAUNCHER_TEST_PYTHON_MINOR']), 0, 'final', 0)\n"
            "    exec(args[1])\n"
            "    sys.exit(0)\n"
            "if kind == 'node':\n"
            "    print('20')\n"
            "    sys.exit(0)\n"
            "with Path(os.environ['LAUNCHER_TEST_TRACE'], 'installer.jsonl').open('a') as out:\n"
            "    out.write(json.dumps({'kind': kind, 'args': args}) + '\\n')\n"
            "sys.exit(17)\n"
        )
        for name in ("fake-python", "uv", "node", "npm"):
            kind = "python" if name == "fake-python" else name
            executable = self.commands / (f"{name}.cmd" if os.name == "nt" else name)
            if os.name == "nt":
                executable.write_text(f'@"{sys.executable}" "{command}" {kind} %*\r\n@exit /b %errorlevel%\r\n')
            else:
                executable.write_text(f"#!/bin/sh\nexec {shlex.quote(sys.executable)} {shlex.quote(str(command))} {kind} \"$@\"\n")
                executable.chmod(0o700)
        python = self.commands / ("fake-python.cmd" if os.name == "nt" else "fake-python")
        trace = self.root / "installer.jsonl"
        for minor, expected_kind in (("10", "uv"), ("11", "python")):
            with self.subTest(python=f"3.{minor}"):
                trace.unlink(missing_ok=True)
                result = self.run_script(installer, "--deps", PYTHON_BIN=str(python),
                                         LAUNCHER_TEST_PYTHON_MINOR=minor)
                self.assertNotEqual(result.returncode, 0)
                self.assertTrue(trace.exists(), result.stdout + result.stderr)
                records = [json.loads(line) for line in trace.read_text().splitlines()]
                self.assertEqual([record["kind"] for record in records], [expected_kind])
                if expected_kind == "uv":
                    self.assertEqual(records[0]["args"],
                                     ["venv", "--quiet", "--python", "3.12", str(self.backend / ".venv")])
                else:
                    self.assertEqual(records[0]["args"], ["-m", "venv", str(self.backend / ".venv")])


@unittest.skipUnless(os.name != "nt" and shutil.which("bash"), "Requires a POSIX Bash launcher")
class BashLauncherTests(LauncherBehavior, unittest.TestCase):
    script = "start.sh"


@unittest.skipUnless(os.name == "nt" and POWERSHELL, "Requires native Windows PowerShell")
class PowerShellLauncherTests(LauncherBehavior, unittest.TestCase):
    script = "start.ps1"


if __name__ == "__main__":
    unittest.main()
