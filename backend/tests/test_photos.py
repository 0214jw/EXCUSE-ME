"""Real photo decoding and CRUD against disposable DB/files; no provider calls."""
from contextlib import closing
from io import BytesIO
import asyncio
from http.client import HTTPConnection
import json
import os
from pathlib import Path
import secrets
import sqlite3
import sys
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen
from uuid import uuid4

from fastapi import HTTPException, Response
from starlette.requests import Request as ASGIRequest
from PIL import Image
import test_api

sys.path.insert(0, str(test_api.BACKEND))
import database
import main
import photos


def image_bytes(format='PNG', color='red'):
    stream = BytesIO()
    Image.new('RGB', (12, 8), color).save(stream, format=format)
    return stream.getvalue()


class PhotoTests(unittest.TestCase):
    setUpClass = classmethod(test_api.ArtworkApiTests.setUpClass.__func__)
    tearDownClass = classmethod(test_api.ArtworkApiTests.tearDownClass.__func__)
    stop_server = classmethod(test_api.ArtworkApiTests.stop_server.__func__)
    request = test_api.ArtworkApiTests.request
    payload = test_api.ArtworkApiTests.payload

    @classmethod
    def start_server(cls):
        cls.photo_dir = Path(cls.temp.name) / 'photos'
        with patch.dict(os.environ, {'EXCUSE_ME_PHOTO_DIR': str(cls.photo_dir), 'EXCUSE_ME_IMAGE_DIR': str(Path(cls.temp.name) / 'paintings'),
                                     'OPENAI_IMAGE_ENABLED': '0', 'OPENAI_API_KEY': ''}):
            test_api.ArtworkApiTests.start_server.__func__(cls)

    def setUp(self):
        with closing(sqlite3.connect(self.db_path)) as db:
            db.execute('PRAGMA foreign_keys=ON')
            for table in ('photo_cleanup', 'photo_uploads', 'image_generations', 'artworks'):
                db.execute('DELETE FROM ' + table)
            db.commit()
        if self.photo_dir.exists():
            self.assertTrue(self.photo_dir.resolve().is_relative_to(Path(self.temp.name).resolve()))
            for path in self.photo_dir.iterdir():
                if path.is_file(): path.unlink()
        self.visitor = str(uuid4())

    def upload(self, raw=None, name='사진.png', mime='image/png', visitor=None, request_id=None, token=None):
        raw = image_bytes() if raw is None else raw
        request = Request(self.base + '/api/photo-uploads', data=raw, method='POST', headers={
            'Content-Type': mime, 'X-File-Name': quote(name), 'X-Visitor-ID': visitor or self.visitor,
            'X-Upload-ID': request_id or str(uuid4()), 'X-Upload-Token': token or secrets.token_urlsafe(32)})
        try: response = urlopen(request, timeout=10)
        except HTTPError as error: response = error
        with response: return response.status, json.load(response), response.headers

    def donate(self, **changes):
        status, upload, _ = self.upload()
        self.assertEqual(status, 201)
        payload = self.payload(visitor_id=self.visitor, photo_token=upload['photo_token'], **changes)
        status, row, _ = self.request('/api/artworks', payload)
        self.assertEqual(status, 201)
        return payload, row

    def image(self, row):
        with urlopen(self.base + row['image_url']) as response: return response.read(), response.headers

    def photo_path(self, row):
        with closing(sqlite3.connect(self.db_path)) as db:
            name = db.execute('SELECT filename FROM photo_uploads WHERE artwork_id=?', (row['id'],)).fetchone()[0]
        return self.photo_dir / name

    def edit(self, payload, **changes):
        return {k: v for k, v in {**payload, **changes}.items()
                if k in ('title','content','category','author','visitor_id','refined_description','photo_token')}

    def test_jpg_png_webp_original_bytes_and_safe_filename(self):
        for format, extension, mime in [('JPEG','jpg','image/jpeg'), ('JPEG','jpeg','image/jpeg'), ('PNG','png','image/png'), ('WEBP','webp','image/webp')]:
            raw = image_bytes(format)
            status, uploaded, _ = self.upload(raw, 'original name.' + extension, mime)
            self.assertEqual(status, 201)
            payload = self.payload(visitor_id=self.visitor, photo_token=uploaded['photo_token'])
            status, row, _ = self.request('/api/artworks', payload)
            self.assertEqual(status, 201)
            self.assertEqual(row['artwork_type'], 'photo')
            self.assertEqual(row['image_mode'], 'photo')
            self.assertEqual(row['image_url'], f"/api/artworks/{row['id']}/image")
            fetched, headers = self.image(row)
            self.assertEqual(fetched, raw)
            self.assertEqual(headers['Content-Type'], mime)
            self.assertEqual(headers['X-Content-Type-Options'], 'nosniff')
            self.assertRegex(self.photo_path(row).name, r'^[a-f0-9]{32}\.(jpg|png|webp)$')
            self.assertNotIn(str(self.photo_dir), str(row))

    def test_oversize_invalid_extension_mime_nonimage_truncation_and_traversal(self):
        # Header rejection before sending 5MB avoids a client-side broken pipe
        # when the server correctly rejects an oversized body immediately.
        connection = HTTPConnection('127.0.0.1', self.port, timeout=10)
        connection.putrequest('POST', '/api/photo-uploads')
        for key, value in {'Content-Type':'image/png','Content-Length':str(photos.MAX_BYTES+1),
                           'X-File-Name':'large.png','X-Visitor-ID':self.visitor,
                           'X-Upload-ID':str(uuid4()),'X-Upload-Token':secrets.token_urlsafe(32)}.items():
            connection.putheader(key,value)
        connection.endheaders()
        response = connection.getresponse()
        self.assertEqual(response.status,413)
        response.read(); connection.close()
        async def receive():
            return {'type':'http.request','body':b'x'*(photos.MAX_BYTES+1),'more_body':False}
        request = ASGIRequest({'type':'http','method':'POST','headers':[(b'content-type',b'image/png')]},receive)
        with self.assertRaises(HTTPException) as streamed:
            asyncio.run(photos.upload_photo(request,Response(),self.visitor,str(uuid4()),secrets.token_urlsafe(32),'large.png'))
        self.assertEqual(streamed.exception.status_code,413)
        cases = [(image_bytes(),'x.gif','image/gif',422),
                 (b'<svg/>','x.svg','image/svg+xml',422), (b'MZ executable','x.exe','image/png',422),
                 (b'not an image','x.png','image/png',422), (image_bytes()[:25],'truncated.png','image/png',422),
                 (image_bytes(),'x.jpg','image/jpeg',422), (image_bytes(),'x.png','image/jpeg',422),
                 (image_bytes(),'../outside.png','image/png',422), (image_bytes(),'..\\outside.png','image/png',422), (b'','empty.png','image/png',413)]
        for raw, name, mime, expected in cases:
            status, error, _ = self.upload(raw, name, mime)
            self.assertEqual(status, expected, name)
            self.assertIsInstance(error['detail'], str)
        self.assertFalse(self.photo_dir.exists() and list(self.photo_dir.iterdir()))

    def test_private_until_donation_and_idempotent_upload_and_donation(self):
        request_id, token, raw = str(uuid4()), secrets.token_urlsafe(32), image_bytes()
        first = self.upload(raw, request_id=request_id, token=token)
        again = self.upload(raw, request_id=request_id, token=token)
        self.assertEqual((first[0], again[0]), (201, 200))
        self.assertEqual(first[1], again[1])
        self.assertEqual(self.request('/api/artworks')[1], [])
        self.assertIsNone(self.request('/api/artworks/random')[1])
        self.assertEqual(self.request('/api/hall-of-fame')[1], [])
        self.assertEqual(len(list(self.photo_dir.iterdir())), 1)
        self.assertEqual(self.upload(image_bytes(color='blue'), request_id=request_id, token=token)[0], 409)
        payload = self.payload(visitor_id=self.visitor, photo_token=token)
        row = self.request('/api/artworks', payload)[1]
        self.assertEqual(self.request('/api/artworks', payload)[:2], (200, row))
        self.assertEqual(self.request('/api/artworks', self.payload(visitor_id=self.visitor, photo_token=token))[0], 409)

    def test_metadata_edit_without_replacement_preserves_image_description_and_votes(self):
        payload, row = self.donate(refined_description='텍스트에서 생성하고 확인한 작품 설명입니다.', description_confirmed=True)
        raw, _ = self.image(row)
        path = self.photo_path(row)
        self.request(f"/api/artworks/{row['id']}/recognition", {'visitor_id': self.visitor}, method='PUT')
        edit = self.edit(payload, title='사진의 새 제목')
        edit.pop('photo_token'); edit.pop('refined_description')
        status, updated, _ = self.request(f"/api/artworks/{row['id']}", edit, method='PUT')
        self.assertEqual(status, 200)
        self.assertEqual(updated['refined_description'], payload['refined_description'])
        self.assertEqual(updated['recognition_count'], 1)
        self.assertEqual(updated['created_at'], row['created_at'])
        self.assertEqual(self.image(updated)[0], raw)
        self.assertTrue(path.exists())

    def test_replacement_cleans_old_file_after_commit_and_preserves_other_work(self):
        payload, row = self.donate()
        _, other = self.donate()
        old, other_path = self.photo_path(row), self.photo_path(other)
        raw = image_bytes('WEBP', 'blue')
        token = self.upload(raw, 'new.webp', 'image/webp')[1]['photo_token']
        update = self.edit(payload, photo_token=token)
        status, updated, _ = self.request(f"/api/artworks/{row['id']}", update, method='PUT')
        self.assertEqual(status, 200)
        self.assertEqual(self.image(updated)[0], raw)
        self.assertFalse(old.exists())
        self.assertTrue(other_path.exists())
        self.assertEqual(self.request(f"/api/artworks/{row['id']}", update, method='PUT')[0], 200)
        self.assertTrue(self.photo_path(row).exists())

    def test_delete_cascades_votes_and_cleans_only_owned_managed_photo(self):
        _, row = self.donate()
        _, other = self.donate()
        path, other_path = self.photo_path(row), self.photo_path(other)
        legacy = self.photo_dir / 'existing-user-upload.png'
        legacy.write_bytes(b'existing file outside the managed ledger')
        self.request(f"/api/artworks/{row['id']}/recognition", {'visitor_id': self.visitor}, method='PUT')
        self.assertEqual(self.request(f"/api/artworks/{row['id']}", {'visitor_id': self.visitor}, method='DELETE')[0], 204)
        self.assertFalse(path.exists())
        self.assertTrue(other_path.exists())
        self.assertTrue(legacy.exists())
        self.assertEqual(self.request(row['image_url'])[0], 404)
        with closing(sqlite3.connect(self.db_path)) as db:
            self.assertEqual(db.execute('SELECT count(*) FROM artwork_recognitions WHERE artwork_id=?', (row['id'],)).fetchone()[0], 0)

    def test_photo_likes_hall_random_and_restart_persistence(self):
        _, row = self.donate()
        for _ in range(2):
            self.assertEqual(self.request(f"/api/artworks/{row['id']}/recognition", {'visitor_id': self.visitor}, method='PUT')[1]['recognition_count'], 1)
        self.assertEqual(self.request('/api/hall-of-fame')[1][0]['image_url'], row['image_url'])
        self.assertEqual(self.request('/api/artworks?order=popular')[1][0]['artwork_type'], 'photo')
        self.assertEqual(self.request('/api/artworks/random')[1]['image_mode'], 'photo')
        self.stop_server(); self.start_server()
        self.assertEqual(self.request(f"/api/artworks/{row['id']}")[1]['recognition_count'], 1)
        self.assertEqual(self.image(row)[0], image_bytes())

    def test_missing_or_corrupted_photo_does_not_erase_artwork_information(self):
        _, row = self.donate()
        path = self.photo_path(row)
        path.write_bytes(b'changed bytes')
        self.assertEqual(self.request(row['image_url'])[0], 503)
        self.assertEqual(self.request(f"/api/artworks/{row['id']}")[1]['title'], row['title'])
        path.unlink()
        self.assertEqual(self.request(row['image_url'])[0], 503)
        self.assertEqual(self.request(f"/api/artworks/{row['id']}")[0], 200)

    def test_owner_capability_mixed_mode_and_text_compatibility(self):
        payload, row = self.donate()
        original = self.photo_path(row)
        stranger = str(uuid4())
        self.assertEqual(self.request('/api/artworks', self.payload(visitor_id=stranger, photo_token=payload['photo_token']))[0], 409)
        self.assertEqual(self.request(f"/api/artworks/{row['id']}", self.edit(payload, visitor_id=stranger), method='PUT')[0], 403)
        self.assertEqual(self.request(f"/api/artworks/{row['id']}", {'visitor_id': stranger}, method='DELETE')[0], 403)
        self.assertEqual(self.request('/api/artworks', self.payload(visitor_id=self.visitor, photo_token=payload['photo_token'], image_token=secrets.token_urlsafe(32), image_confirmed=True))[0], 422)
        text_payload = self.payload(visitor_id=self.visitor)
        text = self.request('/api/artworks', text_payload)[1]
        self.assertEqual(text['artwork_type'], 'text')
        self.assertEqual(self.request(f"/api/artworks/{text['id']}", self.edit(text_payload, photo_token=payload['photo_token']), method='PUT')[0], 422)
        self.assertTrue(original.exists())

    def test_upload_database_failure_removes_new_file_without_creating_artwork(self):
        with closing(sqlite3.connect(self.db_path)) as db:
            db.execute("CREATE TRIGGER fail_upload AFTER INSERT ON photo_uploads BEGIN SELECT RAISE(ABORT,'test'); END"); db.commit()
        try:
            self.assertEqual(self.upload()[0], 503)
            self.assertEqual(list(self.photo_dir.iterdir()), [])
            self.assertEqual(self.request('/api/artworks')[1], [])
        finally:
            with closing(sqlite3.connect(self.db_path)) as db:
                db.execute('DROP TRIGGER fail_upload'); db.commit()

    def test_donation_failure_keeps_staged_photo_for_explicit_retry(self):
        token = self.upload()[1]['photo_token']
        payload = self.payload(visitor_id=self.visitor, photo_token=token)
        with closing(sqlite3.connect(self.db_path)) as db:
            db.execute("CREATE TRIGGER fail_donate AFTER INSERT ON artworks BEGIN SELECT RAISE(ABORT,'test'); END"); db.commit()
        try:
            self.assertEqual(self.request('/api/artworks', payload)[0], 503)
            self.assertEqual(len(list(self.photo_dir.iterdir())), 1)
        finally:
            with closing(sqlite3.connect(self.db_path)) as db:
                db.execute('DROP TRIGGER fail_donate'); db.commit()
        self.assertEqual(self.request('/api/artworks', payload)[0], 201)

    def test_failed_replace_and_delete_roll_back_before_file_cleanup(self):
        payload, row = self.donate()
        old = self.photo_path(row)
        token = self.upload(image_bytes(color='blue'))[1]['photo_token']
        for sql, name, method, data in [('AFTER UPDATE OF image_url ON artworks','fail_replace','PUT',self.edit(payload,photo_token=token)),
                                        ('AFTER DELETE ON artworks','fail_delete','DELETE',{'visitor_id':self.visitor})]:
            with closing(sqlite3.connect(self.db_path)) as db:
                db.execute(f"CREATE TRIGGER {name} {sql} WHEN OLD.id={row['id']} BEGIN SELECT RAISE(ABORT,'test'); END"); db.commit()
            try:
                self.assertEqual(self.request(f"/api/artworks/{row['id']}", data, method=method)[0], 503)
                self.assertTrue(old.exists())
                self.assertEqual(self.image(row)[0], image_bytes())
                with closing(sqlite3.connect(self.db_path)) as db:
                    self.assertEqual(db.execute('SELECT count(*) FROM photo_cleanup').fetchone()[0], 0)
            finally:
                with closing(sqlite3.connect(self.db_path)) as db:
                    db.execute('DROP TRIGGER ' + name); db.commit()

    def test_disk_failure_pixel_limit_and_animation_rejection(self):
        with patch.object(database,'DB_PATH',self.db_path), patch.object(photos,'STORAGE',self.photo_dir):
            self.photo_dir.mkdir(exist_ok=True)
            blocker = self.photo_dir / 'not-a-directory'
            blocker.write_bytes(b'keep')
            with patch.object(photos,'STORAGE',blocker):
                with self.assertRaises(HTTPException) as failure:
                    photos.persist_upload(image_bytes(),'photo.png','image/png',self.visitor,str(uuid4()),secrets.token_urlsafe(32))
                self.assertEqual(failure.exception.status_code,503)
            with patch.object(photos,'MAX_PIXELS',1):
                with self.assertRaises(HTTPException): photos.validate(image_bytes(),'photo.png','image/png')
            stream = BytesIO()
            Image.new('RGB',(12,8),'red').save(stream,format='WEBP',save_all=True,append_images=[Image.new('RGB',(12,8),'blue')],duration=100)
            self.assertEqual(self.upload(stream.getvalue(),'animated.webp','image/webp')[0],422)
            self.assertEqual(self.request('/api/artworks')[1],[])

    def test_cleanup_failure_is_durable_and_active_other_photo_is_protected(self):
        _, row = self.donate()
        _, other = self.donate()
        old, active = self.photo_path(row), self.photo_path(other)
        unlink = Path.unlink
        def fail_old(path, *args, **kwargs):
            if path == old: raise PermissionError('simulated locked file')
            return unlink(path, *args, **kwargs)
        with patch.object(database,'DB_PATH',self.db_path), patch.object(photos,'STORAGE',self.photo_dir):
            with patch.object(Path,'unlink',fail_old):
                result = main.delete_artwork(row['id'],main.ArtworkDelete(visitor_id=self.visitor))
                self.assertEqual(result.status_code,204)
                self.assertEqual(result.headers['X-Photo-Cleanup'],'pending')
                self.assertTrue(old.exists())
            with closing(sqlite3.connect(self.db_path)) as db:
                db.execute('INSERT OR IGNORE INTO photo_cleanup VALUES (?)',(active.name,)); db.commit()
            self.assertTrue(photos.cleanup_pending())
            self.assertFalse(old.exists())
            self.assertTrue(active.exists())
        self.assertEqual(self.request(f"/api/artworks/{row['id']}")[0],404)

    def test_expired_staged_upload_cleanup_and_cors(self):
        _, row = self.donate()
        linked = self.photo_path(row)
        token = self.upload()[1]['photo_token']
        with closing(sqlite3.connect(self.db_path)) as db:
            db.execute('UPDATE photo_uploads SET expires_at=0 WHERE artwork_id IS NULL'); db.commit()
        self.assertEqual(self.request('/api/artworks',self.payload(visitor_id=self.visitor,photo_token=token))[0],410)
        with patch.object(database,'DB_PATH',self.db_path), patch.object(photos,'STORAGE',self.photo_dir):
            self.assertFalse(photos.cleanup_pending())
            for name in ('../x.png','/tmp/x.png','..\\x.jpg'):
                with self.assertRaises(OSError): photos.file_path(name)
        self.assertTrue(linked.exists())
        self.assertEqual(len(list(self.photo_dir.iterdir())),1)
        status, _, _ = self.request('/api/photo-uploads',method='OPTIONS',headers={
            'Origin':'http://localhost:5173','Access-Control-Request-Method':'POST',
            'Access-Control-Request-Headers':'content-type,x-visitor-id,x-upload-id,x-upload-token,x-file-name'})
        self.assertEqual(status,200)


if __name__ == '__main__': unittest.main()
