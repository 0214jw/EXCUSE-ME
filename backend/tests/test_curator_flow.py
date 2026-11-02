"""Real HTTP application flow with explicitly mocked OpenAI transport and a temp DB."""
from pathlib import Path
import os
import socket
import tempfile
import unittest
from unittest.mock import patch

import test_api


class CuratorHttpFlowTests(unittest.TestCase):
    application = 'curator_fixture:app'
    request = test_api.ArtworkApiTests.request
    payload = test_api.ArtworkApiTests.payload

    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='excuse-me-curator-flow-')
        cls.db_path = Path(cls.temp.name) / 'flow.sqlite3'
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            cls.port = sock.getsockname()[1]
        cls.base = f'http://127.0.0.1:{cls.port}'
        with patch.dict(os.environ, {'PYTHONPATH': str(test_api.BACKEND / 'tests')}):
            test_api.ArtworkApiTests.start_server.__func__(cls)

    stop_server = classmethod(test_api.ArtworkApiTests.stop_server.__func__)

    @classmethod
    def tearDownClass(cls):
        cls.stop_server()
        cls.temp.cleanup()

    def test_generate_review_choose_edit_and_donate_preserves_original(self):
        input_data = self.payload()
        input_data.pop('author')
        before = self.request('/api/artworks')[1]
        status, recommendation, _ = self.request('/api/curator', input_data)
        self.assertEqual(status, 200)
        self.assertEqual(len(recommendation['titles']), 3)
        self.assertTrue(recommendation['refined_description'])
        self.assertEqual(self.request('/api/artworks')[1], before)
        final_description = recommendation['refined_description'] + ' 사용자가 직접 확인한 설명입니다.'
        donation = {**input_data, 'title': recommendation['titles'][1] + '의 변주',
                    'refined_description': final_description, 'description_confirmed': True}
        status, created, _ = self.request('/api/artworks', donation)
        self.assertEqual(status, 201)
        detail = self.request(f"/api/artworks/{created['id']}")[1]
        self.assertEqual(detail['title'], donation['title'])
        self.assertEqual(detail['content'], input_data['content'])
        self.assertEqual(detail['refined_description'], final_description)
        self.assertNotIn('titles', detail)

    def test_duplicate_generation_and_input_rejection_do_not_create_artworks(self):
        input_data = self.payload()
        input_data.pop('author')
        before = self.request('/api/artworks')[1]
        self.assertEqual(self.request('/api/curator', input_data)[0], 200)
        self.assertEqual(self.request('/api/curator', input_data)[0], 409)
        self.assertEqual(self.request('/api/curator', {**input_data, 'category': '과제'})[0], 422)
        self.assertEqual(self.request('/api/artworks')[1], before)


if __name__ == '__main__':
    unittest.main()
