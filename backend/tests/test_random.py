"""Phase 5 uses disposable SQLite and files only; no AI calls or real DB writes."""
from contextlib import closing, contextmanager
import hashlib
import os
from pathlib import Path
import sqlite3
import sys
import unittest
from unittest.mock import patch
from uuid import uuid4

from fastapi import Response
import test_api

sys.path.insert(0, str(test_api.BACKEND))
import main


class RandomArtworkTests(unittest.TestCase):
    setUpClass = classmethod(test_api.ArtworkApiTests.setUpClass.__func__)
    tearDownClass = classmethod(test_api.ArtworkApiTests.tearDownClass.__func__)
    stop_server = classmethod(test_api.ArtworkApiTests.stop_server.__func__)
    request = test_api.ArtworkApiTests.request
    payload = test_api.ArtworkApiTests.payload

    @classmethod
    def start_server(cls):
        with patch.dict(os.environ, {'EXCUSE_ME_IMAGE_DIR': str(Path(cls.temp.name) / 'private'),
                                     'OPENAI_IMAGE_ENABLED': '0', 'OPENAI_API_KEY': ''}):
            test_api.ArtworkApiTests.start_server.__func__(cls)

    def setUp(self):
        with closing(sqlite3.connect(self.db_path)) as db:
            db.execute('PRAGMA foreign_keys=ON')
            db.execute('DELETE FROM image_generations')
            db.execute('DELETE FROM artworks')
            db.commit()

    def create(self, **changes):
        payload = self.payload(**changes)
        status, row, _ = self.request('/api/artworks', payload)
        self.assertEqual(status, 201)
        return payload, row

    @contextmanager
    def temporary_connection(self):
        with closing(sqlite3.connect(self.db_path)) as db:
            db.row_factory = sqlite3.Row
            with db:
                yield db

    def test_empty_and_private_unpublished_preview_are_not_exhibited(self):
        with closing(sqlite3.connect(self.db_path)) as db:
            db.execute('''INSERT INTO image_generations
                (id,visitor_id,request_id,client_hash,context_hash,token_hash,style,status,created_at,expires_at,reserved_cents)
                VALUES (?,?,?,?,?,?,?,'ready',0,9999999999,10)''',
                       (str(uuid4()), str(uuid4()), str(uuid4()), 'private-client', 'private-context', str(uuid4()), 'oil'))
            db.commit()
        for path in ('/api/artworks/random', '/api/artworks/random?exclude_id=123'):
            status, result, headers = self.request(path)
            self.assertEqual((status, result), (200, None))
            self.assertEqual(headers['Cache-Control'], 'no-store')

    def test_single_work_can_repeat_and_preserves_metadata_count_and_detail_route(self):
        payload, row = self.create(refined_description='사용자가 확인한 실제 작품 설명입니다.', description_confirmed=True)
        self.assertEqual(self.request(f"/api/artworks/{row['id']}/recognition", {'visitor_id': payload['visitor_id']}, method='PUT')[0], 200)
        with closing(sqlite3.connect(self.db_path)) as db:
            db.execute('UPDATE artworks SET image_url=?,image_mode=? WHERE id=?', ('/uploads/example-photo.png', 'photo', row['id']))
            db.commit()
        expected = self.request(f"/api/artworks/{row['id']}")[1]
        for query in ('', f"?exclude_id={row['id']}", '?exclude_id=999999999'):
            status, found, headers = self.request('/api/artworks/random' + query)
            self.assertEqual(status, 200)
            self.assertEqual(found, expected)
            self.assertEqual(found['recognition_count'], 1)
            self.assertEqual(found['refined_description'], payload['refined_description'])
            self.assertFalse(found['recognized_by_me'])
            self.assertNotIn('visitor_id', found)
            self.assertEqual(headers['Cache-Control'], 'no-store')

    def test_multiple_works_exclude_last_and_deleted_ids_never_return(self):
        first_payload, first = self.create()
        deleted_payload, deleted = self.create()
        last_payload, last = self.create()
        self.assertEqual(self.request(f"/api/artworks/{deleted['id']}", {'visitor_id': deleted_payload['visitor_id']}, method='DELETE')[0], 204)
        for row, expected in ((first, last), (last, first)):
            for _ in range(4):
                status, found, _ = self.request(f"/api/artworks/random?exclude_id={row['id']}")
                self.assertEqual(status, 200)
                self.assertEqual(found['id'], expected['id'])
        self.request(f"/api/artworks/{last['id']}", {'visitor_id': last_payload['visitor_id']}, method='DELETE')
        self.assertEqual(self.request(f"/api/artworks/random?exclude_id={first['id']}")[1]['id'], first['id'])
        self.request(f"/api/artworks/{first['id']}", {'visitor_id': first_payload['visitor_id']}, method='DELETE')
        self.assertEqual(self.request('/api/artworks/random')[1], None)

    def test_every_remaining_row_is_selectable_with_no_id_gap_bias(self):
        rows = [self.create()[1] for _ in range(6)]
        with closing(sqlite3.connect(self.db_path)) as db:
            db.execute('DELETE FROM artworks WHERE id=?', (rows[2]['id'],))
            db.commit()
        available = [r['id'] for r in rows if r != rows[2]]
        # Exercise every possible random offset, not a flaky frequency assertion.
        for excluded in (None, *available, 999999999):
            expected = [id for id in available if id != excluded]
            selected = []
            for offset in range(len(expected)):
                with patch.object(main, 'connection', self.temporary_connection), patch.object(main, 'randbelow', return_value=offset) as draw:
                    result = main.random_artwork(Response(), exclude_id=excluded)
                selected.append(result['id'])
                draw.assert_called_once_with(len(expected))
            self.assertEqual(selected, expected)

    def test_invalid_exclusion_is_rejected_and_random_route_precedes_id_route(self):
        for value in ('0', '-1', 'bad', '1.5', '9223372036854775808'):
            status, error, _ = self.request('/api/artworks/random?exclude_id=' + value)
            self.assertEqual(status, 422)
            self.assertIn('exclude_id', error['errors'])
        self.assertEqual(self.request('/api/artworks/random')[0], 200)
        self.assertEqual(self.request('/api/artworks/999999999')[0], 404)

    def test_selection_is_read_only_and_saved_work_survives_restart(self):
        _, row = self.create(refined_description='재시작 후에도 남아야 하는 작품 설명입니다.', description_confirmed=True)
        before = hashlib.sha256(self.db_path.read_bytes()).digest()
        for _ in range(4):
            self.assertEqual(self.request('/api/artworks/random')[1]['id'], row['id'])
        self.assertEqual(hashlib.sha256(self.db_path.read_bytes()).digest(), before)
        self.stop_server()
        self.start_server()
        self.assertEqual(self.request('/api/artworks/random')[1]['refined_description'], '재시작 후에도 남아야 하는 작품 설명입니다.')

    def test_database_failure_is_not_empty_and_read_retry_recovers(self):
        _, row = self.create()
        with closing(sqlite3.connect(self.db_path)) as db:
            db.execute('BEGIN EXCLUSIVE')
            status, error, _ = self.request('/api/artworks/random')
            self.assertEqual(status, 503)
            self.assertIsNotNone(error)
        self.assertEqual(self.request('/api/artworks/random')[1]['id'], row['id'])

    def test_deleted_after_selection_is_not_resurrected_by_detail_or_next_request(self):
        payload, row = self.create()
        self.assertEqual(self.request('/api/artworks/random')[1]['id'], row['id'])
        self.assertEqual(self.request(f"/api/artworks/{row['id']}", {'visitor_id': payload['visitor_id']}, method='DELETE')[0], 204)
        self.assertEqual(self.request(f"/api/artworks/{row['id']}")[0], 404)
        self.assertEqual(self.request(f"/api/artworks/random?exclude_id={row['id']}")[:2], (200, None))


if __name__ == '__main__':
    unittest.main()
