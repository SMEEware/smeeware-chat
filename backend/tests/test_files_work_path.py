from __future__ import annotations

import ntpath
import os
import tempfile
import unittest
from pathlib import Path, PureWindowsPath
from types import SimpleNamespace
from unittest.mock import patch

from src.services.tools.base import ToolError
from src.services.tools.local import files
from src.services.uploads.store import UploadStore


class FileWorkPathTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.store = UploadStore(self.root / "uploads")
        self.context = files.FileContext(self.store, "chat-one", set())
        token = files.set_file_context(self.context)
        self.addCleanup(files.reset_file_context, token)

    def attach(self, content: bytes = b"attached original"):
        source = self.root / "source.txt"
        source.write_bytes(content)
        uploaded = self.store.register(source, filename="source.txt", chat_id="chat-one")
        self.context.file_ids.add(uploaded.id)
        return uploaded

    def test_windows_separators_resolve_to_scoped_subdirectories(self) -> None:
        self.assertEqual(
            files._work_path(self.context, r"sub\file.txt"),
            self.context.work_dir / "sub" / "file.txt",
        )

    def test_native_path_objects_remain_scoped_without_string_round_trips(self) -> None:
        self.assertEqual(files._work_path(self.context, self.context.work_dir), self.context.work_dir)
        self.assertEqual(
            files._work_path(self.context, self.context.work_dir / "sub" / "file.txt"),
            self.context.work_dir / "sub" / "file.txt",
        )

    def test_windows_spelled_write_is_readable_and_listed(self) -> None:
        files._write_file(r"sub\file.txt", "working content")
        self.assertEqual((self.context.work_dir / "sub" / "file.txt").read_bytes(), b"working content")
        self.assertIn("working content", files._read_file(r"sub\file.txt", 0, 100))
        listing = files._list_files()
        self.assertIn(str(Path("sub") / "file.txt"), listing)
        self.assertIn("15 bytes", listing)

    @unittest.skipIf(os.name == "nt", "A literal backslash is a path separator on Windows.")
    def test_internal_posix_backslash_filename_is_not_reinterpreted(self) -> None:
        self.context.work_dir.mkdir(parents=True)
        path = self.context.work_dir / r"literal\name.txt"
        path.write_bytes(b"literal file")
        self.assertEqual(files._work_path(self.context, path), path)
        self.assertEqual(files._regular_files(self.context, self.context.work_dir), [path])
        self.assertIn(r"literal\name.txt", files._list_files())

    def test_rejects_traversal_absolute_escapes_and_other_conversations(self) -> None:
        for raw in (
            "../../etc/passwd", r"..\..\etc\passwd", r"sub\..\escape.txt",
            "sub/../escape.txt", self.root / "outside.txt", str(self.root / "outside.txt"),
            self.context.work_dir / ".." / "chat-two" / "secret.txt",
            self.store.work_root / "chat-two" / "secret.txt",
        ):
            with self.subTest(raw=str(raw)), self.assertRaises(ToolError):
                files._work_path(self.context, raw)

    def test_rejects_windows_drive_relative_root_relative_unc_and_device_escapes(self) -> None:
        paths = (
            r"C:\Windows\System32\cmd.exe", "C:relative.txt", "Z:relative.txt",
            r"\Windows\System32\cmd.exe", r"\\server\share\secret.txt",
            "//server/share/secret.txt", r"\\?\C:\Windows\secret.txt", r"\\.\NUL",
        )
        for raw in paths:
            for value in (raw, Path(raw)):
                with self.subTest(raw=str(value), kind=type(value).__name__), self.assertRaises(ToolError):
                    files._work_path(self.context, value)

    def test_root_relative_windows_spelling_cannot_alias_the_workspace(self) -> None:
        relative_to_drive = PureWindowsPath(str(self.context.work_dir)).parts[1:]
        raw = "\\" + "\\".join(relative_to_drive) + "\\file.txt"
        self.assertTrue(PureWindowsPath(raw).root)
        self.assertFalse(PureWindowsPath(raw).drive)
        with self.assertRaises(ToolError):
            files._work_path(self.context, raw)

    @unittest.skipIf(os.name == "nt", "The UNC path is a distinct native anchor on Windows.")
    def test_unc_spelling_cannot_alias_a_posix_workspace(self) -> None:
        raw = "//" + self.context.work_dir.as_posix().lstrip("/") + "/file.txt"
        self.assertTrue(PureWindowsPath(raw).drive)
        with self.assertRaises(ToolError):
            files._work_path(self.context, raw)

    def test_rejects_empty_nonpath_and_control_character_inputs(self) -> None:
        for raw in ("", " ", None, 1):
            with self.subTest(raw=repr(raw)), self.assertRaises(ToolError):
                files._work_path(self.context, raw)
        for code in range(32):
            raw = "a" + chr(code) + "b"
            for value in (raw, Path(raw), self.context.work_dir / raw):
                with self.subTest(code=code, kind=type(value).__name__), self.assertRaises(ToolError):
                    files._work_path(self.context, value)

    def test_path_objects_do_not_bypass_symlink_checks(self) -> None:
        self.context.work_dir.mkdir(parents=True)
        outside = self.root / "outside"
        outside.mkdir()
        target = outside / "secret.txt"
        target.write_bytes(b"outside secret")
        link = self.context.work_dir / "link"
        try:
            link.symlink_to(outside, target_is_directory=True)
        except (OSError, NotImplementedError) as exc:
            self.skipTest(f"Symbolic links are unavailable: {exc}")
        for value in (link, link / "secret.txt", str(link / "secret.txt")):
            with self.subTest(raw=str(value)), self.assertRaises(ToolError):
                files._work_path(self.context, value)
        self.assertEqual(target.read_bytes(), b"outside secret")

    def test_native_absolute_attached_path_stays_read_only_and_conversation_scoped(self) -> None:
        uploaded = self.attach()
        self.assertEqual(files._read_path(self.context, str(uploaded.path)), (uploaded.path, "source.txt"))
        with self.assertRaises(ToolError):
            files._work_path(self.context, uploaded.path)
        other_context = files.FileContext(self.store, "chat-two", set())
        with self.assertRaises(ToolError):
            files._read_path(other_context, str(uploaded.path))

    def test_normalized_upload_comparison_still_rejects_parent_traversal(self) -> None:
        uploaded = self.attach()
        for raw in (
            str(uploaded.path.parent / "unused" / ".." / uploaded.path.name),
            uploaded.path.parent.as_posix() + "/unused\\..\\" + uploaded.path.name,
        ):
            with self.subTest(raw=raw), self.assertRaises(ToolError):
                files._read_path(self.context, raw)

    def test_attached_absolute_comparison_accepts_windows_case_and_separator_semantics(self) -> None:
        uploaded = self.attach()
        # Keep real stored files and attachment checks; only the unavailable host
        # path comparison is replaced with the standard library's Windows rules.
        raw = uploaded.path.as_posix().swapcase()
        if os.name != "nt":
            raw = "/" + raw[1:].replace("/", "\\")
        self.assertNotEqual(str(uploaded.path), raw)
        with patch.object(files, "os", SimpleNamespace(path=ntpath)):
            self.assertEqual(files._read_path(self.context, raw), (uploaded.path, "source.txt"))
            other_context = files.FileContext(self.store, "chat-two", set())
            with self.assertRaises(ToolError):
                files._read_path(other_context, raw)


if __name__ == "__main__":
    unittest.main()
