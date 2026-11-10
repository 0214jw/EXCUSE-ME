"""All provider responses in this file are mocks; no real keys or network calls."""
from io import BytesIO
import json
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
from urllib.error import HTTPError, URLError
from uuid import uuid4

from fastapi import HTTPException
from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import curator

DRAFT = {'titles': ['중력과의 협상', '기상 유예의 미학', '이불 속 작은 전시'],
         'description_sentences': ['이 작품은 아침의 기상을 둘러싼 작은 사정을 조명합니다.', '이불의 무게는 의지와 현실 사이의 거리를 은은하게 드러냅니다.']}


class CuratorTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {'GEMINI_API_KEY': 'test-only-not-a-real-key',
                                         'GEMINI_CURATOR_MODEL': curator.DEFAULT_MODEL,
                                         'GEMINI_CURATOR_TIMEOUT_SECONDS': '20'})
        self.env.start()
        self.gate = patch.object(curator, 'gate', curator.CuratorGate())
        self.gate.start()
        self.data = curator.CuratorInput(title='', content='이불의 중력이 강해서 일어나지 못했습니다.',
                                         category='지각·조퇴', visitor_id=uuid4(), request_id=uuid4())

    def tearDown(self):
        self.gate.stop()
        self.env.stop()

    @staticmethod
    def response(draft=None, finish='STOP', **changes):
        return BytesIO(json.dumps({'candidates': [{'finishReason': finish, 'content': {'role': 'model', 'parts': [
            {'text': json.dumps(draft if draft is not None else DRAFT, ensure_ascii=False)}]}}], **changes}).encode())

    def test_one_structured_request_returns_three_titles_and_one_description(self):
        with patch.object(curator, 'urlopen', return_value=self.response()) as transport:
            result = curator.generate_curator(self.data, '127.0.0.1')
        self.assertEqual(result.titles, DRAFT['titles'])
        self.assertEqual(result.refined_description, ' '.join(DRAFT['description_sentences']))
        transport.assert_called_once()
        request = transport.call_args.args[0]
        self.assertEqual(request.full_url, curator.GEMINI_URL.format(model=curator.DEFAULT_MODEL))
        self.assertEqual(request.get_method(), 'POST')
        self.assertEqual(request.get_header('X-goog-api-key'), 'test-only-not-a-real-key')
        self.assertIsNone(request.get_header('Authorization'))
        self.assertEqual(transport.call_args.kwargs['timeout'], 20)
        payload = json.loads(request.data)
        config = payload['generationConfig']
        self.assertEqual(config['candidateCount'], 1)
        self.assertEqual(config['thinkingConfig']['thinkingLevel'], 'MINIMAL')
        self.assertEqual(config['maxOutputTokens'], 1000)
        self.assertEqual(config['responseModalities'], ['TEXT'])
        self.assertEqual(config['responseFormat']['text'], {'mimeType': 'APPLICATION_JSON', 'schema': curator.OUTPUT_SCHEMA})
        self.assertEqual(payload['systemInstruction']['parts'][0]['text'], curator.PROMPT)
        self.assertEqual(set(payload), {'systemInstruction', 'contents', 'generationConfig'})
        user_data = json.loads(payload['contents'][0]['parts'][0]['text'])
        self.assertEqual(user_data['original_excuse'], self.data.content)
        self.assertNotIn('visitor_id', user_data)
        self.assertNotIn('request_id', user_data)
        self.assertNotIn('test-only-not-a-real-key', request.data.decode())
        self.assertNotIn('test-only-not-a-real-key', request.full_url)
        self.assertEqual(set(result.model_dump()), {'titles', 'refined_description'})

    def test_result_shape_length_diversity_and_korean_sentences_are_validated(self):
        for changes in [
            {'titles': ['제목 하나']}, {'titles': ['같은 제목'] * 3},
            {'titles': ['', '다른 제목', '또 다른 작품']},
            {'titles': ['English', 'Another title', 'Third work']},
            {'titles': ['같은 제목', '같은제목', '다른 작품']},
            {'titles': ['가', '다른 제목', '또 다른 작품']}, {'titles': ['가' * 51, '다른 제목', '또 다른 작품']},
            {'description_sentences': ['한 문장입니다.']}, {'description_sentences': ['문장입니다.'] * 5},
            {'description_sentences': ['문장이 아닙니다', '또 다른 문장입니다.']},
            {'description_sentences': ['English sentence.', 'Another sentence.']}, {'unexpected': True},
        ]:
            with self.subTest(keys=list(changes)):
                with self.assertRaises(ValidationError):
                    curator.CuratorDraft.model_validate({**DRAFT, **changes})

    def test_refusal_incomplete_and_malformed_responses_never_become_fake_results(self):
        for response, reason in [(self.response(finish='MAX_TOKENS'), 'incomplete_response'), (BytesIO(b'bad JSON'), 'invalid_response'),
                         (self.response(finish='SAFETY'), 'response_refused'),
                         (self.response(draft={**DRAFT, 'titles': ['동일 제목'] * 3}), 'invalid_response')]:
            data = self.data.model_copy(update={'request_id': uuid4()})
            with patch.object(curator, 'urlopen', return_value=response) as transport:
                with self.assertRaises(HTTPException) as error:
                    curator.generate_curator(data, '127.0.0.1')
                self.assertEqual(error.exception.status_code, 502)
                self.assertEqual(error.exception.detail, {'code': 'curator_' + reason})
                transport.assert_called_once()

    def test_missing_key_never_calls_provider(self):
        with patch.dict(os.environ, {'GEMINI_API_KEY': '', 'OPENAI_API_KEY': 'test-only-openai-key'}), patch.object(curator, 'urlopen') as transport:
            with self.assertRaises(HTTPException) as error:
                curator.generate_curator(self.data, '127.0.0.1')
            self.assertEqual(error.exception.status_code, 503)
            self.assertEqual(error.exception.detail, {'code': 'curator_not_configured'})
            transport.assert_not_called()

    def test_failures_timeout_are_sanitized_without_retries_and_release_inflight(self):
        for exception, expected in [(TimeoutError('private provider detail'), 504),
                                    (URLError(TimeoutError('private detail')), 504),
                                    (URLError('private detail'), 503),
                                    (HTTPError(curator.GEMINI_URL, 401, 'private detail', {}, BytesIO(b'private')), 503)]:
            data = self.data.model_copy(update={'request_id': uuid4()})
            with patch.object(curator, 'urlopen', side_effect=exception) as transport:
                with self.assertRaises(HTTPException) as error:
                    curator.generate_curator(data, '127.0.0.1')
                self.assertEqual(error.exception.status_code, expected)
                self.assertNotIn('private', json.dumps(error.exception.detail))
                self.assertNotIn('test-only-not-a-real-key', json.dumps(error.exception.detail))
                self.assertFalse(curator.gate.active)
                transport.assert_called_once()

    def test_provider_auth_permission_model_quota_and_outage_have_safe_distinct_codes(self):
        cases = [(400, {}, 'request_rejected'), (401, {}, 'authentication_failed'),
                 (400, {'details': [{'@type': 'type.googleapis.com/google.rpc.ErrorInfo', 'reason': 'API_KEY_INVALID'}]}, 'authentication_failed'),
                 (400, {'details': [{'@type': 'type.googleapis.com/google.rpc.ErrorInfo', 'reason': 'API_KEY_EXPIRED'}]}, 'authentication_failed'),
                 (403, {}, 'access_denied'), (404, {}, 'model_unavailable'),
                 (402, {'status': 'FAILED_PRECONDITION'}, 'quota_exceeded'),
                 (429, {'status': 'RESOURCE_EXHAUSTED'}, 'provider_rate_limited'),
                 (500, {}, 'provider_unavailable'), (503, {}, 'provider_unavailable')]
        for status, metadata, reason in cases:
            with self.subTest(status=status, reason=reason):
                body = BytesIO(json.dumps({'error': {**metadata, 'message': 'private provider body with test-only-not-a-real-key'}}).encode())
                failure = HTTPError(curator.GEMINI_URL, status, 'private detail', {}, body)
                with patch.object(curator, 'gate', curator.CuratorGate()), patch.object(curator, 'urlopen', side_effect=failure) as transport:
                    with self.assertRaises(HTTPException) as caught:
                        curator.generate_curator(self.data, '127.0.0.1')
                    self.assertEqual(caught.exception.status_code, 503)
                    self.assertEqual(caught.exception.detail, {'code': 'curator_' + reason})
                    self.assertNotIn('private', json.dumps(caught.exception.detail))
                    self.assertTrue(body.closed)
                    transport.assert_called_once()
                    self.assertFalse(curator.gate.active)

    def test_unreadable_or_oversized_errors_do_not_escape_sanitization(self):
        for raw in [b'not JSON private body', b'x' * 9000, b'[]']:
            failure = HTTPError(curator.GEMINI_URL, 400, 'private detail', {}, BytesIO(raw))
            data = self.data.model_copy(update={'request_id': uuid4()})
            with patch.object(curator, 'urlopen', side_effect=failure) as transport:
                with self.assertRaises(HTTPException) as caught:
                    curator.generate_curator(data, '127.0.0.1')
                self.assertEqual(caught.exception.detail, {'code': 'curator_request_rejected'})
                transport.assert_called_once()

    def test_short_valid_excuse_and_image_off_do_not_disable_text_curator(self):
        data = self.data.model_copy(update={'content': '공룡이 갑자기 저희 집을 덮쳤어요!', 'category': '휴가·병가'})
        with patch.dict(os.environ, {'OPENAI_IMAGE_ENABLED': '0', 'OPENAI_API_KEY': '',
                                     'OPENAI_IMAGE_DAILY_LIMIT': '1', 'OPENAI_IMAGE_TOTAL_LIMIT': '1',
                                     'OPENAI_IMAGE_BUDGET_CENTS': '10'}), patch.object(curator, 'urlopen', return_value=self.response()) as transport:
            result = curator.generate_curator(data, '127.0.0.1')
        self.assertEqual(len(result.titles), 3)
        sent = json.loads(json.loads(transport.call_args.args[0].data)['contents'][0]['parts'][0]['text'])
        self.assertEqual(sent['original_excuse'], data.content)
        self.assertEqual(sent['category'], '휴가·병가')
        transport.assert_called_once()

    def test_default_settings_and_timeout_bounds_are_used_without_openai_fallback(self):
        for configured, expected in [(None, 20), ('60', 25), ('1', 5)]:
            with self.subTest(timeout=configured), patch.dict(os.environ):
                os.environ.pop('GEMINI_CURATOR_MODEL', None)
                os.environ.pop('GEMINI_CURATOR_TIMEOUT_SECONDS', None)
                os.environ['OPENAI_CURATOR_MODEL'] = 'must-not-be-used'
                os.environ['OPENAI_CURATOR_TIMEOUT_SECONDS'] = 'must-not-be-used'
                if configured is not None:
                    os.environ['GEMINI_CURATOR_TIMEOUT_SECONDS'] = configured
                with patch.object(curator, 'gate', curator.CuratorGate()), patch.object(curator, 'urlopen', return_value=self.response()) as transport:
                    curator.generate_curator(self.data, '127.0.0.1')
                    self.assertEqual(transport.call_args.kwargs['timeout'], expected)
                    self.assertEqual(transport.call_args.args[0].full_url, curator.GEMINI_URL.format(model=curator.DEFAULT_MODEL))
                    transport.assert_called_once()

    def test_invalid_model_or_timeout_settings_never_make_a_request(self):
        for setting in [{'GEMINI_CURATOR_MODEL': '../other?key=private'},
                        {'GEMINI_CURATOR_MODEL': 'gpt-other-provider'},
                        {'GEMINI_CURATOR_TIMEOUT_SECONDS': 'not-a-number'}]:
            with self.subTest(setting=setting), patch.dict(os.environ, setting), patch.object(curator, 'urlopen') as transport:
                with self.assertRaises(HTTPException) as caught:
                    curator.generate_curator(self.data, '127.0.0.1')
                self.assertEqual(caught.exception.detail, {'code': 'curator_invalid_configuration'})
                transport.assert_not_called()

    def test_blocked_prompts_partial_or_wrong_envelopes_are_not_used_or_retried(self):
        cases = [
            ({'promptFeedback': {'blockReason': 'SAFETY'}}, 'response_refused'),
            ({'candidates': [{'finishReason': 'CONTINUATION'}]}, 'incomplete_response'),
            ([], 'invalid_response'), ({}, 'invalid_response'),
            ({'candidates': []}, 'invalid_response'),
            ({'candidates': [None]}, 'invalid_response'),
            ({'candidates': [{}, {}]}, 'invalid_response'),
            ({'promptFeedback': [], 'candidates': []}, 'invalid_response'),
            ({'candidates': [{'content': {'parts': [{'text': '{}'}]}}]}, 'invalid_response'),
            ({'candidates': [{'finishReason': 'STOP', 'content': None}]}, 'invalid_response'),
            ({'candidates': [{'finishReason': 'STOP', 'content': {'parts': []}}]}, 'invalid_response'),
            ({'candidates': [{'finishReason': 'STOP', 'content': {'parts': [None]}}]}, 'invalid_response'),
            ({'candidates': [{'finishReason': 'STOP', 'content': {'parts': [{'text': 123}]}}]}, 'invalid_response'),
            ({'candidates': [{'finishReason': 'STOP', 'content': {'parts': [{'functionCall': {}}]}}]}, 'invalid_response'),
            ({'candidates': [{'finishReason': 'STOP', 'content': {'parts': [{'text': '{'}]}}]}, 'invalid_response'),
        ]
        for payload, reason in cases:
            with self.subTest(payload=payload), patch.object(curator, 'gate', curator.CuratorGate()), patch.object(curator, 'urlopen', return_value=BytesIO(json.dumps(payload).encode())) as transport:
                with self.assertRaises(HTTPException) as caught:
                    curator.generate_curator(self.data, '127.0.0.1')
                self.assertEqual(caught.exception.status_code, 502)
                self.assertEqual(caught.exception.detail, {'code': 'curator_' + reason})
                self.assertFalse(curator.gate.active)
                transport.assert_called_once()

    def test_thought_parts_are_not_exposed_and_only_final_text_is_validated(self):
        payload = {'candidates': [{'finishReason': 'STOP', 'content': {'parts': [
            {'thought': True, 'text': 'private internal reasoning'},
            {'text': json.dumps(DRAFT, ensure_ascii=False)}]}}]}
        with patch.object(curator, 'urlopen', return_value=BytesIO(json.dumps(payload).encode())) as transport:
            result = curator.generate_curator(self.data, '127.0.0.1')
        self.assertEqual(result.titles, DRAFT['titles'])
        self.assertNotIn('private', result.model_dump_json())
        transport.assert_called_once()

    def test_oversized_success_and_upstream_timeout_are_safe_without_retries(self):
        with patch.object(curator, 'urlopen', return_value=BytesIO(b'x' * 131073)) as transport:
            with self.assertRaises(HTTPException) as caught:
                curator.generate_curator(self.data, '127.0.0.1')
            self.assertEqual(caught.exception.detail, {'code': 'curator_invalid_response'})
            transport.assert_called_once()
        for status in (408, 504):
            failure = HTTPError(curator.GEMINI_URL, status, 'private', {}, BytesIO(b'private'))
            with patch.object(curator, 'gate', curator.CuratorGate()), patch.object(curator, 'urlopen', side_effect=failure) as transport:
                with self.assertRaises(HTTPException) as caught:
                    curator.generate_curator(self.data, '127.0.0.1')
                self.assertEqual(caught.exception.status_code, 504)
                self.assertEqual(caught.exception.detail, {'code': 'curator_timeout'})
                transport.assert_called_once()

    def test_repeated_request_id_does_not_trigger_second_paid_call(self):
        with patch.object(curator, 'urlopen', return_value=self.response()) as transport:
            curator.generate_curator(self.data, '127.0.0.1')
            with self.assertRaises(HTTPException) as error:
                curator.generate_curator(self.data, '127.0.0.1')
            self.assertEqual(error.exception.status_code, 409)
            transport.assert_called_once()

    def test_rate_limits_inflight_and_expiration(self):
        now = [0.]
        gate = curator.CuratorGate(clock=lambda: now[0])
        with gate.acquire('ip', 'visitor', 'one'):
            with self.assertRaises(HTTPException) as error:
                with gate.acquire('ip', 'visitor', 'two'):
                    self.fail('Duplicate in-flight call was accepted')
            self.assertEqual(error.exception.status_code, 409)
        for index in range(4):
            with gate.acquire('ip', 'visitor', str(index)):
                pass
        with self.assertRaises(HTTPException) as error:
            with gate.acquire('ip', 'visitor', 'limit'):
                pass
        self.assertEqual(error.exception.status_code, 429)
        now[0] = 601
        with gate.acquire('ip', 'visitor', 'one'):
            pass

    def test_ip_process_and_parallel_limits_cannot_be_bypassed_by_new_demo_ids(self):
        gate = curator.CuratorGate()
        for index in range(10):
            with gate.acquire('same-ip', str(index), str(index)):
                pass
        with self.assertRaises(HTTPException) as error:
            with gate.acquire('same-ip', 'new-visitor', 'next'):
                pass
        self.assertEqual(error.exception.status_code, 429)
        gate = curator.CuratorGate()
        for index in range(30):
            with gate.acquire(str(index), str(index), str(index)):
                pass
        with self.assertRaises(HTTPException) as error:
            with gate.acquire('new-ip', 'new-visitor', 'next'):
                pass
        self.assertEqual(error.exception.status_code, 429)
        gate = curator.CuratorGate()
        with gate.acquire('one', 'one', 'one'), gate.acquire('two', 'two', 'two'):
            with self.assertRaises(HTTPException) as error:
                with gate.acquire('three', 'three', 'three'):
                    pass
            self.assertEqual(error.exception.status_code, 429)


if __name__ == '__main__':
    unittest.main()
