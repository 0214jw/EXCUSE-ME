"""Actual localhost HTTP with mocked provider; temp DB/files, no real key/cost."""
import os
from pathlib import Path
import socket
import tempfile
import unittest
from unittest.mock import patch
from urllib.request import urlopen
from uuid import uuid4

import test_api


class PaintingHttpFlowTests(unittest.TestCase):
    application = 'painting_fixture:app'
    request = test_api.ArtworkApiTests.request
    payload = test_api.ArtworkApiTests.payload
    stop_server = classmethod(test_api.ArtworkApiTests.stop_server.__func__)

    @classmethod
    def start_server(cls):
        with patch.dict(os.environ, {'PYTHONPATH': str(test_api.BACKEND / 'tests'),
                                     'EXCUSE_ME_IMAGE_DIR': str(Path(cls.temp.name) / 'private'),
                                     'OPENAI_IMAGE_DAILY_LIMIT': '3', 'OPENAI_IMAGE_TOTAL_LIMIT': '10',
                                     'OPENAI_IMAGE_BUDGET_CENTS': '100'}):
            test_api.ArtworkApiTests.start_server.__func__(cls)

    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='excuse-me-painting-http-')
        cls.db_path = Path(cls.temp.name) / 'flow.sqlite3'
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            cls.port = sock.getsockname()[1]
        cls.base = f'http://127.0.0.1:{cls.port}'
        cls.start_server()

    @classmethod
    def tearDownClass(cls):
        cls.stop_server()
        cls.temp.cleanup()

    def test_generate_preview_donate_public_image_restart_and_text_compatibility(self):
        artwork = self.payload(refined_description='원문과 별도로 확인한 미술관 설명입니다.', description_confirmed=True)
        generation = {key: value for key, value in artwork.items() if key not in ('author', 'description_confirmed')}
        generation['image_style'] = 'collage'
        status, preview, headers = self.request('/api/image-generations', generation)
        self.assertEqual(status, 200)
        self.assertEqual(headers['Cache-Control'], 'no-store')
        self.assertEqual(self.request('/api/artworks')[1], [])
        self.assertEqual(self.request('/api/artworks/1/image')[0], 404)
        self.assertEqual(self.request('/api/image-generations', generation)[0], 409)
        self.assertEqual(self.request('/api/image-generations', {**generation, 'request_id': str(uuid4())})[0], 429)
        donation = {**artwork, 'image_token': preview['image_token'], 'image_confirmed': True}
        self.assertEqual(self.request('/api/artworks', {**donation, 'image_confirmed': False})[0], 422)
        status, created, _ = self.request('/api/artworks', donation)
        self.assertEqual(status, 201)
        self.assertEqual(self.request('/api/artworks', donation)[0], 200)
        self.assertEqual(created['image_mode'], 'generated')
        self.assertEqual(created['image_style'], 'collage')
        self.assertNotIn('image_token', created)
        self.assertEqual(self.request(f"/api/artworks/{created['id']}")[1], created)
        self.stop_server()
        self.start_server()
        with urlopen(self.base + created['image_url']) as response:
            self.assertEqual(response.headers.get_content_type(), 'image/png')
            self.assertEqual(response.headers['X-Content-Type-Options'], 'nosniff')
            self.assertTrue(response.read().startswith(b'\x89PNG\r\n\x1a\n'))
        self.assertEqual(self.request('/api/image-generations', generation)[0], 409)
        status, text, _ = self.request('/api/artworks', self.payload())
        self.assertEqual(status, 201)
        self.assertIsNone(text['image_url'])
        self.assertEqual(self.request('/api/health')[1], {'status': 'ok'})


if __name__ == '__main__':
    unittest.main()
