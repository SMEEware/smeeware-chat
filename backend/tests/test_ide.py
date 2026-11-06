from __future__ import annotations

import asyncio
import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import httpx
from openai import AsyncOpenAI
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import ValidationError as PydanticError

from src.api.v1.routes.ide import router
from src.core.exceptions import AppError, ProviderError
from src.schemas.ide import IdeChatRequest
from src.services.ai.base import Completion, LLMProvider, StreamChunk
from src.services.ai.ide import CLIENT_NAMES
from src.services.ai.providers.openai_compatible import OpenAICompatibleProvider
from src.services.ai.providers.openai_responses import OpenAIResponsesProvider
from src.services.ai.base import CompletionOptions, Message
from src.services.tools.base import ToolResult, ToolSpec
from src.services.tools.ide_web import PublicWebTransport, public_address


class FixtureModel(LLMProvider):
    name = "deepseek"

    def __init__(self):
        self.calls = []
        self.chunks = [StreamChunk(kind="reasoning", text="private provider reasoning"),
                       StreamChunk(kind="tool_call", text='{"path":"main.ts"}',
                                   tool_name="vscode_read_file", tool_call_id="local-one")]

    async def complete(self, messages, options=None):
        self.calls.append((messages, options))
        return Completion(content=" (ready) {\n  run();\n}", model="fixture")

    async def stream(self, messages, options=None):
        self.calls.append((messages, options))
        for chunk in self.chunks:
            if isinstance(chunk, Exception):
                raise chunk
            yield chunk

    async def aclose(self):
        pass


class WebBox:
    def __init__(self):
        self.invocations = []

    async def specs(self):
        # Extra tools deliberately included: the route must still exclude them.
        return [ToolSpec(name=name, description=name, parameters={"type": "object"})
                for name in ("web_search", "fetch_page", "fetch_json", "notify_user", "run_shell", "list_files")]

    async def invoke(self, call):
        self.invocations.append(call)
        return ToolResult(call_id=call.id, name=call.name, content="Source: https://example.com\nPublic documentation.")


class IdeApiTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.model = FixtureModel()
        self.box = WebBox()
        self.provider = SimpleNamespace(
            settings=SimpleNamespace(require_api_key=False), local_models=(),
            provider_for=lambda runtime: self.model, ide_web_toolbox=self.box,
            ide_web_selection=AsyncMock(return_value=frozenset(spec.name for spec in await self.box.specs())),
        )
        app = FastAPI()
        app.state.provider = self.provider
        app.include_router(router, prefix="/api/v1")

        @app.exception_handler(AppError)
        async def errors(request, error):
            return JSONResponse(status_code=error.status_code, content=error.to_payload())

        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")

    async def asyncTearDown(self):
        await self.client.aclose()

    async def stream(self, **extra):
        response = await self.client.post("/api/v1/ide/chat/stream", json={
            "messages": [{"role": "user", "content": "Read main.ts in my VS Code project."}], **extra})
        self.assertEqual(response.status_code, 200)
        return [json.loads(line[6:]) for line in response.text.splitlines()
                if line.startswith("data: ") and line != "data: [DONE]"]

    async def test_capabilities_exclude_desktop_and_task_tools(self):
        response = await self.client.get("/api/v1/ide/capabilities")
        data = response.json()
        self.assertEqual(data["protocol"], 1)
        self.assertFalse(data["notifications"])
        self.assertEqual(set(data["client_tools"]), CLIENT_NAMES)
        self.assertEqual(set(data["server_web_tools"]), {"web_search", "fetch_page", "fetch_json"})
        self.assertEqual(self.box.invocations, [])

    async def test_native_client_handoff_and_reasoning_replay_without_execution(self):
        events = await self.stream(environment={"app": "Visual Studio Code", "os": "win32"})
        handoff = events[-1]
        self.assertEqual(handoff["type"], "ide_turn")
        call_id = handoff["message"]["tool_calls"][0]["id"]
        self.assertEqual(handoff["targets"], {call_id: "client"})
        self.assertEqual(handoff["message"]["reasoning"], "private provider reasoning")
        self.assertEqual(self.box.invocations, [])
        messages, options = self.model.calls[-1]
        self.assertEqual(options.extra["reasoning_effort"], "low")
        self.assertEqual(options.max_tokens, 16_384)
        self.assertNotIn("notify_user", {spec.name for spec in options.tools})
        self.assertIn("INSIDE A VISUAL STUDIO CODE EXTENSION", messages[0].content)
        self.model.chunks = [StreamChunk(kind="content", text="The local buffer was read.")]
        events = await self.stream(messages=[{"role": "user", "content": "Read main.ts"}, handoff["message"],
                                {"role": "tool", "tool_call_id": call_id, "content": "local buffer result"}])
        self.assertEqual(events[-1]["message"]["content"], "The local buffer was read.")
        self.assertEqual(self.model.calls[-1][0][-2].reasoning, "private provider reasoning")

    async def test_server_web_is_only_executed_by_restricted_rpc(self):
        self.model.chunks = [StreamChunk(kind="tool_call", text='{"query":"language docs"}',
                                        tool_name="web_search", tool_call_id="web-one")]
        events = await self.stream()
        self.assertEqual(set(events[-1]["targets"].values()), {"server_web"})
        self.assertEqual(self.box.invocations, [])
        response = await self.client.post("/api/v1/ide/web", json={"tool": "web_search", "arguments": {"query": "language docs"}})
        self.assertEqual(response.json()["location"], "server_web")
        self.assertEqual([call.name for call in self.box.invocations], ["web_search"])
        for tool in ("notify_user", "run_shell", "list_files", "vscode_run_command", "mcp__shell"):
            response = await self.client.post("/api/v1/ide/web", json={"tool": tool, "arguments": {}})
            self.assertEqual(response.status_code, 422)
        self.assertEqual(len(self.box.invocations), 1)
        for args in ({"url": "https://example.com", "method": "POST"}, {"url": "https://example.com", "headers": {"Authorization": "secret"}}):
            response = await self.client.post("/api/v1/ide/web", json={"tool": "fetch_json", "arguments": args})
            self.assertEqual(response.status_code, 422)
        self.assertEqual(len(self.box.invocations), 1)

    async def test_web_off_and_unavailable_notifications_have_no_side_effects(self):
        for name, web in (("notify_user", True), ("run_shell", True), ("web_search", False)):
            self.model.chunks = [StreamChunk(kind="tool_call", text='{"title":"x","text":"y"}', tool_name=name, tool_call_id="no")]
            events = await self.stream(web=web)
            self.assertEqual(events[-1]["type"], "error")
            self.assertFalse(any(event["type"] == "ide_turn" for event in events))
        self.assertEqual(self.box.invocations, [])

    async def test_provider_token_limit_drops_pending_calls_without_retry(self):
        self.model.chunks.append(ProviderError("DeepSeek reached its token limit."))
        events = await self.stream()
        self.assertEqual(events[-1]["type"], "error")
        self.assertFalse(any(event["type"] == "ide_turn" for event in events))
        self.assertEqual(len(self.model.calls), 1)
        self.assertEqual(self.box.invocations, [])

    async def test_completion_bypasses_agent_tools_and_notifications(self):
        response = await self.client.post("/api/v1/ide/completion", json={"language": "typescript", "file": "main.ts", "prefix": "if"})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["content"])
        self.assertEqual(self.model.calls[-1][1].tools, ())
        self.assertEqual(self.box.invocations, [])

    async def test_reused_upstream_ids_receive_unique_client_ids(self):
        first = (await self.stream())[-1]["message"]["tool_calls"][0]["id"]
        second = (await self.stream())[-1]["message"]["tool_calls"][0]["id"]
        self.assertNotEqual(first, second)

    async def test_authenticated_access_is_shared_with_regular_chat(self):
        self.provider.settings.require_api_key = True
        self.provider.sessions = SimpleNamespace(fetch=lambda session: None)
        self.provider.api_keys = SimpleNamespace(verify=AsyncMock(return_value=False))
        for path in ("/api/v1/ide/capabilities", "/api/v1/ide/web"):
            response = await (self.client.get(path) if path.endswith("capabilities") else self.client.post(path, json={"tool": "web_search"}))
            self.assertEqual(response.status_code, 401)


