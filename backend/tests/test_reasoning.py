from __future__ import annotations

import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import httpx
from openai import AsyncOpenAI
from pydantic import ValidationError

from src.api.v1.routes.chat import _resolve_agent
from src.api.v1.routes.models import list_models
from src.core.config import LLMSettings, OllamaSettings, Settings
from src.core.container import ServiceProvider
from src.schemas.chat import ChatRequest
from src.services.ai.agent import Agent
from src.services.ai.base import CompletionOptions, Message
from src.services.ai.catalog import CATALOG, available, local_models, resolve
from src.services.ai.providers.deepseek import DeepSeekProvider
from src.services.ai.providers.ollama import OllamaProvider
from src.services.ai.providers.openai_responses import OpenAIResponsesProvider
from src.services.tools.base import ToolSpec


class ReasoningCatalogTests(unittest.TestCase):
    def test_capabilities_are_ordered_per_model_and_defaults_are_supported(self):
        entries = {entry.id: entry for entry in CATALOG}
        for model in ('gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'):
            self.assertEqual(entries[model].reasoning_efforts,
                             ('none', 'low', 'medium', 'high', 'xhigh', 'max'))
        for model in ('deepseek-v4-flash', 'deepseek-v4-pro'):
            self.assertEqual(entries[model].reasoning_efforts, ('low', 'high', 'max'))
            self.assertEqual(entries[model].reasoning_effort, 'max')
        for entry in CATALOG:
            if entry.reasoning_efforts:
                self.assertIn(entry.reasoning_effort, entry.reasoning_efforts)

    def test_request_accepts_and_bounds_effort(self):
        request = ChatRequest(messages=[{'role': 'user', 'content': 'hello'}], reasoning_effort='max')
        self.assertEqual(request.reasoning_effort, 'max')
        with self.assertRaises(ValidationError):
            ChatRequest(messages=[{'role': 'user', 'content': 'hello'}], reasoning_effort='x' * 33)

    def test_local_model_cannot_shadow_a_builtin_id(self):
        for tag in ('deepseek-v4-flash:latest', 'deepseek-v4-flash'):
            local = local_models(OllamaSettings(enabled=True, model=tag))
            self.assertEqual(local[0].id, 'local-deepseek-v4-flash')
            entries = available(openai=True, local=local)
            self.assertEqual(len({entry.id for entry in entries}), len(entries))
            self.assertEqual(resolve('deepseek-v4-flash', local=local).runtime, 'hosted')
            self.assertEqual(resolve(local[0].id, local=local).upstream, tag)
            if ':' in tag:
                self.assertEqual(resolve(tag, local=local).runtime, 'local')


class ReasoningResolutionTests(unittest.IsolatedAsyncioTestCase):
    async def test_selected_model_validates_effort_and_preserves_explicit_budget(self):
        provider = SimpleNamespace(
            local_models=(), tool_state=AsyncMock(return_value=(frozenset(), '')),
            agent_for=lambda *args, **kwargs: SimpleNamespace(provider_name='deepseek'),
        )
        for requested, expected in [('low', 'low'), ('max', 'max'), ('xhigh', 'max'), (None, 'max')]:
            _, options = await _resolve_agent(provider, ChatRequest(
                model='deepseek-v4-pro', messages=[{'role': 'user', 'content': 'hi'}],
                reasoning_effort=requested, max_tokens=123,
            ))
            self.assertEqual(options.extra['reasoning_effort'], expected)
            self.assertEqual(options.max_tokens, 123)

    async def test_model_list_exposes_the_same_capabilities_used_for_requests(self):
        provider = ServiceProvider(Settings(llm=LLMSettings(api_key='test')))
        provider.override(openai=object())
        provider.local_models_visible = AsyncMock(return_value=())
        models = await list_models(provider)
        flash = next(model for model in models.models if model.id == 'deepseek-v4-flash')
        self.assertEqual(flash.reasoning_efforts, ['low', 'high', 'max'])
        self.assertEqual(flash.reasoning_effort, 'max')
        await provider.aclose()


