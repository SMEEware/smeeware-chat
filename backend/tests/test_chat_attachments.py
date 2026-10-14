from __future__ import annotations

import asyncio
import io
import json
import re
import tempfile
import unittest
import zipfile
from pathlib import Path
from types import SimpleNamespace

import httpx
from fastapi import FastAPI
from fastapi.responses import JSONResponse

from src.api.v1.routes.chat import router
from src.api.v1.routes.uploads import router as upload_router
from src.core.exceptions import AppError
from src.services.account.sessions import SessionStore
from src.services.ai.agent import Agent
from src.services.ai.base import Completion, LLMProvider, StreamChunk
from src.services.ai.steering import STEERING
from src.services.tools.base import ToolCall
from src.services.tools.local.base import LocalToolBox
from src.services.tools.local.files import FILE_CONTEXT, create_file_tools
from src.services.uploads import UploadStore


class EchoModel(LLMProvider):
    name = "test"

    def __init__(self):
        self.observed = []

    def observe(self, messages, options):
        self.observed.append((tuple(messages), tuple(options.tools)))

    async def complete(self, messages, options=None):
        self.observe(messages, options)
        return Completion(content=messages[-1].content, model="test")

    async def stream(self, messages, options=None):
        self.observe(messages, options)
        yield StreamChunk(kind="content", text=messages[-1].content)

    async def aclose(self):
        pass


class RoundTripModel(EchoModel):
    """A deterministic replacement for the external model; all file operations are real."""

    async def complete(self, messages, options=None):
        self.observe(messages, options)
        last = messages[-1]
        if not options.tools:
            return Completion(content="Enable tools to process the attachment.", model="test")
        if last.role != "tool":
            identifier = re.search(r"File ID: ([0-9a-f]{32})", last.content).group(1)
            call = ToolCall("extract", "extract_archive", {"path": identifier, "destination": "project"})
        elif last.tool_call_id == "extract":
            call = ToolCall("read", "read_file", {"path": "project/main.txt"})
        elif last.tool_call_id == "read":
            call = ToolCall("write", "write_file", {"path": "project/main.txt", "content": "edited by request\n"})
        elif last.tool_call_id == "write":
            call = ToolCall("export", "export_file", {"path": "project", "filename": "edited project.zip"})
        else:
            return Completion(content=last.content, model="test")
        return Completion(content="", model="test", tool_calls=(call,))

    async def stream(self, messages, options=None):
        completion = await self.complete(messages, options)
        for call in completion.tool_calls:
            yield StreamChunk(kind="tool_call", text=json.dumps(call.arguments), tool_name=call.name, tool_call_id=call.id)
        if completion.content:
            yield StreamChunk(kind="content", text=completion.content)


class SteeringModel(EchoModel):
    def __init__(self, initial_tool=True):
        super().__init__()
        self.started = asyncio.Event()
        self.release = asyncio.Event()
        self.round = 0
        self.initial_tool = initial_tool

    async def stream(self, messages, options=None):
        self.observe(messages, options)
        self.round += 1
        if self.round == 1:
            self.started.set()
            await self.release.wait()
            if self.initial_tool:
                yield StreamChunk(kind="tool_call", text="{}", tool_name="list_files", tool_call_id="list")
            else:
                yield StreamChunk(kind="content", text="Initial answer.")
            return
        last = messages[-1]
        if last.role == "user":
            identifier = re.search(r"File ID: ([0-9a-f]{32})", last.content).group(1)
            yield StreamChunk(kind="tool_call", text=json.dumps({"path": identifier}), tool_name="read_file", tool_call_id="read-late")
        else:
            yield StreamChunk(kind="content", text=last.content)


class ConcurrentReaderModel(EchoModel):
    def __init__(self):
        super().__init__()
        self.waiting = 0
        self.ready = asyncio.Event()

    async def complete(self, messages, options=None):
        self.observe(messages, options)
        last = messages[-1]
        if last.role == "tool":
            return Completion(content=last.content, model="test")
        identifier = re.search(r"File ID: ([0-9a-f]{32})", last.content).group(1)
        self.waiting += 1
        if self.waiting == 2:
            self.ready.set()
        await asyncio.wait_for(self.ready.wait(), timeout=3)
        return Completion(content="", model="test", tool_calls=(ToolCall("read", "read_file", {"path": identifier}),))


