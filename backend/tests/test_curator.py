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
        self.env = patch.dict(os.environ, {'OPENAI_API_KEY': 'test-only-not-a-real-key',
                                         'OPENAI_CURATOR_MODEL': curator.DEFAULT_MODEL,
                                         'OPENAI_CURATOR_TIMEOUT_SECONDS': '20'})
        self.env.start()
        self.gate = patch.object(curator, 'gate', curator.CuratorGate())
        self.gate.start()
        self.data = curator.CuratorInput(title='', content='이불의 중력이 강해서 일어나지 못했습니다.',
                                         category='지각·조퇴', visitor_id=uuid4(), request_id=uuid4())

    def tearDown(self):
        self.gate.stop()
        self.env.stop()

    @staticmethod
    def response(draft=None, **changes):
        return BytesIO(json.dumps({'status': 'completed', 'output': [{'type': 'message', 'content': [
            {'type': 'output_text', 'text': json.dumps(draft if draft is not None else DRAFT, ensure_ascii=False)}]}], **changes}).encode())

    def test_one_structured_request_returns_three_titles_and_one_description(self):
        with patch.object(curator, 'urlopen', return_value=self.response()) as transport:
            result = curator.generate_curator(self.data, '127.0.0.1')
        self.assertEqual(result.titles, DRAFT['titles'])
        self.assertEqual(result.refined_description, ' '.join(DRAFT['description_sentences']))
        transport.assert_called_once()
        request = transport.call_args.args[0]
        self.assertEqual(request.full_url, 'https://api.openai.com/v1/responses')
        self.assertEqual(transport.call_args.kwargs['timeout'], 20)
        payload = json.loads(request.data)
        self.assertFalse(payload['store'])
        self.assertEqual(payload['model'], curator.DEFAULT_MODEL)
        self.assertEqual(payload['reasoning']['effort'], 'none')
        self.assertEqual(payload['max_output_tokens'], 1000)
        self.assertTrue(payload['text']['format']['strict'])
        user_data = json.loads(payload['input'][1]['content'])
        self.assertEqual(user_data['original_excuse'], self.data.content)
        self.assertNotIn('visitor_id', user_data)
        self.assertNotIn('request_id', user_data)
        self.assertNotIn('test-only-not-a-real-key', request.data.decode())

    def test_result_shape_length_diversity_and_korean_sentences_are_validated(self):
        for changes in [
            {'titles': ['제목 하나']}, {'titles': ['같은 제목'] * 3},
            {'titles': ['가', '다른 제목', '또 다른 작품']}, {'titles': ['가' * 51, '다른 제목', '또 다른 작품']},
            {'description_sentences': ['한 문장입니다.']}, {'description_sentences': ['문장입니다.'] * 5},
            {'description_sentences': ['문장이 아닙니다', '또 다른 문장입니다.']},
            {'description_sentences': ['English sentence.', 'Another sentence.']}, {'unexpected': True},
        ]:
            with self.subTest(keys=list(changes)):
                with self.assertRaises(ValidationError):
                    curator.CuratorDraft.model_validate({**DRAFT, **changes})

    def test_refusal_incomplete_and_malformed_responses_never_become_fake_results(self):
        for response, reason in [(self.response(status='incomplete'), 'incomplete_response'), (BytesIO(b'bad JSON'), 'invalid_response'),
                         (self.response(output=[{'type': 'message', 'content': [{'type': 'refusal', 'refusal': 'no'}]}]), 'response_refused'),
                         (self.response(draft={**DRAFT, 'titles': ['동일 제목'] * 3}), 'invalid_response')]:
            data = self.data.model_copy(update={'request_id': uuid4()})
            with patch.object(curator, 'urlopen', return_value=response) as transport:
                with self.assertRaises(HTTPException) as error:
                    curator.generate_curator(data, '127.0.0.1')
                self.assertEqual(error.exception.status_code, 502)
                self.assertEqual(error.exception.detail, {'code': 'curator_' + reason})
                transport.assert_called_once()

    def test_missing_key_never_calls_provider(self):
        with patch.dict(os.environ, {'OPENAI_API_KEY': ''}), patch.object(curator, 'urlopen') as transport:
            with self.assertRaises(HTTPException) as error:
                curator.generate_curator(self.data, '127.0.0.1')
            self.assertEqual(error.exception.status_code, 503)
            self.assertEqual(error.exception.detail, {'code': 'curator_not_configured'})
            transport.assert_not_called()

    def test_failures_timeout_are_sanitized_without_retries_and_release_inflight(self):
        for exception, expected in [(TimeoutError('private provider detail'), 504),
                                    (URLError(TimeoutError('private detail')), 504),
                                    (URLError('private detail'), 503),
                                    (HTTPError(curator.OPENAI_URL, 401, 'private detail', {}, BytesIO(b'private')), 503)]:
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
                 (403, {}, 'access_denied'), (404, {}, 'model_unavailable'),
                 (429, {'code': 'credit_balance_exhausted'}, 'quota_exceeded'),
                 (429, {'code': 'project_spend_limit_exceeded'}, 'quota_exceeded'),
                 (429, {'type': 'insufficient_quota'}, 'quota_exceeded'),
                 (429, {'code': 'rate_limit_exceeded'}, 'provider_rate_limited'),
                 (429, {'code': {}}, 'provider_rate_limited'),
                 (500, {}, 'provider_unavailable'), (503, {}, 'provider_unavailable')]
        for status, metadata, reason in cases:
            with self.subTest(status=status, reason=reason):
                body = BytesIO(json.dumps({'error': {**metadata, 'message': 'private provider body with test-only-not-a-real-key'}}).encode())
                failure = HTTPError(curator.OPENAI_URL, status, 'private detail', {}, body)
                with patch.object(curator, 'gate', curator.CuratorGate()), patch.object(curator, 'urlopen', side_effect=failure) as transport:
                    with self.assertRaises(HTTPException) as caught:
                        curator.generate_curator(self.data, '127.0.0.1')
                    self.assertEqual(caught.exception.status_code, 503)
                    self.assertEqual(caught.exception.detail, {'code': 'curator_' + reason})
                    self.assertNotIn('private', json.dumps(caught.exception.detail))
                    self.assertTrue(body.closed)
                    transport.assert_called_once()
                    self.assertFalse(curator.gate.active)

    def test_unreadable_or_oversized_rate_limit_errors_do_not_escape_sanitization(self):
        for raw in [b'not JSON private body', b'x' * 9000, b'[]']:
            failure = HTTPError(curator.OPENAI_URL, 429, 'private detail', {}, BytesIO(raw))
            data = self.data.model_copy(update={'request_id': uuid4()})
            with patch.object(curator, 'urlopen', side_effect=failure) as transport:
                with self.assertRaises(HTTPException) as caught:
                    curator.generate_curator(data, '127.0.0.1')
                self.assertEqual(caught.exception.detail, {'code': 'curator_provider_rate_limited'})
                transport.assert_called_once()

    def test_short_valid_excuse_and_image_off_do_not_disable_text_curator(self):
        data = self.data.model_copy(update={'content': '공룡이 갑자기 저희 집을 덮쳤어요!', 'category': '휴가·병가'})
        with patch.dict(os.environ, {'OPENAI_IMAGE_ENABLED': '0'}), patch.object(curator, 'urlopen', return_value=self.response()) as transport:
            result = curator.generate_curator(data, '127.0.0.1')
        self.assertEqual(len(result.titles), 3)
        sent = json.loads(json.loads(transport.call_args.args[0].data)['input'][1]['content'])
        self.assertEqual(sent['original_excuse'], data.content)
        self.assertEqual(sent['category'], '휴가·병가')
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