class ProviderReasoningTests(unittest.IsolatedAsyncioTestCase):
    async def test_ollama_preserves_assistant_reasoning_across_tool_rounds(self):
        for stream in (False, True):
            captured = []

            def respond(request):
                if request.url.path == '/api/show':
                    return httpx.Response(200, json={'thinking': {
                        'values': ['low', 'high'], 'default': 'low',
                    }})
                captured.append(json.loads(request.content))
                first = len(captured) == 1
                tool = {'id': 'call_test', 'type': 'function',
                        'function': {'name': 'test_tool', 'arguments': '{}'}}
                if stream:
                    chunks = [{'delta': {'reasoning': 'tool planning'}, 'finish_reason': None}]
                    chunks.append({'delta': {'tool_calls': [{'index': 0, **tool}]},
                                   'finish_reason': 'tool_calls'} if first else {
                                       'delta': {'content': 'answer'}, 'finish_reason': 'stop'})
                    data = ''.join('data: ' + json.dumps({
                        'id': 'test', 'object': 'chat.completion.chunk', 'created': 1,
                        'model': 'custom', 'choices': [{'index': 0, **chunk}],
                    }) + '\n\n' for chunk in chunks) + 'data: [DONE]\n\n'
                    return httpx.Response(200, text=data, headers={'content-type': 'text/event-stream'})
                return httpx.Response(200, json={
                    'id': 'test', 'object': 'chat.completion', 'created': 1,
                    'model': 'custom', 'choices': [{'index': 0, 'message': {
                        'role': 'assistant', 'content': '' if first else 'answer',
                        'reasoning': 'tool planning', 'tool_calls': [tool] if first else [],
                    }, 'finish_reason': 'tool_calls' if first else 'stop'}],
                })

            native = httpx.AsyncClient(transport=httpx.MockTransport(respond))
            client = AsyncOpenAI(api_key='test', base_url='https://ollama.test/v1',
                http_client=httpx.AsyncClient(transport=httpx.MockTransport(respond)))
            with patch('src.services.ai.providers.openai_compatible.AsyncOpenAI', return_value=client):
                provider = OllamaProvider(api_key='test', default_model='custom')
            try:
                with patch('src.services.ai.providers.ollama.httpx.AsyncClient', return_value=native):
                    await provider.reasoning_options('custom')
                agent = Agent(provider)
                options = CompletionOptions(tools=(ToolSpec('test_tool', 'Test tool'),),
                                            extra={'reasoning_effort': 'high'})
                if stream:
                    _ = [chunk async for chunk in agent.stream([Message('user', 'hi')], options)]
                else:
                    await agent.complete([Message('user', 'hi')], options)
                self.assertEqual(len(captured), 2)
                assistant = next(message for message in captured[-1]['messages']
                                 if message['role'] == 'assistant')
                self.assertEqual(assistant['reasoning'], 'tool planning')
                self.assertEqual(assistant['tool_calls'][0]['id'], 'call_test')
                self.assertEqual(captured[-1]['reasoning_effort'], 'high')
                self.assertEqual(captured[-1]['messages'][-1]['role'], 'tool')
            finally:
                await provider.aclose()

    async def test_openai_uses_model_specific_efforts_and_omits_unknown_models(self):
        provider = OpenAIResponsesProvider(api_key='test', default_model='gpt-5.6-terra')
        try:
            for model, requested, expected in [
                ('gpt-5.6-sol', 'max', 'max'),
                ('gpt-5.6-luna', 'minimal', 'low'),
                ('gpt-5.6-terra', 'ultra', 'medium'),
                ('unverified-custom', 'high', None),
            ]:
                payload = provider._payload([Message('user', 'hi')], CompletionOptions(
                    model=model, extra={'reasoning_effort': requested},
                ))
                self.assertNotIn('reasoning_effort', payload)
                if expected is None:
                    self.assertNotIn('reasoning', payload)
                else:
                    self.assertEqual(payload['reasoning']['effort'], expected)
        finally:
            await provider.aclose()

    async def test_deepseek_respects_levels_and_does_not_force_thinking_on_unknown_models(self):
        provider = DeepSeekProvider(api_key='test', default_model='deepseek-v4-flash')
        try:
            for model, requested, expected in [
                ('deepseek-v4-flash', 'low', 'low'),
                ('deepseek-v4-pro', 'high', 'high'),
                ('deepseek-v4-pro', 'medium', 'max'),
                ('custom-unknown', 'max', None),
            ]:
                payload = provider._payload([Message('user', 'hi')], CompletionOptions(
                    model=model, max_tokens=123, extra={'reasoning_effort': requested},
                ))
                self.assertEqual(payload['max_tokens'], 123)
                if expected is None:
                    self.assertNotIn('reasoning_effort', payload)
                    self.assertNotIn('thinking', payload.get('extra_body', {}))
                else:
                    self.assertEqual(payload['reasoning_effort'], expected)
                    self.assertEqual(payload['extra_body']['thinking'], {'type': 'enabled'})
        finally:
            await provider.aclose()

    async def test_ollama_uses_discovered_metadata_and_actual_openai_wire(self):
        requests = []

        def respond(request):
            body = json.loads(request.content)
            requests.append((request.url.path, body))
            if request.url.path == '/api/show':
                return httpx.Response(200, json={'thinking': {
                    'values': ['low', 'medium', 'high'], 'default': 'medium',
                }})
            return httpx.Response(200, json={
                'id': 'test', 'object': 'chat.completion', 'created': 1,
                'model': 'custom:latest', 'choices': [{'index': 0,
                    'message': {'role': 'assistant', 'content': 'answer'}, 'finish_reason': 'stop'}],
            })

        client = httpx.AsyncClient(transport=httpx.MockTransport(respond))
        wire_client = httpx.AsyncClient(transport=httpx.MockTransport(respond))
        provider = OllamaProvider(api_key='test', default_model='custom:latest', base_url='https://ollama.test/v1')
        await provider._client.close()
        provider._client = AsyncOpenAI(api_key='test', base_url='https://ollama.test/v1', http_client=wire_client)
        try:
            with patch('src.services.ai.providers.ollama.httpx.AsyncClient', return_value=client):
                levels, default = await provider.reasoning_options('custom:latest')
            self.assertEqual(levels, ('low', 'medium', 'high'))
            self.assertEqual(default, 'medium')
            await provider.complete([Message('user', 'hi')], CompletionOptions(
                model='custom:latest', extra={'reasoning_effort': 'high'},
            ))
            self.assertEqual(requests[-1][1]['reasoning_effort'], 'high')
            payload = provider._payload([Message('user', 'hi')], CompletionOptions(
                model='unknown:latest', extra={'reasoning_effort': 'high'},
            ))
            self.assertNotIn('reasoning_effort', payload)
        finally:
            await provider.aclose()

    async def test_ollama_unknown_and_boolean_capabilities_are_safe(self):
        for metadata, expected in [
            ({}, ((), None)),
            ({'thinking': {'values': [False], 'default': False}}, ((), None)),
            ({'thinking': {'values': [False, True], 'default': True}}, (('none', 'high'), 'high')),
            ({'thinking': {'values': ['low', 'high'], 'default': 'bogus'}}, ((), None)),
            ({'thinking': {'values': ['high', 'low'], 'default': 'high'}}, (('low', 'high'), 'high')),
            ({'thinking': {'values': ['low', ' high'], 'default': 'low'}}, ((), None)),
            ({'thinking': {'values': ['brief', 'deep'], 'default': 'brief'}}, (('brief', 'deep'), 'brief')),
            ({'thinking': {'values': [False, 'low', 'high'], 'default': False}}, (('none', 'low', 'high'), 'none')),
        ]:
            client = httpx.AsyncClient(transport=httpx.MockTransport(lambda req: httpx.Response(200, json=metadata)))
            provider = OllamaProvider(api_key='test', default_model='custom')
            try:
                with patch('src.services.ai.providers.ollama.httpx.AsyncClient', return_value=client):
                    self.assertEqual(await provider.reasoning_options('custom'), expected)
            finally:
                await provider.aclose()

    async def test_local_listing_and_request_resolution_share_discovered_capabilities(self):
        settings = Settings(llm=LLMSettings(api_key='test'), ollama=OllamaSettings(enabled=True, model='custom:latest'))
        provider = ServiceProvider(settings)
        local = OllamaProvider(api_key='test', default_model='custom:latest')
        provider.override(ollama=local)
        provider._ollama_reachable = AsyncMock(return_value=True)
        local.reasoning_options = AsyncMock(return_value=(('low', 'high'), 'low'))
        provider.tool_state = AsyncMock(return_value=(frozenset(), ''))
        provider.agent_for = lambda *args, **kwargs: SimpleNamespace(provider_name='ollama')
        try:
            listed = await provider.local_models_visible()
            self.assertEqual(listed[0].reasoning_efforts, ('low', 'high'))
            _, options = await _resolve_agent(provider, ChatRequest(
                model=listed[0].id, messages=[{'role': 'user', 'content': 'hi'}], reasoning_effort='high',
            ))
            self.assertEqual(options.extra['reasoning_effort'], 'high')
        finally:
            await provider.aclose()

    async def test_ollama_metadata_errors_are_cached_without_changing_payload(self):
        calls = []
        def respond(request):
            calls.append(request.url.path)
            return httpx.Response(404)
        client = httpx.AsyncClient(transport=httpx.MockTransport(respond))
        provider = OllamaProvider(api_key='test', default_model='custom')
        try:
            with patch('src.services.ai.providers.ollama.httpx.AsyncClient', return_value=client):
                self.assertEqual(await provider.reasoning_options('custom'), ((), None))
                self.assertEqual(await provider.reasoning_options('custom'), ((), None))
            self.assertEqual(calls, ['/api/show'])
            payload = provider._payload([Message('user', 'hi')], CompletionOptions(
                extra={'reasoning_effort': 'max'},
            ))
            self.assertNotIn('reasoning_effort', payload)
        finally:
            await provider.aclose()

    async def test_hosted_ollama_uses_actual_capabilities_for_listing_and_requests(self):
        provider = ServiceProvider(Settings(llm=LLMSettings(provider='ollama', api_key='test')))
        hosted = OllamaProvider(api_key='test', default_model='deepseek-v4-flash')
        provider.override(llm=hosted)
        hosted.reasoning_options = AsyncMock(return_value=(('none', 'high'), 'none'))
        provider.tool_state = AsyncMock(return_value=(frozenset(), ''))
        provider.agent_for = lambda *args, **kwargs: SimpleNamespace(provider_name='ollama')
        try:
            models = await list_models(provider)
            flash = next(model for model in models.models if model.id == 'deepseek-v4-flash')
            self.assertEqual(flash.reasoning_efforts, ['none', 'high'])
            self.assertEqual(flash.reasoning_effort, 'none')
            _, options = await _resolve_agent(provider, ChatRequest(
                model=flash.id, messages=[{'role': 'user', 'content': 'hi'}], reasoning_effort='high',
            ))
            self.assertEqual(options.extra['reasoning_effort'], 'high')
            hosted.reasoning_options.assert_any_await('deepseek-v4-flash')
        finally:
            await provider.aclose()
