"""Phase 3 HTTP integration tests. All DBs/files are temporary; no AI calls."""
from contextlib import closing
import base64
import hashlib
import os
from pathlib import Path
import sqlite3
import unittest
from unittest.mock import patch
from uuid import uuid4
from urllib.request import urlopen

import test_api


class ArtworkManagementTests(unittest.TestCase):
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

    def create(self, **changes):
        payload = self.payload(refined_description='기증할 때 확인한 작품 설명입니다.', description_confirmed=True, **changes)
        status, row, _ = self.request('/api/artworks', payload)
        self.assertEqual(status, 201)
        return payload, row

    def edit(self, payload, **changes):
        return {key: value for key, value in {**payload, **changes}.items()
                if key in ('title', 'content', 'category', 'author', 'visitor_id', 'refined_description')}

    def detail(self, row, visitor_id=None):
        return self.request(f"/api/artworks/{row['id']}", headers={'X-Visitor-ID': visitor_id} if visitor_id else None)

    def image_response(self, url):
        with urlopen(self.base + url) as response:
            return response.status, response.read()

    def attach_image(self, payload, row):
        # Seed an already donated image, without executing generation code.
        generation_id = str(uuid4())
        directory = Path(self.temp.name) / 'private'
        directory.mkdir(exist_ok=True)
        filename = uuid4().hex + '.png'
        path = directory / filename
        raw = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0l8AAAAASUVORK5CYII=')
        path.write_bytes(raw)
        token = generation_id.replace('-', '') + 'x' * 11
        with closing(sqlite3.connect(self.db_path)) as db:
            db.execute('UPDATE artworks SET image_url=?,image_mode=?,image_style=? WHERE id=?',
                       (f"/api/artworks/{row['id']}/image", 'generated', 'oil', row['id']))
            db.execute('''INSERT INTO image_generations
                (id,visitor_id,request_id,client_hash,context_hash,token_hash,style,status,
                 created_at,expires_at,reserved_cents,filename,digest,artwork_id)
                 VALUES (?,?,?,?,?,?,?,'ready',0,1,10,?,?,?)''',
                       (generation_id, payload['visitor_id'], str(uuid4()), 'test-client', 'test-context',
                        hashlib.sha256(token.encode()).hexdigest(), 'oil', filename, hashlib.sha256(raw).hexdigest(), row['id']))
            db.commit()
        return generation_id, path, token

    def test_owner_flag_is_personalized_and_does_not_disclose_owner_id(self):
        payload, row = self.create()
        self.assertFalse(self.detail(row)[1]['can_manage'])
        self.assertFalse(self.detail(row, str(uuid4()))[1]['can_manage'])
        status, owned, headers = self.detail(row, payload['visitor_id'].upper())
        self.assertEqual(status, 200)
        self.assertTrue(owned['can_manage'])
        self.assertNotIn('visitor_id', owned)
        self.assertNotIn('request_id', owned)
        self.assertEqual(headers['Cache-Control'], 'no-store')
        self.assertIn('X-Visitor-ID', [field.strip() for field in headers['Vary'].split(',')])
        self.assertFalse(next(r for r in self.request('/api/artworks')[1] if r['id'] == row['id'])['can_manage'])
        self.assertEqual(self.detail(row, 'invalid')[0], 422)

    def test_owner_update_preserves_image_identity_dates_and_persists_restart(self):
        payload, row = self.create()
        generation_id, path, _ = self.attach_image(payload, row)
        before = self.detail(row)[1]
        update = self.edit(payload, title='  새 작품명  ', content='  수정한 핑계의 원문은 그대로 보관합니다.  ',
                           category='운동', author='  ', refined_description='  직접 다듬은 작품 설명입니다.  ')
        status, result, _ = self.request(f"/api/artworks/{row['id']}", update, method='PUT')
        self.assertEqual(status, 200)
        self.assertEqual(result['title'], '새 작품명')
        self.assertEqual(result['content'], update['content'].strip())
        self.assertEqual(result['category'], '운동')
        self.assertEqual(result['author'], '익명의 예술가')
        self.assertEqual(result['refined_description'], '직접 다듬은 작품 설명입니다.')
        for field in ('id', 'created_at', 'image_url', 'image_mode', 'image_style'):
            self.assertEqual(result[field], before[field])
        self.assertNotEqual(result['updated_at'], before['updated_at'])
        self.assertTrue(path.exists())
        self.assertEqual(self.image_response(before['image_url']), (200, path.read_bytes()))
        with closing(sqlite3.connect(self.db_path)) as db:
            stored = db.execute('SELECT visitor_id,request_id FROM artworks WHERE id=?', (row['id'],)).fetchone()
            self.assertEqual(stored, (payload['visitor_id'], payload['request_id']))
            self.assertEqual(db.execute('SELECT status FROM image_generations WHERE id=?', (generation_id,)).fetchone()[0], 'ready')
        self.stop_server()
        self.start_server()
        self.assertEqual(self.detail(row, payload['visitor_id'])[1], result)
        self.assertEqual(self.image_response(before['image_url']), (200, path.read_bytes()))

    def test_description_omission_preserves_and_explicit_blank_clears(self):
        payload, row = self.create()
        update = self.edit(payload)
        update.pop('refined_description')
        self.assertEqual(self.request(f"/api/artworks/{row['id']}", update, method='PUT')[1]['refined_description'], row['refined_description'])
        update['refined_description'] = '  '
        self.assertIsNone(self.request(f"/api/artworks/{row['id']}", update, method='PUT')[1]['refined_description'])

    def test_other_id_missing_invalid_and_malformed_requests_do_not_change_artwork(self):
        payload, row = self.create()
        url = f"/api/artworks/{row['id']}"
        stranger = str(uuid4())
        self.assertEqual(self.request(url, self.edit(payload, visitor_id=stranger), method='PUT')[0], 403)
        self.assertEqual(self.request(url, {'visitor_id': stranger}, method='DELETE')[0], 403)
        for method, data in [('PUT', self.edit(payload)), ('DELETE', {'visitor_id': payload['visitor_id']})]:
            self.assertEqual(self.request('/api/artworks/999999999', data, method=method)[0], 404)
            self.assertEqual(self.request('/api/artworks/0', data, method=method)[0], 422)
            self.assertEqual(self.request(url, {**data, 'visitor_id': 'invalid'}, method=method)[0], 422)
            missing_id = {k: v for k, v in data.items() if k != 'visitor_id'}
            self.assertEqual(self.request(url, missing_id, method=method)[0], 422)
        for changes in [{'title': ' '}, {'title': '가'}, {'title': '가' * 51}, {'content': '짧음'},
                        {'content': '가' * 301}, {'category': '과제'}, {'author': '가' * 21},
                        {'refined_description': '가' * 1001}, {'content': 123}, {'image_url': '/other.png'},
                        {'image_token': 'a' * 43}, {'request_id': str(uuid4())}]:
            data = {**self.edit(payload), **changes}
            status, error, _ = self.request(url, data, method='PUT')
            self.assertEqual(status, 422, changes.keys())
            self.assertIn('errors', error)
        self.assertEqual(self.detail(row)[1], row)

    def test_delete_revokes_public_image_and_preserves_private_file_budget_and_other_works(self):
        payload, row = self.create()
        generation_id, path, token = self.attach_image(payload, row)
        other_payload, other = self.create()
        _, other_path, _ = self.attach_image(other_payload, other)
        url = f"/api/artworks/{row['id']}"
        self.assertEqual(self.image_response(url + '/image')[0], 200)
        self.assertEqual(self.request(url, {'visitor_id': payload['visitor_id']}, method='DELETE')[:2], (204, None))
        self.assertEqual(self.detail(row)[0], 404)
        self.assertEqual(self.request(url + '/image')[0], 404)
        self.assertNotIn(row['id'], [r['id'] for r in self.request('/api/artworks')[1]])
        self.assertEqual(self.request(url, self.edit(payload), method='PUT')[0], 404)
        self.assertEqual(self.request(url, {'visitor_id': payload['visitor_id']}, method='DELETE')[0], 404)
        self.assertTrue(path.exists())
        self.assertTrue(other_path.exists())
        self.assertEqual(self.detail(other)[0], 200)
        self.assertEqual(self.image_response(f"/api/artworks/{other['id']}/image")[0], 200)
        with closing(sqlite3.connect(self.db_path)) as db:
            record = db.execute('SELECT status,artwork_id,reserved_cents,filename FROM image_generations WHERE id=?', (generation_id,)).fetchone()
            self.assertEqual(record, ('expired', None, 10, path.name))
        self.assertEqual(self.request('/api/artworks', self.payload(visitor_id=payload['visitor_id'], image_token=token, image_confirmed=True))[0], 409)

    def test_failed_delete_rolls_back_link_revocation_and_keeps_file(self):
        payload, row = self.create()
        generation_id, path, _ = self.attach_image(payload, row)
        with closing(sqlite3.connect(self.db_path)) as db:
            db.execute(f"CREATE TRIGGER fail_delete BEFORE DELETE ON artworks WHEN OLD.id={row['id']} BEGIN SELECT RAISE(ABORT,'test'); END")
            db.commit()
        try:
            self.assertEqual(self.request(f"/api/artworks/{row['id']}", {'visitor_id': payload['visitor_id']}, method='DELETE')[0], 503)
            self.assertEqual(self.detail(row)[0], 200)
            self.assertEqual(self.image_response(f"/api/artworks/{row['id']}/image")[0], 200)
            self.assertTrue(path.exists())
            with closing(sqlite3.connect(self.db_path)) as db:
                self.assertEqual(db.execute('SELECT status,artwork_id FROM image_generations WHERE id=?', (generation_id,)).fetchone(), ('ready', row['id']))
        finally:
            with closing(sqlite3.connect(self.db_path)) as db:
                db.execute('DROP TRIGGER fail_delete')
                db.commit()

    def test_database_failure_keeps_existing_data(self):
        payload, row = self.create()
        with closing(sqlite3.connect(self.db_path)) as db:
            db.execute('BEGIN EXCLUSIVE')
            for method, data in [('PUT', self.edit(payload, title='바뀌면 안 되는 제목')), ('DELETE', {'visitor_id': payload['visitor_id']})]:
                self.assertEqual(self.request(f"/api/artworks/{row['id']}", data, method=method)[0], 503)
        self.assertEqual(self.detail(row)[1], row)

    def test_cors_permits_management_and_private_ownership_header_only_for_dev_origins(self):
        for method in ('GET', 'PUT', 'DELETE'):
            status, _, headers = self.request('/api/artworks/1', method='OPTIONS', headers={
                'Origin': 'http://localhost:5173', 'Access-Control-Request-Method': method,
                'Access-Control-Request-Headers': 'content-type,x-visitor-id'})
            self.assertEqual(status, 200)
            self.assertEqual(headers['Access-Control-Allow-Origin'], 'http://localhost:5173')
        self.assertEqual(self.request('/api/artworks/1', method='OPTIONS', headers={
            'Origin': 'https://untrusted.example', 'Access-Control-Request-Method': 'DELETE'})[0], 400)


if __name__ == '__main__':
    unittest.main()
