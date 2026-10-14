from __future__ import annotations

import io
import os
import tempfile
import time
import unittest
import zipfile
from pathlib import Path
from types import SimpleNamespace

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import SecretStr

from src.api.v1.routes import capabilities, chats, uploads
from src.core.config import LLMSettings, Settings
from src.core.exceptions import AppError, ConflictError, NotFoundError
from src.services.account.sessions import SessionStore
from src.services.chats.public import PublicChatStore
from src.services.chats.sqlite import SqliteChatStore
from src.services.uploads import UploadStore


def archive() -> bytes:
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w") as package:
        package.writestr("hello.txt", "original text\n")
    return output.getvalue()


class UploadTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.settings = Settings(
            llm=LLMSettings(api_key=SecretStr("test")),
            uploads_dir=self.root / "uploads",
            uploads_max_bytes=10_000,
            uploads_max_files=2,
        )
        self.sessions = SessionStore()
        self.session = self.sessions.open("test", b"0" * 32)
        self.chats = SqliteChatStore(self.root / "chats.db")
        self.public = PublicChatStore(self.root / "chats.db", b"1" * 32)
        await self.chats.ensure_schema()
        await self.public.ensure_schema()
        self.store = UploadStore(
            self.settings.uploads_dir,
            max_bytes=self.settings.uploads_max_bytes,
            max_files=self.settings.uploads_max_files,
        )
        provider = SimpleNamespace(
            settings=self.settings,
            sessions=self.sessions,
            uploads=self.store,
            chats=self.chats,
            public_chats=self.public,
            can_share=True,
            chats_for=lambda session: self.chats if self.sessions.fetch(session) else None,
        )
        self.provider = provider
        app = FastAPI()
        app.state.provider = provider

        @app.exception_handler(AppError)
        async def app_error(_: Request, error: AppError) -> JSONResponse:
            return JSONResponse(error.to_payload(), status_code=error.status_code)

        app.include_router(uploads.router, prefix="/api/v1")
        app.include_router(capabilities.router, prefix="/api/v1")
        app.include_router(chats.router, prefix="/api/v1")
        self.client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        )
        self.headers = {"X-Session-Id": self.session}

    async def asyncTearDown(self) -> None:
        await self.client.aclose()
        self.temporary.cleanup()

    def require_store(self):
        self.assertIsNotNone(self.store, "The persistent generic UploadStore is missing.")
        return self.store

    async def upload(self, content: bytes = b"file", filename: str = "project.zip", media_type: str = "application/zip") -> dict:
        response = await self.client.post(
            "/api/v1/uploads", headers=self.headers,
            files=[("files", (filename, content, media_type))],
        )
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()["files"][0]

    async def test_upload_requires_signed_in_session(self) -> None:
        response = await self.client.post(
            "/api/v1/uploads", files=[("files", ("image.png", b"image", "image/png"))]
        )
        self.assertEqual(response.status_code, 401)

    async def test_zip_upload_preserves_bytes_and_original_filename(self) -> None:
        data = archive()
        uploaded = await self.upload(data, "source project.zip")
        response = await self.client.get(
            f"/api/v1/uploads/{uploaded['id']}", headers=self.headers
        )
        self.assertEqual(response.content, data)
        self.assertEqual(response.headers["content-type"], "application/zip")
        self.assertIn("attachment;", response.headers["content-disposition"])
        self.assertIn("source%20project.zip", response.headers["content-disposition"])
        self.assertEqual(response.headers["x-content-type-options"], "nosniff")

    async def test_extensionless_unknown_file_is_downloadable(self) -> None:
        uploaded = await self.upload(b"\x00\xff\x01", "README", "")
        response = await self.client.get(
            f"/api/v1/uploads/{uploaded['id']}", headers=self.headers
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, b"\x00\xff\x01")
        self.assertEqual(response.headers["content-type"], "application/octet-stream")

    async def test_exact_limit_is_accepted_and_larger_file_has_structured_error(self) -> None:
        await self.upload(b"x" * 10_000)
        response = await self.client.post(
            "/api/v1/uploads", headers=self.headers,
            files=[("files", ("too-big.zip", b"x" * 10_001, "application/zip"))],
        )
        self.assertEqual(response.status_code, 413)
        self.assertEqual(response.json()["error"]["code"], "file_too_large")
        self.assertEqual(response.json()["error"]["details"], {
            "filename": "too-big.zip", "max_bytes": 10_000,
        })

    async def test_failed_batch_removes_files_saved_before_failure(self) -> None:
        response = await self.client.post(
            "/api/v1/uploads", headers=self.headers,
            files=[
                ("files", ("first.png", b"valid", "image/png")),
                ("files", ("large.png", b"x" * 10_001, "image/png")),
            ],
        )
        self.assertEqual(response.status_code, 413)
        self.assertEqual([path for path in self.settings.uploads_dir.iterdir() if path.is_file()], [])
        self.assertEqual(list((self.settings.uploads_dir / ".metadata").glob("*.json")), [])

    async def test_too_many_files_has_structured_count_error(self) -> None:
        response = await self.client.post(
            "/api/v1/uploads", headers=self.headers,
            files=[("files", (f"{number}.png", b"image", "image/png")) for number in range(3)],
        )
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["error"]["code"], "too_many_files")
        self.assertEqual(response.json()["error"]["details"], {"max_files": 2})

    async def test_private_file_requires_session_even_when_id_is_known(self) -> None:
        uploaded = await self.upload()
        response = await self.client.get(f"/api/v1/uploads/{uploaded['id']}")
        self.assertEqual(response.status_code, 401)

    async def test_public_download_requires_actual_reference_and_stops_after_unshare(self) -> None:
        uploaded = await self.upload()
        self.require_store().bind([uploaded["id"]], "shared-chat")
        chat = await self.chats.upsert("shared-chat", [{"role": "user", "content": "hello"}])
        await self.public.publish(chat)
        endpoint = f"/api/v1/uploads/{uploaded['id']}"
        self.assertEqual((await self.client.get(endpoint)).status_code, 401)
        chat = await self.chats.upsert("shared-chat", [{
            "role": "user", "content": "read this",
            "attachments": [{"id": uploaded["id"], "kind": "file"}],
        }])
        await self.public.publish(chat)
        self.assertEqual((await self.client.get(endpoint)).status_code, 200)
        await self.public.withdraw("shared-chat")
        self.assertEqual((await self.client.get(endpoint)).status_code, 401)

    async def test_html_download_is_attachment_and_images_remain_inline(self) -> None:
        for filename, media_type, disposition in [
            ("page.html", "text/html", "attachment"),
            ("image.png", "image/png", "inline"),
        ]:
            uploaded = await self.upload(b"content", filename, media_type)
            response = await self.client.get(f"/api/v1/uploads/{uploaded['id']}", headers=self.headers)
            self.assertTrue(response.headers["content-disposition"].startswith(disposition))

    async def test_capabilities_advertises_real_upload_limits(self) -> None:
        response = await self.client.get("/api/v1/capabilities")
        self.assertEqual(response.json(), {
            "sharing": True, "uploads": True, "uploads_max_bytes": 10_000,
            "uploads_max_files": 2,
        })

    async def test_binding_resolves_whole_list_before_changing_any_file(self) -> None:
        uploaded = await self.upload()
        store = self.require_store()
        with self.assertRaises(NotFoundError):
            store.bind([uploaded["id"], "a" * 32], "chat-one")
        self.assertIsNone(store.get(uploaded["id"]).chat_id)
        store.bind([uploaded["id"]], "chat-one")
        with self.assertRaises(ConflictError):
            store.bind([uploaded["id"]], "chat-two")
        self.assertEqual(store.get(uploaded["id"]).chat_id, "chat-one")

    async def test_metadata_survives_new_store_and_sanitizes_original_name(self) -> None:
        uploaded = await self.upload(b"file", "../../unsafe\r\n.zip")
        store = self.require_store()
        restored = type(store)(self.settings.uploads_dir).get(uploaded["id"])
        self.assertEqual(restored.filename, "unsafe.zip")
        self.assertEqual(restored.path.parent, self.settings.uploads_dir.resolve())
        self.assertEqual(restored.path.read_bytes(), b"file")

    async def test_filename_preserves_literal_percent_and_unicode(self) -> None:
        uploaded = await self.upload(b"file", "Quellcode%20f\u00fcr.zip")
        self.assertEqual(uploaded["filename"], "Quellcode%20f\u00fcr.zip")

    async def test_stream_overflow_and_cancellation_leave_no_partial_files(self) -> None:
        store = UploadStore(self.settings.uploads_dir, max_bytes=5)
        chunks = iter((b"abc", b"def", b""))

        async def read(_: int) -> bytes:
            return next(chunks)

        with self.assertRaises(AppError) as failure:
            await store.save("file.bin", "application/octet-stream", read)
        self.assertEqual(failure.exception.code, "file_too_large")
        self.assertEqual([path for path in store.root.iterdir() if path.is_file()], [])
        self.assertEqual(list((store.root / ".metadata").glob("*.json")), [])

        import asyncio
        started = False

        async def interrupted(_: int) -> bytes:
            nonlocal started
            if not started:
                started = True
                return b"abc"
            raise asyncio.CancelledError

        with self.assertRaises(asyncio.CancelledError):
            await store.save("cancelled.bin", "application/octet-stream", interrupted)
        self.assertEqual([path for path in store.root.iterdir() if path.is_file()], [])

    async def test_unknown_image_mime_is_detected_from_content(self) -> None:
        uploaded = await self.upload(b"\x89PNG\r\n\x1a\ncontent", "image", "application/octet-stream")
        self.assertEqual(uploaded["media_type"], "image/png")
        self.assertTrue(uploaded["path"].endswith(".png"))

    async def test_delete_all_chats_removes_bound_files_and_preserves_unbound_legacy(self) -> None:
        first = await self.upload()
        second = await self.upload()
        store = self.require_store()
        store.bind([first["id"]], "chat-one")
        await self.chats.upsert("chat-one", [{"role": "user", "content": "hello"}])
        legacy = store.root / ("f" * 32 + ".png")
        legacy.write_bytes(b"image")
        response = await self.client.delete("/api/v1/chats", headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"deleted": 1})
        self.assertFalse(Path(first["path"]).exists())
        self.assertTrue(store.get(second["id"]).path.exists())
        self.assertTrue(legacy.exists())

    async def test_delete_all_reclaims_never_saved_scopes_but_preserves_drafts_and_legacy(self) -> None:
        bound = await self.upload()
        draft = await self.upload()
        self.store.bind([bound["id"]], "never-saved")
        for scope in ("never-saved", "work-only"):
            work = self.store.work_root / scope
            work.mkdir(parents=True)
            (work / "result.txt").write_text("unsaved output")
        legacy = self.store.root / ("b" * 32 + ".png")
        legacy.write_bytes(b"legacy output")
        response = await self.client.delete("/api/v1/chats", headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"deleted": 0})
        self.assertFalse(Path(bound["path"]).exists())
        self.assertFalse((self.store.work_root / "never-saved").exists())
        self.assertFalse((self.store.work_root / "work-only").exists())
        self.assertTrue(Path(draft["path"]).exists())
        self.assertTrue(legacy.exists())

    async def test_next_upload_reclaims_aged_orphans_but_preserves_saved_and_recent_scopes(self) -> None:
        old = time.time() - 90_000
        expired = await self.upload()
        saved = await self.upload()
        self.store.bind([expired["id"]], "expired-api-chat")
        self.store.bind([saved["id"]], "saved-chat")
        await self.chats.upsert("saved-chat", [{"role": "user", "content": "saved"}])
        for uploaded in (expired, saved):
            os.utime(self.store.root / ".metadata" / f"{uploaded['id']}.json", (old, old))
        expired_work = self.store.work_root / "expired-api-chat"
        work_only = self.store.work_root / "expired-work-only"
        recent_work = self.store.work_root / "recent-work-only"
        for work in (expired_work, work_only, recent_work):
            work.mkdir(parents=True)
            document = work / "edited.txt"
            document.write_text("working contents")
            if work != recent_work:
                os.utime(document, (old, old))
            os.utime(work, (old, old))
        await self.upload()
        self.assertFalse(Path(expired["path"]).exists())
        self.assertFalse(expired_work.exists())
        self.assertFalse(work_only.exists())
        self.assertTrue(recent_work.exists())
        self.assertTrue(Path(saved["path"]).exists())

    async def test_binding_refreshes_unsaved_conversation_activity(self) -> None:
        first = await self.upload()
        second = await self.upload()
        self.store.bind([first["id"], second["id"]], "active-api-chat")
        old = time.time() - 90_000
        for uploaded in (first, second):
            os.utime(self.store.root / ".metadata" / f"{uploaded['id']}.json", (old, old))
        self.store.bind([second["id"]], "active-api-chat")
        await self.upload()
        self.assertTrue(Path(first["path"]).exists())
        self.assertTrue(Path(second["path"]).exists())
        metadata = self.store.root / ".metadata" / f"{second['id']}.json"
        self.assertGreater(metadata.stat().st_mtime, old)

    async def test_orphan_cleanup_skips_disabled_chat_history(self) -> None:
        uploaded = await self.upload()
        self.store.bind([uploaded["id"]], "api-only")
        old = time.time() - 90_000
        os.utime(self.store.root / ".metadata" / f"{uploaded['id']}.json", (old, old))
        self.provider.settings = self.settings.model_copy(update={"chats_enabled": False})
        await self.upload()
        self.assertTrue(Path(uploaded["path"]).exists())

    async def test_orphan_cleanup_preserves_saved_chat_ids_beyond_first_page(self) -> None:
        uploaded = await self.upload()
        self.store.bind([uploaded["id"]], "earliest-chat")
        await self.chats.upsert("earliest-chat", [{"role": "user", "content": "earliest"}])
        for number in range(201):
            await self.chats.upsert(f"newer-{number}", [{"role": "user", "content": "newer"}])
        old = time.time() - 90_000
        os.utime(self.store.root / ".metadata" / f"{uploaded['id']}.json", (old, old))
        await self.upload()
        self.assertTrue(Path(uploaded["path"]).exists())

    async def test_export_registration_copies_file_and_persists_chat_binding(self) -> None:
        store = self.require_store()
        original = self.root / "result.txt"
        original.write_bytes(b"changed\n")
        exported = store.register(original, filename="edited.txt", chat_id="chat-one")
        original.write_bytes(b"next change")
        self.assertEqual(exported.path.read_bytes(), b"changed\n")
        self.assertEqual(type(store)(store.root).get(exported.id).chat_id, "chat-one")

    async def test_unbound_cleanup_removes_only_expired_metadata_files(self) -> None:
        first = await self.upload()
        second = await self.upload()
        store = self.require_store()
        store.bind([second["id"]], "chat-one")
        old = time.time() - 90_000
        for uploaded in (first, second):
            os.utime(store.root / ".metadata" / f"{uploaded['id']}.json", (old, old))
        legacy = store.root / ("b" * 32 + ".png")
        legacy.write_bytes(b"old image")
        os.utime(legacy, (old, old))
        store.cleanup_unbound()
        with self.assertRaises(NotFoundError):
            store.get(first["id"])
        self.assertTrue(store.get(second["id"]).path.exists())
        self.assertTrue(legacy.exists())

    async def test_chat_save_binds_attachments_and_export_links_then_delete_removes_only_its_files(self) -> None:
        first = await self.upload()
        second = await self.upload()
        store = self.require_store()
        generated_id = "c" * 32
        generated = store.root / f"{generated_id}.mp3"
        generated.write_bytes(b"audio")
        response = await self.client.put(
            "/api/v1/chats/chat-one", headers=self.headers, json={"messages": [
                {"role": "user", "content": "edit", "attachments": [{"id": first["id"], "kind": "file"}]},
                {"role": "assistant", "content": f"[listen](/api/uploads/{generated_id})"},
            ]},
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(store.get(first["id"]).chat_id, "chat-one")
        self.assertEqual(store.get(generated_id).chat_id, "chat-one")
        work = store.root / ".work" / "chat-one"
        work.mkdir(parents=True)
        (work / "edited.txt").write_text("edited")
        response = await self.client.delete("/api/v1/chats/chat-one", headers=self.headers)
        self.assertEqual(response.status_code, 204)
        self.assertFalse(Path(first["path"]).exists())
        self.assertFalse(generated.exists())
        self.assertFalse(work.exists())
        self.assertTrue(store.get(second["id"]).path.exists())

    async def test_chat_save_ignores_missing_content_links_but_rejects_missing_attachments(self) -> None:
        identifier = "a" * 32
        response = await self.client.put(
            "/api/v1/chats/chat-one", headers=self.headers, json={"messages": [
                {"role": "assistant", "content": f"[example](/api/uploads/{identifier})"},
            ]},
        )
        self.assertEqual(response.status_code, 200, response.text)
        response = await self.client.put(
            "/api/v1/chats/chat-one", headers=self.headers, json={"messages": [
                {"role": "user", "content": "read", "attachments": [{"id": identifier, "kind": "file"}]},
            ]},
        )
        self.assertEqual(response.status_code, 404)

    async def test_quoting_another_chat_download_does_not_rebind_or_publish_source_file(self) -> None:
        uploaded = await self.upload()
        self.store.bind([uploaded["id"]], "source-chat")
        response = await self.client.put(
            "/api/v1/chats/quoted-chat", headers=self.headers, json={"messages": [
                {"role": "user", "content": f"Prior answer: [download](/api/uploads/{uploaded['id']})"},
            ]},
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self.store.get(uploaded["id"]).chat_id, "source-chat")
        quoted = await self.chats.get("quoted-chat")
        await self.public.publish(quoted)
        response = await self.client.get(f"/api/v1/uploads/{uploaded['id']}")
        self.assertEqual(response.status_code, 401)
        response = await self.client.put(
            "/api/v1/chats/quoted-chat", headers=self.headers, json={"messages": [
                {"role": "user", "content": "read", "attachments": [{"id": uploaded["id"], "kind": "file"}]},
            ]},
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(self.store.get(uploaded["id"]).chat_id, "source-chat")

    async def test_legacy_public_image_needs_a_shared_reference(self) -> None:
        self.settings.uploads_dir.mkdir(parents=True, exist_ok=True)
        identifier = "d" * 32
        (self.settings.uploads_dir / f"{identifier}.png").write_bytes(b"image")
        endpoint = f"/api/v1/uploads/{identifier}"
        self.assertEqual((await self.client.get(endpoint)).status_code, 401)
        chat = await self.chats.upsert("legacy", [{"role": "assistant", "content": f"![image](/api/uploads/{identifier})"}])
        await self.public.publish(chat)
        self.assertEqual((await self.client.get(endpoint)).status_code, 200)

    async def test_legacy_symlink_cannot_serve_file_outside_upload_folder(self) -> None:
        self.settings.uploads_dir.mkdir(parents=True, exist_ok=True)
        external = self.root / "secret.png"
        external.write_bytes(b"private")
        identifier = "e" * 32
        (self.settings.uploads_dir / f"{identifier}.png").symlink_to(external)
        response = await self.client.get(f"/api/v1/uploads/{identifier}", headers=self.headers)
        self.assertEqual(response.status_code, 404)


if __name__ == "__main__":
    unittest.main()
