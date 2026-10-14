from __future__ import annotations

import importlib
import io
import re
import stat
import tempfile
import unittest
import zipfile
from pathlib import Path

from pypdf import PdfWriter
from pypdf.generic import DictionaryObject, NameObject, DecodedStreamObject

from src.services.tools.base import ToolError

try:
    files = importlib.import_module("src.services.tools.local.files")
except ModuleNotFoundError:
    files = None


class FileToolTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.assertIsNotNone(files, "Scoped file tools have not been implemented")
        from src.services.uploads.store import UploadStore

        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.store = UploadStore(self.root / "uploads", 20_000_000, 8)
        self.ctx = files.FileContext(self.store, "chat-one", set())
        self.token = files.set_file_context(self.ctx)
        self.addCleanup(files.reset_file_context, self.token)
        self.tools = {tool.name: tool for tool in files.create_file_tools()}

    def tool(self, name: str):
        self.assertIn(name, self.tools, f"Missing scoped tool: {name}")
        return self.tools[name]

    def attach(self, data: bytes, name: str):
        source = self.root / name
        source.write_bytes(data)
        uploaded = self.store.register(source, filename=name, chat_id="chat-one")
        self.ctx.file_ids.add(uploaded.id)
        return uploaded

    def archive(self, entries: dict[str, bytes], name: str = "project.zip"):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
            for name_in_zip, data in entries.items():
                archive.writestr(name_in_zip, data)
        return self.attach(buffer.getvalue(), name)

    async def test_reads_only_attached_original_and_scoped_work_files(self):
        upload = self.attach(b"owned content", "source.txt")
        self.assertIn("owned content", await self.tools["read_file"].run(path=upload.id))
        secret = self.root / "outside.txt"
        secret.write_text("outside secret")
        with self.assertRaises(ToolError):
            await self.tools["read_file"].run(path=str(secret))
        other = self.store.register(secret, chat_id="chat-two")
        with self.assertRaises(ToolError):
            await self.tools["read_file"].run(path=str(other.path))
        listing = await self.tools["list_files"].run()
        self.assertIn("source.txt", listing)
        self.assertNotIn("outside secret", listing)

    async def test_original_is_immutable_and_text_reads_are_paged(self):
        upload = self.attach(b"abcdefghijklmnop", "source.txt")
        with self.assertRaises(ToolError):
            await self.tools["write_file"].run(path=str(upload.path), content="changed")
        await self.tools["write_file"].run(path="copy.txt", content="changed")
        self.assertEqual(upload.path.read_bytes(), b"abcdefghijklmnop")
        self.assertEqual((self.ctx.work_dir / "copy.txt").read_text(), "changed")
        result = await self.tools["read_file"].run(path=upload.id, offset=3, max_chars=4)
        self.assertIn("defg", result)
        self.assertNotIn("hijkl", result)

    async def test_rejects_path_escapes_and_symlinks_for_reads_and_writes(self):
        outside = self.root / "outside"
        outside.mkdir()
        (outside / "secret.txt").write_text("secret")
        self.ctx.work_dir.mkdir(parents=True)
        (self.ctx.work_dir / "link").symlink_to(outside, target_is_directory=True)
        for path in ("../../outside/secret.txt", str(outside / "secret.txt"), "link/secret.txt"):
            with self.subTest(path=path):
                with self.assertRaises(ToolError):
                    await self.tools["read_file"].run(path=path)
                with self.assertRaises(ToolError):
                    await self.tools["write_file"].run(path=path, content="overwritten")
        self.assertEqual((outside / "secret.txt").read_text(), "secret")

    async def test_context_switch_prevents_another_conversation_access(self):
        await self.tools["write_file"].run(path="one.txt", content="chat one")
        first_path = self.ctx.work_dir / "one.txt"
        second = files.FileContext(self.store, "chat-two", set())
        token = files.set_file_context(second)
        try:
            with self.assertRaises(ToolError):
                await self.tools["read_file"].run(path=str(first_path))
            await self.tools["write_file"].run(path="one.txt", content="chat two")
            self.assertEqual((second.work_dir / "one.txt").read_text(), "chat two")
        finally:
            files.reset_file_context(token)
        self.assertEqual(first_path.read_text(), "chat one")

    async def test_zip_extract_edit_export_roundtrip(self):
        upload = self.archive({"project/main.py": b"print('before')\n", "README.md": b"project"})
        result = await self.tools["extract_archive"].run(path=upload.id, destination="project")
        self.assertIn("main.py", result)
        self.assertIn("before", await self.tools["read_file"].run(path="project/project/main.py"))
        await self.tools["write_file"].run(path="project/project/main.py", content="print('after')\n")
        result = await self.tools["export_file"].run(path="project", filename="edited.zip")
        identifier = re.search(r"/api/uploads/([a-f0-9]{32})", result).group(1)
        exported = self.store.get(identifier)
        self.assertEqual(exported.filename, "edited.zip")
        self.assertEqual(exported.chat_id, "chat-one")
        with zipfile.ZipFile(exported.path) as archive:
            self.assertEqual(archive.read("project/main.py"), b"print('after')\n")
        with zipfile.ZipFile(upload.path) as archive:
            self.assertEqual(archive.read("project/main.py"), b"print('before')\n")

    async def test_zip_rejects_traversal_absolute_windows_and_backslash_paths(self):
        for index, bad in enumerate(("../escape", "/absolute", "C:/windows", "dir\\escape", "safe/../../escape")):
            with self.subTest(path=bad):
                upload = self.archive({bad: b"bad"}, f"bad-{index}.zip")
                with self.assertRaises(ToolError):
                    await self.tools["extract_archive"].run(path=upload.id, destination=f"bad-{index}")
                self.assertFalse((self.ctx.work_dir / f"bad-{index}").exists())

    async def test_zip_rejects_symlink_members(self):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as archive:
            link = zipfile.ZipInfo("link")
            link.create_system = 3
            link.external_attr = (stat.S_IFLNK | 0o777) << 16
            archive.writestr(link, "../../outside")
        upload = self.attach(buffer.getvalue(), "symlink.zip")
        with self.assertRaises(ToolError):
            await self.tools["extract_archive"].run(path=upload.id, destination="links")
        self.assertFalse((self.ctx.work_dir / "links").exists())

    async def test_zip_expanded_size_and_member_limits_clean_partial_output(self):
        self.ctx.max_extracted_bytes = 100
        upload = self.archive({"first.txt": b"okay", "large.txt": b"z" * 200})
        with self.assertRaises(ToolError):
            await self.tools["extract_archive"].run(path=upload.id, destination="bomb")
        self.assertFalse((self.ctx.work_dir / "bomb").exists())
        self.ctx.max_archive_members = 1
        upload = self.archive({"one.txt": b"one", "two.txt": b"two"}, "members.zip")
        with self.assertRaises(ToolError):
            await self.tools["extract_archive"].run(path=upload.id, destination="members")
        self.assertFalse((self.ctx.work_dir / "members").exists())

    async def test_rejects_invalid_chat_scope_and_missing_context(self):
        with self.assertRaises((ValueError, ToolError)):
            files.FileContext(self.store, "../../escape", set())
        token = files.set_file_context(None)
        try:
            with self.assertRaises(ToolError):
                await self.tools["list_files"].run()
        finally:
            files.reset_file_context(token)

    async def test_binary_read_returns_metadata_and_hex(self):
        upload = self.attach(b"\x00\xff\x80\x01", "sample.bin")
        result = await self.tools["read_file"].run(path=upload.id)
        self.assertIn("00 ff 80 01", result)
        self.assertNotIn("\ufffd", result)

    async def test_binary_control_bytes_are_not_returned_as_text(self):
        upload = self.attach(b"\x01\x02\x03\x04", "controls.bin")
        result = await self.tools["read_file"].run(path=upload.id)
        self.assertIn("01 02 03 04", result)
        self.assertNotIn("\x01", result)

    async def test_rebuilt_office_zip_preserves_requested_download_extension(self):
        upload = self.archive({"word/document.xml": b'<w:document xmlns:w="urn:word"><w:p><w:r><w:t>before</w:t></w:r></w:p></w:document>'}, "document.docx")
        await self.tools["extract_archive"].run(path=upload.id, destination="office")
        await self.tools["write_file"].run(path="office/word/document.xml", content='<w:document xmlns:w="urn:word"><w:p><w:r><w:t>after</w:t></w:r></w:p></w:document>')
        result = await self.tools["export_file"].run(path="office", filename="edited.docx")
        identifier = re.search(r"/api/uploads/([a-f0-9]{32})", result).group(1)
        self.assertEqual(self.store.get(identifier).filename, "edited.docx")
        self.assertIn("after", await self.tools["read_file"].run(path=identifier))

    async def test_office_zip_xml_read_extracts_text(self):
        upload = self.archive({"word/document.xml": b'<w:document xmlns:w="urn:word"><w:p><w:r><w:t>Hello document</w:t></w:r></w:p></w:document>'}, "document.docx")
        result = await self.tools["read_file"].run(path=upload.id)
        self.assertIn("Hello document", result)

    async def test_utf8_detection_handles_a_sample_ending_inside_a_character(self):
        upload = self.attach(("a" * 4095 + "€" + "tail").encode(), "utf8.txt")
        result = await self.tools["read_file"].run(path=upload.id, offset=4095, max_chars=10)
        self.assertIn("€tail", result)

    async def test_paging_does_not_rewrite_content_that_looks_like_an_offset(self):
        upload = self.attach(b"xxxoffset=8 xyz after", "paging.txt")
        result = await self.tools["read_file"].run(path=upload.id, offset=3, max_chars=8)
        self.assertIn("\noffset=8\n", result)

    async def test_pdf_text_is_read_without_shell(self):
        writer = PdfWriter()
        page = writer.add_blank_page(width=200, height=200)
        font = DictionaryObject({NameObject("/Type"): NameObject("/Font"), NameObject("/Subtype"): NameObject("/Type1"), NameObject("/BaseFont"): NameObject("/Helvetica")})
        page[NameObject("/Resources")] = DictionaryObject({NameObject("/Font"): DictionaryObject({NameObject("/F1"): writer._add_object(font)})})
        content = DecodedStreamObject()
        content.set_data(b"BT /F1 12 Tf 10 150 Td (Hello PDF) Tj ET")
        page[NameObject("/Contents")] = writer._add_object(content)
        output = io.BytesIO()
        writer.write(output)
        upload = self.attach(output.getvalue(), "document.pdf")
        self.assertIn("Hello PDF", await self.tools["read_file"].run(path=upload.id))

    async def test_existing_destination_is_not_overwritten(self):
        await self.tools["write_file"].run(path="existing/user.txt", content="keep")
        upload = self.archive({"new.txt": b"new"})
        with self.assertRaises(ToolError):
            await self.tools["extract_archive"].run(path=upload.id, destination="existing")
        self.assertEqual((self.ctx.work_dir / "existing/user.txt").read_text(), "keep")

    async def test_write_and_export_enforce_upload_limit(self):
        self.store.max_bytes = 3
        with self.assertRaises(ToolError):
            await self.tools["write_file"].run(path="large.txt", content="large")
        self.assertFalse((self.ctx.work_dir / "large.txt").exists())
        self.ctx.work_dir.mkdir(parents=True, exist_ok=True)
        (self.ctx.work_dir / "external.bin").write_bytes(b"large")
        with self.assertRaises(ToolError):
            await self.tools["export_file"].run(path="external.bin")

    async def test_text_read_preserves_crlf_for_exact_edits(self):
        upload = self.attach(b"line one\r\nline two\r\n", "crlf.txt")
        result = await self.tools["read_file"].run(path=upload.id)
        self.assertIn("line one\r\nline two\r\n", result)

    async def test_copy_binary_preserves_exact_original_and_download_bytes(self):
        payload = bytes(range(256)) * 80
        upload = self.attach(payload, "binary.bin")
        await self.tool("copy_file").run(source=upload.id, path="copies/binary.bin")
        working = self.ctx.work_dir / "copies/binary.bin"
        self.assertEqual(working.read_bytes(), payload)
        result = await self.tools["export_file"].run(path="copies/binary.bin")
        identifier = re.search(r"/api/uploads/([a-f0-9]{32})", result).group(1)
        self.assertEqual(self.store.get(identifier).path.read_bytes(), payload)
        await self.tools["write_file"].run(path="copies/binary.bin", content="replacement")
        self.assertEqual(upload.path.read_bytes(), payload)

    async def test_edit_large_work_copy_preserves_bom_crlf_and_untouched_suffix(self):
        payload = b"\xef\xbb\xbfheader\r\ntarget one\r\ntarget two\r\n" + b"suffix\r\n" * 20_000
        upload = self.attach(payload, "large.txt")
        await self.tool("copy_file").run(source=str(upload.path), path="large.txt")
        page = await self.tools["read_file"].run(path="large.txt", max_chars=40)
        self.assertIn("target one\r\ntarget two\r\n", page)
        await self.tool("edit_file").run(path="large.txt", old_text="target one\r\ntarget two\r\n", new_text="changed\r\n")
        self.assertEqual((self.ctx.work_dir / "large.txt").read_bytes(), b"\xef\xbb\xbfheader\r\nchanged\r\n" + b"suffix\r\n" * 20_000)
        self.assertEqual(upload.path.read_bytes(), payload)

    async def test_edit_absent_ambiguous_and_empty_match_do_not_modify_work_file(self):
        await self.tools["write_file"].run(path="edit.txt", content="match\nmatch\n")
        for old in ("missing", "match", ""):
            with self.subTest(old=old):
                with self.assertRaises(ToolError):
                    await self.tool("edit_file").run(path="edit.txt", old_text=old, new_text="changed")
                self.assertEqual((self.ctx.work_dir / "edit.txt").read_bytes(), b"match\nmatch\n")
        await self.tool("edit_file").run(path="edit.txt", old_text="match", new_text="changed", replace_all=True)
        self.assertEqual((self.ctx.work_dir / "edit.txt").read_bytes(), b"changed\nchanged\n")

    async def test_copy_and_edit_reject_escapes_and_original_write(self):
        upload = self.attach(b"original", "original.txt")
        outside = self.root / "outside.txt"
        outside.write_bytes(b"outside")
        for source, path in ((str(outside), "copy.txt"), (upload.id, "../../outside.txt"), (upload.id, str(upload.path))):
            with self.subTest(source=source, path=path):
                with self.assertRaises(ToolError):
                    await self.tool("copy_file").run(source=source, path=path)
        for path in (str(upload.path), "../../outside.txt"):
            with self.assertRaises(ToolError):
                await self.tool("edit_file").run(path=path, old_text="original", new_text="changed")
        self.assertEqual(upload.path.read_bytes(), b"original")
        self.assertEqual(outside.read_bytes(), b"outside")

    async def test_copy_and_edit_size_failures_leave_existing_work_file_unchanged(self):
        upload = self.attach(b"original-too-large", "large.bin")
        await self.tools["write_file"].run(path="existing.txt", content="a")
        self.store.max_bytes = 4
        with self.assertRaises(ToolError):
            await self.tool("copy_file").run(source=upload.id, path="existing.txt")
        with self.assertRaises(ToolError):
            await self.tool("edit_file").run(path="existing.txt", old_text="a", new_text="\u20ac\u20ac")
        self.assertEqual((self.ctx.work_dir / "existing.txt").read_bytes(), b"a")
        self.assertFalse(any(self.ctx.work_dir.glob(".write-*")))


if __name__ == "__main__":
    unittest.main()
