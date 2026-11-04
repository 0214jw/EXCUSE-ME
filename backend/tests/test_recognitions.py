"""Phase 4 integration checks: disposable DB, no AI/provider requests."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
import os
from pathlib import Path
import sqlite3
import unittest
from unittest.mock import patch
from urllib.parse import urlencode
from uuid import uuid4

import test_api


class RecognitionTests(unittest.TestCase):
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
        # This class owns only a temporary database, never the user's DB.
        with closing(sqlite3.connect(self.db_path)) as db:
            db.execute('PRAGMA foreign_keys=ON')
            db.execute('DELETE FROM artworks')
            db.commit()

    def create(self, **changes):
        payload = self.payload(**changes)
        status, row, _ = self.request('/api/artworks', payload)
        self.assertEqual(status, 201)
        return payload, row

    def vote(self, row, visitor, method='PUT'):
        return self.request(f"/api/artworks/{row['id']}/recognition", {'visitor_id': visitor}, method=method)

    def detail(self, row, visitor=None):
        return self.request(f"/api/artworks/{row['id']}", headers={'X-Visitor-ID': visitor} if visitor else None)[1]

    def test_add_cancel_repeat_independent_visitors_and_self_vote(self):
        payload, row = self.create()
        owner, other = payload['visitor_id'], str(uuid4())
        for _ in range(2):
            status, vote, headers = self.vote(row, owner.upper())
            self.assertEqual(status, 200)
            self.assertEqual(vote, {'artwork_id': row['id'], 'recognition_count': 1, 'recognized_by_me': True})
            self.assertEqual(headers['Cache-Control'], 'no-store')
        self.assertFalse(self.detail(row)['recognized_by_me'])
        self.assertFalse(self.detail(row, other)['recognized_by_me'])
        self.assertTrue(self.detail(row, owner)['recognized_by_me'])
        self.assertTrue(self.detail(row, owner)['can_manage'])
        self.assertEqual(self.vote(row, other)[1]['recognition_count'], 2)
        for _ in range(2):
            self.assertEqual(self.vote(row, owner, 'DELETE')[1],
                             {'artwork_id': row['id'], 'recognition_count': 1, 'recognized_by_me': False})
        self.assertTrue(self.detail(row, other)['recognized_by_me'])
        self.assertEqual(self.vote(row, other, 'DELETE')[1]['recognition_count'], 0)

    def test_reload_restart_edit_and_idempotent_donation_keep_votes_and_description(self):
        payload, row = self.create(refined_description='확인한 AI 작품 설명입니다.', description_confirmed=True)
        self.vote(row, payload['visitor_id'])
        first = self.detail(row, payload['visitor_id'])
        self.assertEqual(first, self.detail(row, payload['visitor_id']))
        self.stop_server()
        self.start_server()
        self.assertEqual(first, self.detail(row, payload['visitor_id']))
        status, retried, _ = self.request('/api/artworks', payload)
        self.assertEqual(status, 200)
        self.assertEqual(retried['recognition_count'], 1)
        edit = {key: value for key, value in payload.items() if key not in ('request_id', 'description_confirmed', 'refined_description')}
        status, edited, _ = self.request(f"/api/artworks/{row['id']}", {**edit, 'title': '제목만 고침'}, method='PUT')
        self.assertEqual(status, 200)
        self.assertEqual(edited['refined_description'], first['refined_description'])
        self.assertEqual(edited['recognition_count'], 1)
        self.assertTrue(edited['recognized_by_me'])
        # Replaying old donation data must not overwrite an edited artwork.
        self.assertEqual(self.request('/api/artworks', payload)[0], 409)
        self.assertEqual(self.detail(row)['title'], '제목만 고침')
        listed = self.request('/api/artworks')[1]
        self.assertEqual(listed[0]['recognition_count'], 1)
        self.assertFalse(listed[0]['recognized_by_me'])  # public list, no visitor identity

    def test_missing_invalid_identity_and_extra_fields_rejected_without_rows(self):
        _, row = self.create()
        for method in ('PUT', 'DELETE'):
            self.assertEqual(self.vote({'id': 9999999}, str(uuid4()), method)[0], 404)
            self.assertEqual(self.vote({'id': 0}, str(uuid4()), method)[0], 422)
            for data in ({}, {'visitor_id': 'invalid'}, {'visitor_id': str(uuid4()), 'recognition_count': 999}):
                self.assertEqual(self.request(f"/api/artworks/{row['id']}/recognition", data, method=method)[0], 422)
        with closing(sqlite3.connect(self.db_path)) as db:
            self.assertEqual(db.execute('SELECT count(*) FROM artwork_recognitions').fetchone()[0], 0)

    def test_simultaneous_duplicate_and_mixed_requests_remain_consistent(self):
        _, row = self.create()
        visitor = str(uuid4())
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(lambda _: self.vote(row, visitor), range(16)))
        self.assertTrue(all(status == 200 and result['recognition_count'] == 1 for status, result, _ in results))
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(lambda i: self.vote(row, visitor, 'PUT' if i % 2 else 'DELETE'), range(16)))
        self.assertTrue(all(status == 200 and result['recognition_count'] in (0, 1) for status, result, _ in results))
        actual = self.detail(row, visitor)
        with closing(sqlite3.connect(self.db_path)) as db:
            stored = db.execute('SELECT count(*) FROM artwork_recognitions WHERE artwork_id=?', (row['id'],)).fetchone()[0]
        self.assertEqual(actual['recognition_count'], stored)
        self.assertEqual(actual['recognized_by_me'], bool(stored))

    def test_top_ten_oldest_then_id_ties_and_category_popularity(self):
        rows = []
        for i in range(12):
            _, row = self.create(title=f'전시 작품 {i}', category='운동' if i % 2 else '약속')
            rows.append(row)
            # Intentionally reverse creation dates vs IDs to test both tie levels.
            with closing(sqlite3.connect(self.db_path)) as db:
                db.execute('UPDATE artworks SET created_at=? WHERE id=?',
                           (f'2026-01-{12 - i // 2:02d}T00:00:00.000000+00:00', row['id']))
                db.commit()
            for _ in range(i % 3):
                self.vote(row, str(uuid4()))
        with closing(sqlite3.connect(self.db_path)) as db:
            expected = [r[0] for r in db.execute('''SELECT a.id FROM artworks a
                LEFT JOIN artwork_recognitions r ON a.id=r.artwork_id GROUP BY a.id
                ORDER BY count(r.visitor_id) DESC,a.created_at ASC,a.id ASC''')]
        status, hall, headers = self.request('/api/hall-of-fame')
        self.assertEqual(status, 200)
        self.assertEqual(len(hall), 10)
        self.assertEqual([r['id'] for r in hall], expected[:10])
        self.assertEqual(headers['Cache-Control'], 'no-store')
        self.assertEqual([r['id'] for r in self.request('/api/artworks?order=popular')[1]], expected)
        filtered = self.request('/api/artworks?' + urlencode({'order': 'popular', 'category': '운동'}))[1]
        wanted = {r['id'] for r in rows if r['category'] == '운동'}
        self.assertEqual([r['id'] for r in filtered], [id for id in expected if id in wanted])
        latest = self.request('/api/artworks?order=latest')[1]
        self.assertEqual([r['id'] for r in latest], [r['id'] for r in sorted(latest, key=lambda r: (r['created_at'], r['id']), reverse=True)])
        for query in ('order=unknown', 'category=unknown', 'order=popular&category=unknown'):
            self.assertEqual(self.request('/api/artworks?' + query)[0], 422)

    def test_empty_hall_and_zero_vote_real_work(self):
        self.assertEqual(self.request('/api/hall-of-fame')[:2], (200, []))
        _, row = self.create()
        hall = self.request('/api/hall-of-fame')[1]
        self.assertEqual([r['id'] for r in hall], [row['id']])
        self.assertEqual(hall[0]['recognition_count'], 0)

    def test_owner_deletion_cascades_votes_without_touching_other_works(self):
        payload, row = self.create()
        _, other = self.create()
        visitor = str(uuid4())
        self.vote(row, visitor)
        self.vote(other, visitor)
        url = f"/api/artworks/{row['id']}"
        self.assertEqual(self.request(url, {'visitor_id': visitor}, method='DELETE')[0], 403)
        self.assertEqual(self.detail(row)['recognition_count'], 1)
        self.assertEqual(self.request(url, {'visitor_id': payload['visitor_id']}, method='DELETE')[0], 204)
        self.assertEqual(self.vote(row, visitor)[0], 404)
        self.assertNotIn(row['id'], [r['id'] for r in self.request('/api/hall-of-fame')[1]])
        with closing(sqlite3.connect(self.db_path)) as db:
            self.assertEqual(db.execute('SELECT artwork_id FROM artwork_recognitions').fetchall(), [(other['id'],)])

    def test_failed_delete_and_vote_transactions_roll_back(self):
        payload, row = self.create()
        visitor = str(uuid4())
        self.vote(row, visitor)
        with closing(sqlite3.connect(self.db_path)) as db:
            db.execute(f"CREATE TRIGGER fail_after_delete AFTER DELETE ON artworks WHEN OLD.id={row['id']} BEGIN SELECT RAISE(ABORT,'test'); END")
            db.commit()
        try:
            self.assertEqual(self.request(f"/api/artworks/{row['id']}", {'visitor_id': payload['visitor_id']}, method='DELETE')[0], 503)
            self.assertEqual(self.detail(row, visitor)['recognition_count'], 1)
        finally:
            with closing(sqlite3.connect(self.db_path)) as db:
                db.execute('DROP TRIGGER fail_after_delete')
                db.execute("CREATE TRIGGER fail_vote AFTER INSERT ON artwork_recognitions BEGIN SELECT RAISE(ABORT,'test'); END")
                db.commit()
        try:
            self.assertEqual(self.vote(row, str(uuid4()))[0], 503)
            self.assertEqual(self.detail(row)['recognition_count'], 1)
        finally:
            with closing(sqlite3.connect(self.db_path)) as db:
                db.execute('DROP TRIGGER fail_vote')
                db.commit()


if __name__ == '__main__':
    unittest.main()