class TestProvider:
    def __init__(self, root):
        self.local_models = ()
        self.sessions = SessionStore()
        self.settings = SimpleNamespace(
            uploads_enabled=True, uploads_max_bytes=20_000_000, uploads_max_files=8,
            uploads_max_extracted_bytes=100_000_000, uploads_max_archive_members=1000,
            require_api_key=False, chats_enabled=False,
        )
        self.uploads = UploadStore(root / "uploads")
        self.public_chats = None
        self.chats = None
        self.model = EchoModel()
        self.toolbox = LocalToolBox(create_file_tools())
        self.agents = {}

    async def tool_state(self):
        return frozenset(spec.name for spec in await self.toolbox.specs()), ""

    def agent_for(self, *args, **kwargs):
        tools = kwargs.get("tools", True)
        # Share real Agent/LocalToolBox instances across requests, just like ServiceProvider.
        return self.agents.setdefault(tools, Agent(
            self.model, system_prompt="Answer the user's request.",
            toolbox=self.toolbox if tools else None, max_tool_rounds=8,
        ))

    def use_model(self, model):
        self.model = model
        self.agents.clear()


class ChatAttachmentTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.provider = TestProvider(self.root)
        self.session = self.provider.sessions.open("test", b"k" * 32)
        app = FastAPI()
        app.state.provider = self.provider
        app.include_router(router, prefix="/api/v1")
        app.include_router(upload_router, prefix="/api/v1")

        @app.exception_handler(AppError)
        async def error_handler(request, error):
            return JSONResponse(status_code=error.status_code, content=error.to_payload())

        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")
        self.headers = {"X-Session-Id": self.session}

    async def asyncTearDown(self):
        await self.client.aclose()
        self.temporary.cleanup()

    def attach(self, data=b"private file contents", filename="source.txt", chat_id=None):
        source = self.root / filename
        source.write_bytes(data)
        return self.provider.uploads.register(source, filename=filename, chat_id=chat_id)

    def request(self, file=None, **extra):
        return {
            "chat_id": "chat-one",
            "messages": [{"role": "user", "content": "Read the requested file", "attachment_ids": [file.id] if file else []}],
            **extra,
        }

    def frames(self, response):
        return [json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: ") and line != "data: [DONE]"]

    async def test_file_reference_cannot_be_a_host_path(self):
        response = await self.client.post("/api/v1/chat", json={
            "chat_id": "chat-one",
            "messages": [{"role": "user", "content": "Read this", "attachment_ids": ["../../secret"]}],
        })
        self.assertEqual(response.status_code, 422)

    async def test_attached_files_require_a_signed_in_session(self):
        response = await self.client.post("/api/v1/chat", json={
            "chat_id": "chat-one",
            "messages": [{"role": "user", "content": "Read this", "attachment_ids": ["a" * 32]}],
        })
        self.assertEqual(response.status_code, 401)

    async def test_attached_files_require_a_conversation_scope(self):
        response = await self.client.post("/api/v1/chat", headers={"X-Session-Id": self.session}, json={
            "messages": [{"role": "user", "content": "Read this", "attachment_ids": ["a" * 32]}],
        })
        self.assertEqual(response.status_code, 422)

    async def test_plain_text_chat_remains_usable_without_file_session(self):
        response = await self.client.post("/api/v1/chat", json={
            "messages": [{"role": "user", "content": "Hello"}],
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["content"], "Hello")

    async def test_file_metadata_reaches_model_for_complete_and_stream_without_inlining_bytes(self):
        uploaded = self.attach()
        for endpoint in ("/api/v1/chat", "/api/v1/chat/stream"):
            response = await self.client.post(endpoint, headers=self.headers, json=self.request(uploaded))
            self.assertEqual(response.status_code, 200, response.text)
            messages, _ = self.provider.model.observed[-1]
            content = next(message.content for message in messages if message.role == "user")
            self.assertIn("source.txt", content)
            self.assertIn("text/plain", content)
            self.assertIn("21 bytes", content)
            self.assertIn(uploaded.id, content)
            self.assertNotIn("private file contents", content)
            self.assertEqual(self.provider.uploads.get(uploaded.id).chat_id, "chat-one")
            self.assertIsNone(FILE_CONTEXT.get())

    async def test_agent_zip_extract_read_edit_export_roundtrip_for_complete_and_stream(self):
        archive_data = io.BytesIO()
        with zipfile.ZipFile(archive_data, "w") as archive:
            archive.writestr("main.txt", "original requested text\n")
            archive.writestr("untouched.txt", "keep this\n")
        original_data = archive_data.getvalue()
        uploaded = self.attach(original_data, "source.zip")
        for index, endpoint in enumerate(("/api/v1/chat", "/api/v1/chat/stream")):
            model = RoundTripModel()
            self.provider.use_model(model)
            chat_id = "chat-one" if index == 0 else "chat-two"
            attached = uploaded if index == 0 else self.attach(original_data, "second.zip")
            response = await self.client.post(endpoint, headers=self.headers, json=self.request(attached, chat_id=chat_id))
            self.assertEqual(response.status_code, 200, response.text)
            content = response.json()["content"] if index == 0 else "".join(frame.get("delta", "") for frame in self.frames(response) if frame["type"] == "content")
            identifier = re.search(r"/api/uploads/([0-9a-f]{32})", content).group(1)
            download = await self.client.get(f"/api/v1/uploads/{identifier}", headers=self.headers)
            self.assertEqual(download.status_code, 200)
            with zipfile.ZipFile(io.BytesIO(download.content)) as archive:
                self.assertEqual(archive.read("main.txt"), b"edited by request\n")
                self.assertEqual(archive.read("untouched.txt"), b"keep this\n")
            tool_read = [message.content for messages, _ in model.observed for message in messages if message.role == "tool" and message.tool_call_id == "read"]
            self.assertTrue(any("original requested text" in content for content in tool_read))
            self.assertEqual(attached.path.read_bytes(), original_data)
            self.assertEqual(self.provider.uploads.get(identifier).chat_id, chat_id)
            self.assertIsNone(FILE_CONTEXT.get())

    async def test_tools_off_returns_notice_without_reading_or_extracting_file(self):
        uploaded = self.attach(b"raw content must not reach model", "binary.zip")
        self.provider.use_model(RoundTripModel())
        response = await self.client.post("/api/v1/chat", headers=self.headers, json=self.request(uploaded, tools=False))
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIn("Enable tools", response.json()["content"])
        self.assertFalse(self.provider.uploads.work_root.exists())
        self.assertFalse(any(message.role == "tool" for messages, _ in self.provider.model.observed for message in messages))
        self.assertNotIn("raw content must not reach model", response.text)
        self.assertIsNone(FILE_CONTEXT.get())

    async def test_cross_chat_structured_attachments_are_rejected(self):
        uploaded = self.attach(chat_id="chat-two")
        response = await self.client.post("/api/v1/chat", headers=self.headers, json=self.request(uploaded))
        self.assertEqual(response.status_code, 409)
        self.assertEqual(self.provider.uploads.get(uploaded.id).chat_id, "chat-two")

    async def test_shared_agent_keeps_concurrent_file_contexts_isolated(self):
        first = self.attach(b"first conversation secret", "first.txt")
        second = self.attach(b"second conversation secret", "second.txt")
        self.provider.use_model(ConcurrentReaderModel())
        responses = await asyncio.gather(
            self.client.post("/api/v1/chat", headers=self.headers, json=self.request(first)),
            self.client.post("/api/v1/chat", headers=self.headers, json=self.request(second, chat_id="chat-two")),
        )
        self.assertEqual(responses[0].status_code, 200, responses[0].text)
        self.assertEqual(responses[1].status_code, 200, responses[1].text)
        self.assertIn("first conversation secret", responses[0].json()["content"])
        self.assertNotIn("second conversation secret", responses[0].text)
        self.assertIn("second conversation secret", responses[1].json()["content"])
        self.assertNotIn("first conversation secret", responses[1].text)
        self.assertIsNone(FILE_CONTEXT.get())

    async def run_late_attachment(self, initial_tool=True):
        uploaded = self.attach(b"late file actually read", "late.txt")
        model = SteeringModel(initial_tool=initial_tool)
        self.provider.use_model(model)
        stream_id = "late-tool" if initial_tool else "late-text"
        pending = asyncio.create_task(self.client.post(
            "/api/v1/chat/stream", headers=self.headers,
            json=self.request(stream_id=stream_id),
        ))
        try:
            await asyncio.wait_for(model.started.wait(), timeout=3)
            response = await self.client.post(
                f"/api/v1/chat/stream/{stream_id}/steer", headers=self.headers,
                json={"id": "late-message", "chat_id": "chat-one", "content": "Read this late file", "attachment_ids": [uploaded.id]},
            )
            self.assertEqual(response.status_code, 202, response.text)
            model.release.set()
            result = await asyncio.wait_for(pending, timeout=3)
            frames = self.frames(result)
            late = next(frame for frame in frames if frame["type"] == "steer" and frame["id"] == "late-message")
            self.assertEqual(late["content"], "Read this late file")
            self.assertEqual(late["attachments"], [{
                "id": uploaded.id, "name": "late.txt", "mediaType": "text/plain",
                "bytes": 23, "kind": "file",
            }])
            contents = "".join(frame.get("delta", "") for frame in frames if frame["type"] == "content")
            self.assertIn("late file actually read", contents)
            self.assertTrue(any(frame["type"] == "steer" and frame["id"] == "late-message" for frame in frames))
            self.assertTrue(any(frame["type"] == "tool_result" and frame["tool"] == "read_file" and frame["ok"] for frame in frames))
            self.assertEqual(self.provider.uploads.get(uploaded.id).chat_id, "chat-one")
            self.assertIsNone(STEERING.owner(stream_id))
            self.assertIsNone(FILE_CONTEXT.get())
        finally:
            model.release.set()
            if not pending.done():
                pending.cancel()
            await asyncio.gather(pending, return_exceptions=True)

    async def test_late_attachment_is_available_to_next_round_after_tool(self):
        await self.run_late_attachment()

    async def test_late_attachment_is_available_after_text_only_model_round(self):
        await self.run_late_attachment(initial_tool=False)

    async def test_steering_enforces_owner_session_and_chat_scope(self):
        model = SteeringModel()
        self.provider.use_model(model)
        uploaded = self.attach()
        other = self.provider.sessions.open("test", b"k" * 32)
        pending = asyncio.create_task(self.client.post("/api/v1/chat/stream", headers=self.headers, json=self.request(stream_id="owned-stream")))
        try:
            await asyncio.wait_for(model.started.wait(), timeout=3)
            body = {"id": "late", "chat_id": "chat-one", "content": "read", "attachment_ids": [uploaded.id]}
            for headers in ({}, {"X-Session-Id": other}):
                response = await self.client.post("/api/v1/chat/stream/owned-stream/steer", headers=headers, json=body)
                self.assertEqual(response.status_code, 401)
            body["chat_id"] = "chat-two"
            response = await self.client.post("/api/v1/chat/stream/owned-stream/steer", headers=self.headers, json=body)
            self.assertEqual(response.status_code, 422)
            self.assertIsNone(self.provider.uploads.get(uploaded.id).chat_id)
        finally:
            model.release.set()
            pending.cancel()
            await asyncio.gather(pending, return_exceptions=True)

    async def test_withdrawing_late_attachment_prevents_it_being_read(self):
        model = SteeringModel()
        self.provider.use_model(model)
        uploaded = self.attach(b"withdrawn content", "withdraw.txt")
        pending = asyncio.create_task(self.client.post("/api/v1/chat/stream", headers=self.headers, json=self.request(stream_id="withdraw-stream")))
        try:
            await asyncio.wait_for(model.started.wait(), timeout=3)
            response = await self.client.post("/api/v1/chat/stream/withdraw-stream/steer", headers=self.headers, json={
                "id": "withdraw-me", "chat_id": "chat-one", "content": "read", "attachment_ids": [uploaded.id],
            })
            self.assertEqual(response.status_code, 202)
            removed = await self.client.delete("/api/v1/chat/stream/withdraw-stream/steer/withdraw-me", headers=self.headers)
            self.assertEqual(removed.status_code, 200, removed.text)
            self.assertTrue(removed.json()["withdrawn"])
            model.release.set()
            response = await asyncio.wait_for(pending, timeout=3)
            self.assertNotIn("withdrawn content", response.text)
            self.assertFalse(any(frame["type"] == "steer" for frame in self.frames(response)))
        finally:
            model.release.set()
            if not pending.done():
                pending.cancel()
            await asyncio.gather(pending, return_exceptions=True)


if __name__ == "__main__":
    unittest.main()
