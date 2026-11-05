"""Synthetic PNGs, temporary SQLite/files, mocked provider only. Never paid calls."""
import base64
from io import BytesIO
import json
import os
from pathlib import Path
import sqlite3
import struct
import sys
import tempfile
import time
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from uuid import uuid4
import zlib

from fastapi import HTTPException, Response
from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import database
import main
import paintings


def png(width=768, height=1024):
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress((b'\x00' + b'\xff' * (width * 3)) * height)) + chunk(b'IEND', b''))


class PaintingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='excuse-me-paintings-')
        self.addCleanup(self.temp.cleanup)
        self.patches = [patch.object(database, 'DB_PATH', Path(self.temp.name) / 'test.sqlite3'),
                        patch.object(paintings, 'STORAGE', Path(self.temp.name) / 'private'),
                        patch.dict(os.environ, {'OPENAI_API_KEY': 'test-only-not-a-real-key', 'OPENAI_IMAGE_ENABLED': '1',
                            'OPENAI_IMAGE_DAILY_LIMIT': '3', 'OPENAI_IMAGE_TOTAL_LIMIT': '10', 'OPENAI_IMAGE_BUDGET_CENTS': '100'})]
        for p in self.patches:
            p.start()
            self.addCleanup(p.stop)
        # Every test is physically prevented from using provider network transport.
        self.transport = patch.object(paintings, 'urlopen', side_effect=self.response).start()
        self.addCleanup(patch.stopall)
        database.initialize()
        self.values = {'title': '이불의 중력', 'content': '이불의 중력이 강해서 일어나지 못했습니다.', 'category': '지각·조퇴',
                       'refined_description': '작은 사정은 한 폭의 일상이 됩니다.', 'visitor_id': str(uuid4()),
                       'request_id': str(uuid4()), 'image_style': 'watercolor'}

    def response(self, *args, **kwargs):
        return BytesIO(json.dumps({'data': [{'b64_json': base64.b64encode(png()).decode()}]}).encode())

    def generate(self, **changes):
        return paintings.generate_painting(paintings.PaintingInput(**{**self.values, **changes}), '127.0.0.1')

    def donate(self, result, **changes):
        data = {k: v for k, v in self.values.items() if k != 'image_style'}
        return main.create_artwork(main.ArtworkInput(**{**data, 'description_confirmed': True,
                                  'image_token': result['image_token'], 'image_confirmed': True, **changes}), Response())

    def counts(self):
        with database.connection() as db:
            return db.execute('SELECT count(*) FROM artworks').fetchone()[0]

    def test_explicit_single_request_preview_then_confirmed_donation_and_restart(self):
        result = self.generate()
        self.assertEqual(self.counts(), 0)
        self.assertTrue(result['preview_data_url'].startswith('data:image/png;base64,'))
        self.transport.assert_called_once()
        request = self.transport.call_args.args[0]
        body = json.loads(request.data)
        self.assertEqual((body['model'], body['quality'], body['size'], body['n']), ('gpt-image-2', 'medium', '768x1024', 1))
        self.assertEqual(result['size'], '768x1024')
        self.assertIn('vertical 3:4 canvas', body['prompt'])
        self.assertIn('central 80% of both width and height', body['prompt'])
        self.assertIn(self.values['content'], body['prompt'])
        self.assertIn(self.values['refined_description'], body['prompt'])
        self.assertIn('No frame, letters', body['prompt'])
        self.assertEqual(self.transport.call_args.kwargs['timeout'], 120)
        with self.assertRaises(HTTPException):
            main.get_artwork_image(1)
        created = self.donate(result)
        self.assertEqual(created['content'], self.values['content'])
        self.assertEqual(created['refined_description'], self.values['refined_description'])
        self.assertEqual(created['image_mode'], 'generated')
        self.assertEqual(created['image_style'], 'watercolor')
        self.assertEqual(created['image_url'], f"/api/artworks/{created['id']}/image")
        self.assertEqual(self.donate(result)['id'], created['id'])
        database.initialize()  # Same file, no reset.
        self.assertEqual(main.get_artwork_image(created['id']).body, png())
        self.assertEqual(main.get_artwork(created['id'])['image_url'], created['image_url'])
        self.assertEqual(self.counts(), 1)
        self.assertEqual(paintings.cleanup_previews(time.time() + 172800), 0)
        self.assertEqual(main.get_artwork_image(created['id']).body, png())

    def test_portrait_dimensions_meet_provider_limits_and_wrong_response_is_not_saved(self):
        width, height = paintings.DIMENSIONS
        self.assertEqual(width * 4, height * 3)
        self.assertEqual((width % 16, height % 16), (0, 0))
        self.assertTrue(655360 <= width * height <= 8294400)
        self.assertLess(max(width, height), 3840)
        paintings.validate_png(png())
        for dimensions in [(1024, 1024), (1024, 768), (1024, 1536)]:
            with self.subTest(dimensions=dimensions), self.assertRaises(ValueError):
                paintings.validate_png(png(*dimensions))
        self.transport.side_effect = lambda *args, **kwargs: BytesIO(json.dumps({'data': [{'b64_json': base64.b64encode(png(1024, 1024)).decode()}]}).encode())
        with self.assertRaises(HTTPException) as error:
            self.generate()
        self.assertEqual(error.exception.status_code, 502)
        self.transport.assert_called_once()
        self.assertFalse(list(paintings.STORAGE.glob('*.png')))
        self.assertEqual(self.counts(), 0)

    def test_disabled_missing_key_and_invalid_input_never_call_provider(self):
        for env in ({'OPENAI_IMAGE_ENABLED': '0'}, {'OPENAI_API_KEY': ''}):
            with patch.dict(os.environ, env), self.assertRaises(HTTPException) as error:
                self.generate()
            self.assertEqual(error.exception.status_code, 503)
        with self.assertRaises(ValidationError):
            self.generate(image_style='living-artist')
        for change in ({'content': '짧음'}, {'title': ''}, {'category': '과제'}, {'refined_description': '가' * 1001}):
            with self.assertRaises(ValidationError):
                paintings.PaintingInput(**{**self.values, **change})
        self.transport.assert_not_called()

    def test_failures_are_sanitized_reserved_and_never_retried(self):
        for failure, expected in [(HTTPError('https://api.openai.com', 403, 'SECRET', {}, BytesIO(b'SECRET')), 502),
                                   (TimeoutError('SECRET'), 504), (ValueError('SECRET'), 502)]:
            with self.subTest(type=type(failure).__name__):
                with database.connection() as db:
                    db.execute('DELETE FROM image_generations')  # Isolated test ledger only.
                self.transport.reset_mock()
                self.transport.side_effect = failure
                with self.assertRaises(HTTPException) as error:
                    self.generate()
                self.assertEqual(error.exception.status_code, expected)
                self.assertNotIn('SECRET', error.exception.detail)
                self.transport.assert_called_once()
                with database.connection() as db:
                    row = db.execute('SELECT status,reserved_cents FROM image_generations').fetchone()
                    self.assertEqual(tuple(row), ('failed', 10))
                self.assertEqual(self.counts(), 0)

    def test_durable_budget_global_daily_and_client_cooldown(self):
        self.generate()
        database.initialize()
        with self.assertRaises(HTTPException) as error:
            self.generate()
        self.assertEqual(error.exception.status_code, 409)  # Same UUID.
        with self.assertRaises(HTTPException) as error:
            self.generate(request_id=str(uuid4()))
        self.assertEqual(error.exception.status_code, 429)  # Same visitor/IP, new UUID.
        for env in ({'OPENAI_IMAGE_TOTAL_LIMIT': '1'}, {'OPENAI_IMAGE_DAILY_LIMIT': '1'}, {'OPENAI_IMAGE_BUDGET_CENTS': '10'}):
            with patch.dict(os.environ, env), self.assertRaises(HTTPException) as error:
                paintings.generate_painting(paintings.PaintingInput(**{**self.values, 'visitor_id': uuid4(), 'request_id': uuid4()}), 'other-ip')
            self.assertEqual(error.exception.status_code, 429)
        self.transport.assert_called_once()

    def test_pending_request_serializes_across_connections(self):
        paintings.reserve(paintings.PaintingInput(**self.values), 'ip-one')
        with self.assertRaises(HTTPException) as error:
            paintings.reserve(paintings.PaintingInput(**{**self.values, 'visitor_id': uuid4(), 'request_id': uuid4()}), 'ip-two')
        self.assertEqual(error.exception.status_code, 409)
        self.transport.assert_not_called()

    def test_confirmation_ownership_context_expiry_and_file_required(self):
        result = self.generate()
        with self.assertRaises(ValidationError):
            self.donate(result, image_confirmed=False)
        for change in ({'visitor_id': str(uuid4())}, {'title': '바뀐 작품명'}, {'refined_description': '바뀐 설명'}, {'image_token': 'a' * 43}):
            with self.assertRaises(HTTPException) as error:
                self.donate(result, **change)
            self.assertEqual(error.exception.status_code, 409)
        with patch.object(paintings.time, 'time', return_value=time.time() + 172800), self.assertRaises(HTTPException):
            self.donate(result)
        next(paintings.STORAGE.glob('*.png')).unlink()
        with self.assertRaises(HTTPException) as error:
            self.donate(result)
        self.assertEqual(error.exception.status_code, 503)
        self.assertEqual(self.counts(), 0)

    def test_file_or_database_save_failure_does_not_publish_or_leave_ready_file(self):
        with patch.object(Path, 'open', side_effect=OSError('disk full')), self.assertRaises(HTTPException) as error:
            self.generate()
        self.assertEqual(error.exception.status_code, 503)
        with database.connection() as db:
            self.assertEqual(db.execute('SELECT status FROM image_generations').fetchone()[0], 'failed')
            db.execute('DELETE FROM image_generations')
            db.execute("CREATE TRIGGER fail_ready BEFORE UPDATE ON image_generations WHEN NEW.status='ready' BEGIN SELECT RAISE(ABORT, 'test'); END")
        with self.assertRaises(HTTPException):
            self.generate()
        self.assertFalse(list(paintings.STORAGE.glob('*.png')))
        self.assertEqual(self.counts(), 0)

    def test_donation_transaction_rolls_back_link_and_artwork_together(self):
        result = self.generate()
        with database.connection() as db:
            db.execute("CREATE TRIGGER fail_link BEFORE UPDATE ON image_generations WHEN NEW.artwork_id IS NOT NULL BEGIN SELECT RAISE(ABORT, 'test'); END")
        with self.assertRaises(sqlite3.Error):
            self.donate(result)
        self.assertEqual(self.counts(), 0)
        with database.connection() as db:
            self.assertIsNone(db.execute('SELECT artwork_id FROM image_generations').fetchone()[0])
        self.assertEqual(len(list(paintings.STORAGE.glob('*.png'))), 1)

    def test_canceled_preview_expires_cleanup_keeps_budget_reservation(self):
        self.generate()
        self.assertEqual(paintings.cleanup_previews(time.time() + 172800), 1)
        self.assertEqual(self.counts(), 0)
        self.assertFalse(list(paintings.STORAGE.glob('*.png')))
        with database.connection() as db:
            row = db.execute('SELECT status,reserved_cents FROM image_generations').fetchone()
            self.assertEqual(tuple(row), ('expired', 10))

    def test_invalid_provider_image_never_saved_and_file_paths_cannot_escape(self):
        self.transport.side_effect = lambda *args, **kw: BytesIO(json.dumps({'data': [{'b64_json': base64.b64encode(b'not png').decode()}]}).encode())
        with self.assertRaises(HTTPException):
            self.generate()
        self.assertFalse(list(paintings.STORAGE.glob('*')))
        for name in ('../../secret.png', 'a' * 31 + '/.png', 'g' * 32 + '.png'):
            with self.assertRaises(HTTPException):
                paintings.file_path(name)


if __name__ == '__main__':
    unittest.main()
