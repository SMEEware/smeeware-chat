from __future__ import annotations

import json
import unittest

import httpx
import openai

from src.core.exceptions import ProviderError, RateLimitedError, UnauthorizedError
from src.services.ai.providers.openai_compatible import _translate_errors


class ProviderErrorTests(unittest.TestCase):
    def status_error(self, status, body, **headers):
        request = httpx.Request('POST', 'https://provider.test/chat/completions', headers={'Authorization': 'Bearer custom-secret-12345678'})
        response = httpx.Response(status, request=request, headers={'x-request-id': 'req-test', **headers})
        cls = {400: openai.BadRequestError, 401: openai.AuthenticationError, 429: openai.RateLimitError}.get(status, openai.APIStatusError)
        return cls('SDK exception text must not be forwarded', response=response, body=body)

    def test_bad_request_keeps_actionable_fields_and_redacts_secrets(self):
        body = {'error': {'message': 'Missing reasoning_content. key=custom-secret-12345678 sk-testsecret0123456789 Bearer other-secret-token https://user:password@example.com',
                          'code': 'invalid_request_error', 'type': 'invalid_request_error', 'param': 'messages[2].reasoning_content'},
                'request_body': 'never forward client source or headers'}
        with self.assertRaises(ProviderError) as caught:
            with _translate_errors('deepseek'):
                raise self.status_error(400, body)
        error = caught.exception
        self.assertIn('Missing reasoning_content', error.message)
        self.assertEqual(error.details['upstream_code'], 'invalid_request_error')
        self.assertEqual(error.details['upstream_param'], 'messages[2].reasoning_content')
        self.assertEqual(error.details['request_id'], 'req-test')
        self.assertFalse(error.details['retryable'])
        public = json.dumps(error.to_payload())
        for secret in ('custom-secret-12345678', 'sk-testsecret0123456789', 'other-secret-token', 'user:password', 'request_body', 'SDK exception'):
            self.assertNotIn(secret, public)

    def test_retry_metadata_only_marks_temporary_provider_errors(self):
        for status in (400, 403, 422, 500, 502, 503, 504):
            with self.assertRaises(ProviderError) as caught:
                with _translate_errors('deepseek'):
                    raise self.status_error(status, {'message': 'Provider message', 'code': 'some_code'})
            self.assertEqual(caught.exception.details['retryable'], status >= 500)
        with self.assertRaises(RateLimitedError) as caught:
            with _translate_errors('deepseek'):
                raise self.status_error(429, {'message': 'Busy'}, **{'retry-after': '2'})
        self.assertTrue(caught.exception.details['retryable'])
        self.assertEqual(caught.exception.details['retry_after'], 2)

    def test_authentication_and_non_json_errors_do_not_expose_raw_response(self):
        for status, exception in ((401, UnauthorizedError), (400, ProviderError)):
            with self.assertRaises(exception) as caught:
                with _translate_errors('deepseek'):
                    raise self.status_error(status, '<html>private raw response</html>')
            self.assertNotIn('private raw response', json.dumps(caught.exception.to_payload()))

    def test_error_messages_are_bounded(self):
        with self.assertRaises(ProviderError) as caught:
            with _translate_errors('deepseek'):
                raise self.status_error(400, {'message': 'x' * 10000})
        self.assertLess(len(caught.exception.message), 1100)


if __name__ == '__main__':
    unittest.main()
