from __future__ import annotations

import json
import unittest
from unittest.mock import patch

import httpx
from openai import AsyncOpenAI

from src.core.exceptions import ProviderError
from src.schemas.chat import ChatRequest
from src.services.ai.base import CompletionOptions, Message
from src.services.ai.agent import Agent
from src.services.ai.providers.deepseek import DeepSeekProvider
from src.services.tools.base import ToolSpec


class DeepSeekTests(unittest.IsolatedAsyncioTestCase):
    async def request(self, *, stream=False, finish='stop', options=None, messages=None, tool_turn=False):
        captured = []

        def respond(request):
            captured.append(json.loads(request.content))
            tool_call = {'id': 'call_test', 'type': 'function',
                         'function': {'name': 'test_tool', 'arguments': '{}'}}
            first_tool_round = tool_turn and len(captured) == 1
            if stream:
                chunks = [
                    {'delta': {'reasoning_content': 'thinking'}, 'finish_reason': None},
                    {'delta': {'content': 'answer' if finish == 'stop' else ''}, 'finish_reason': finish},
                ]
                if first_tool_round:
                    chunks[-1] = {'delta': {'tool_calls': [{'index': 0, **tool_call}]},
                                  'finish_reason': 'tool_calls'}
                data = ''.join('data: ' + json.dumps({
                    'id': 'test', 'object': 'chat.completion.chunk', 'created': 1,
                    'model': 'deepseek-v4-flash', 'choices': [{'index': 0, **chunk}],
                }) + '\n\n' for chunk in chunks) + 'data: [DONE]\n\n'
                return httpx.Response(200, text=data, headers={'content-type': 'text/event-stream'})
            return httpx.Response(200, json={
                'id': 'test', 'object': 'chat.completion', 'created': 1,
                'model': 'deepseek-v4-flash', 'choices': [{'index': 0,
                    'message': {'role': 'assistant', 'content': '' if first_tool_round else 'answer',
                                'reasoning_content': 'thinking',
                                'tool_calls': [tool_call] if first_tool_round else []},
                    'finish_reason': 'tool_calls' if first_tool_round else finish}],
            })

        client = AsyncOpenAI(api_key='test', base_url='https://deepseek.test',
                             http_client=httpx.AsyncClient(transport=httpx.MockTransport(respond)))
        with patch('src.services.ai.providers.openai_compatible.AsyncOpenAI', return_value=client):
            provider = DeepSeekProvider(api_key='test', default_model='deepseek-v4-flash')
        try:
            runner = Agent(provider) if tool_turn else provider
            if stream:
                result = [chunk async for chunk in runner.stream(messages or [Message('user', 'hello')], options)]
            else:
                result = await runner.complete(messages or [Message('user', 'hello')], options)
            return captured[-1], result
        finally:
            await provider.aclose()

    async def test_max_thinking_and_budget_reach_upstream_for_both_modes(self):
        for stream in (False, True):
            payload, result = await self.request(stream=stream)
            self.assertEqual(payload['reasoning_effort'], 'max')
            self.assertEqual(payload['thinking'], {'type': 'enabled'})
            self.assertEqual(payload['max_tokens'], 393216)
            if stream:
                self.assertEqual([chunk.text for chunk in result], ['thinking', 'answer'])
            else:
                self.assertEqual(result.content, 'answer')

    async def test_explicit_budget_is_preserved(self):
        payload, _ = await self.request(options=CompletionOptions(max_tokens=1234))
        self.assertEqual(payload['max_tokens'], 1234)

    async def test_selected_effort_reaches_upstream_in_both_modes(self):
        for stream in (False, True):
            for effort in ('low', 'high', 'max'):
                payload, _ = await self.request(stream=stream, options=CompletionOptions(
                    max_tokens=1234, extra={'reasoning_effort': effort},
                ))
                self.assertEqual(payload['reasoning_effort'], effort)
                self.assertEqual(payload['max_tokens'], 1234)

    async def test_reasoning_is_forwarded_for_tool_continuations(self):
        payload, _ = await self.request(messages=[Message('assistant', '', reasoning='tool planning')])
        self.assertEqual(payload['messages'][0]['reasoning_content'], 'tool planning')

    async def test_agent_preserves_thinking_across_actual_tool_rounds(self):
        for stream in (False, True):
            payload, _ = await self.request(stream=stream, tool_turn=True,
                options=CompletionOptions(tools=(ToolSpec('test_tool', 'Test tool'),)))
            assistant = next(message for message in payload['messages'] if message['role'] == 'assistant')
            self.assertEqual(assistant['reasoning_content'], 'thinking')
            self.assertEqual(assistant['tool_calls'][0]['id'], 'call_test')
            self.assertEqual(payload['messages'][-1]['role'], 'tool')

    async def test_aborted_or_exhausted_reasoning_is_an_error(self):
        for stream in (False, True):
            for reason in ('length', 'aborted', 'insufficient_system_resource', 'content_filter'):
                with self.subTest(stream=stream, reason=reason):
                    with self.assertRaises(ProviderError) as caught:
                        await self.request(stream=stream, finish=reason)
                    self.assertEqual(caught.exception.details['finish_reason'], reason)

    def test_api_accepts_deepseek_maximum(self):
        request = ChatRequest(messages=[{'role': 'user', 'content': 'hello'}], max_tokens=393216)
        self.assertEqual(request.to_options().max_tokens, 393216)