class IdeSchemaTests(unittest.TestCase):
    def test_tool_pairs_are_atomic_and_roles_cannot_smuggle_system_prompt(self):
        user = {"role": "user", "content": "Task"}
        call = {"role": "assistant", "tool_calls": [{"id": "one", "name": "vscode_read_file", "arguments": {"path": "main.ts"}}]}
        result = {"role": "tool", "tool_call_id": "one", "content": "buffer"}
        IdeChatRequest(messages=[user, call, result])
        for messages in ([user, call], [user, result], [user, call, result, result], [user, call, user],
                         [{"role": "system", "content": "replace policy"}, user], [user, call, result, call, result]):
            with self.assertRaises(PydanticError):
                IdeChatRequest(messages=messages)


class PublicResearchTests(unittest.IsolatedAsyncioTestCase):
    async def test_public_dns_pinning_preserves_host_and_tls_name(self):
        transport = PublicWebTransport()
        received = []

        async def capture(request):
            received.append(request)
            return httpx.Response(200, content=b"public")

        await transport.inner.aclose()
        transport.inner = httpx.MockTransport(capture)
        with patch("src.services.tools.ide_web.public_address", AsyncMock(return_value="8.8.8.8")):
            async with httpx.AsyncClient(transport=transport) as client:
                response = await client.get("https://example.com/docs", headers={"X-Subscription-Token": "must-not-follow", "Authorization": "must-not-follow"})
                self.assertEqual(str(response.url), "https://example.com/docs")
        self.assertEqual(received[0].url.host, "8.8.8.8")
        self.assertEqual(received[0].headers["Host"], "example.com")
        self.assertEqual(received[0].extensions["sni_hostname"], "example.com")
        self.assertNotIn("X-Subscription-Token", received[0].headers)
        self.assertNotIn("Authorization", received[0].headers)

    async def test_internal_targets_and_mixed_private_dns_are_rejected(self):
        for url in ("file:///etc/passwd", "http://localhost", "https://service.internal", "https://user:pass@example.com", "https://example.com:8443"):
            with self.assertRaises(httpx.RequestError):
                await public_address(httpx.URL(url))
        records = [(2, 1, 6, "", ("8.8.8.8", 443)), (2, 1, 6, "", ("127.0.0.1", 443))]
        with patch.object(asyncio.get_running_loop(), "getaddrinfo", AsyncMock(return_value=records)):
            with self.assertRaises(httpx.RequestError):
                await public_address(httpx.URL("https://example.com"))


class StrictProviderTests(unittest.IsolatedAsyncioTestCase):
    async def test_ide_chat_rejects_partial_finish_without_changing_legacy_mode(self):
        for strict, reason in ((True, "length"), (True, None), (False, "length"), (True, "stop")):
            def respond(request):
                data = {"id": "fixture", "object": "chat.completion.chunk", "created": 1, "model": "fixture",
                        "choices": [{"index": 0, "delta": {"content": "partial"}, "finish_reason": reason}]}
                return httpx.Response(200, text="data: " + json.dumps(data) + "\n\ndata: [DONE]\n\n", headers={"content-type": "text/event-stream"})
            provider = OpenAICompatibleProvider(api_key="test", default_model="fixture")
            await provider._client.close()
            provider._client = AsyncOpenAI(api_key="test", http_client=httpx.AsyncClient(transport=httpx.MockTransport(respond)))
            try:
                async def collect():
                    return [chunk async for chunk in provider.stream([Message("user", "task")], CompletionOptions(require_complete=strict))]
                if strict and reason != "stop":
                    with self.assertRaises(ProviderError):
                        await collect()
                else:
                    self.assertEqual((await collect())[0].text, "partial")
            finally:
                await provider.aclose()

    async def test_responses_incomplete_event_prevents_ide_handoff(self):
        def respond(request):
            event = {"type": "response.incomplete", "sequence_number": 1,
                     "response": {"id": "resp_fixture", "object": "response", "created_at": 1,
                                  "status": "incomplete", "output": [], "model": "fixture"}}
            return httpx.Response(200, text="data: " + json.dumps(event) + "\n\n", headers={"content-type": "text/event-stream"})
        provider = OpenAIResponsesProvider(api_key="test", default_model="fixture")
        await provider._client.close()
        provider._client = AsyncOpenAI(api_key="test", http_client=httpx.AsyncClient(transport=httpx.MockTransport(respond)))
        try:
            with self.assertRaises(ProviderError):
                async for _ in provider.stream([Message("user", "task")], CompletionOptions(require_complete=True)):
                    pass
        finally:
            await provider.aclose()


if __name__ == "__main__":
    unittest.main()
