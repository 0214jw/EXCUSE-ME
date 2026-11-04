"""Original-photo uploads, private until donated. Never calls an AI provider."""
import hashlib
from io import BytesIO
import os
from pathlib import Path
import re
import sqlite3
import threading
import time
from typing import Annotated
from urllib.parse import unquote
from uuid import uuid4
import warnings

from fastapi import APIRouter, Header, HTTPException, Request, Response
from PIL import Image, UnidentifiedImageError
from pydantic import UUID4
from starlette.concurrency import run_in_threadpool

from database import connection

router = APIRouter()
MAX_BYTES = 5 * 1024 * 1024
MAX_PIXELS = 40_000_000
STORAGE = Path(os.environ.get('EXCUSE_ME_PHOTO_DIR') or (
    Path(__file__).resolve().parent.parent / 'uploads' / 'photos'
)).resolve()
FORMATS = {'JPEG': ('image/jpeg', '.jpg'), 'PNG': ('image/png', '.png'), 'WEBP': ('image/webp', '.webp')}
EXTENSIONS = {'.jpg': 'JPEG', '.jpeg': 'JPEG', '.png': 'PNG', '.webp': 'WEBP'}
decode_slots = threading.BoundedSemaphore(2)


def file_path(filename):
    if not re.fullmatch(r'[0-9a-f]{32}\.(jpg|png|webp)', filename or ''):
        raise OSError('Invalid managed photo name')
    path = STORAGE / filename
    if path.is_symlink() or path.resolve().parent != STORAGE:
        raise OSError('Invalid managed photo path')
    return path


def validate(raw, encoded_name, content_type):
    if not raw or len(raw) > MAX_BYTES:
        raise HTTPException(413, '사진은 비어 있지 않은 5MB 이하 파일이어야 합니다.')
    try:
        name = unquote(encoded_name, errors='strict')
    except (UnicodeError, ValueError):
        raise HTTPException(422, '사진 파일 이름을 확인해 주세요.') from None
    if len(name) > 255 or re.search(r'[\\/:\x00-\x1f\x7f]', name):
        raise HTTPException(422, '폴더 경로가 포함되지 않은 사진 파일을 선택해 주세요.')
    expected = EXTENSIONS.get(Path(name).suffix.lower())
    if not expected:
        raise HTTPException(422, 'JPG, JPEG, PNG, WEBP 사진만 업로드할 수 있습니다.')
    if not decode_slots.acquire(blocking=False):
        raise HTTPException(429, '다른 사진을 확인하는 중입니다. 잠시 후 다시 시도해 주세요.')
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(BytesIO(raw), formats=list(FORMATS)) as image:
                actual = image.format
                if actual != expected or image.width * image.height > MAX_PIXELS or getattr(image, 'n_frames', 1) != 1:
                    raise ValueError('Unsupported image')
                image.verify()
            with Image.open(BytesIO(raw), formats=list(FORMATS)) as image:
                image.load()  # Reject truncated data, not just an image signature.
        media_type, extension = FORMATS[actual]
        if content_type.split(';', 1)[0].lower() not in (media_type, 'application/octet-stream'):
            raise ValueError('MIME mismatch')
        return media_type, extension
    except (OSError, ValueError, SyntaxError, EOFError, UnidentifiedImageError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise HTTPException(422, '사진을 읽을 수 없습니다. 실제 JPG·PNG·WEBP 정지 이미지인지 확인해 주세요. 최대 4천만 화소까지 지원합니다.') from None
    finally:
        decode_slots.release()


def read_photo(row):
    try:
        path = file_path(row['filename'])
        if path.stat().st_size != row['size'] or row['size'] > MAX_BYTES:
            raise OSError('Changed photo size')
        raw = path.read_bytes()
        if hashlib.sha256(raw).hexdigest() != row['digest']:
            raise OSError('Changed photo bytes')
        return raw
    except OSError:
        raise HTTPException(503, '사진 파일을 불러올 수 없습니다. 작품 정보는 보존되어 있습니다.') from None


def persist_upload(raw, filename, content_type, visitor, request_id, token):
    media_type, extension = validate(raw, filename, content_type)
    digest = hashlib.sha256(raw).hexdigest()
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    new_path = None
    created = False
    try:
        with connection() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT * FROM photo_uploads WHERE visitor_id=? AND request_id=?', (visitor, request_id)).fetchone()
            if row:
                if row['digest'] != digest or row['token_hash'] != token_hash or row['status'] == 'retired':
                    raise HTTPException(409, '이미 사용한 사진 업로드 번호입니다. 선택한 사진과 저장 결과를 확인해 주세요.')
                if row['artwork_id'] is None and row['expires_at'] < time.time():
                    raise HTTPException(410, '사진 기증 가능 시간이 지났습니다. 사진을 다시 선택해 주세요.')
                read_photo(row)
                is_new = False
            else:
                STORAGE.mkdir(parents=True, exist_ok=True)
                name = uuid4().hex + extension
                new_path = file_path(name)
                with new_path.open('xb') as stream:
                    created = True
                    stream.write(raw)
                    stream.flush()
                    os.fsync(stream.fileno())
                now = time.time()
                db.execute('''INSERT INTO photo_uploads
                    (id,visitor_id,request_id,token_hash,filename,digest,media_type,size,created_at,expires_at,status)
                    VALUES (?,?,?,?,?,?,?,?,?,?,'ready')''',
                           (str(uuid4()), visitor, request_id, token_hash, name, digest, media_type, len(raw), now, now + 86400))
                row = db.execute('SELECT * FROM photo_uploads WHERE visitor_id=? AND request_id=?', (visitor, request_id)).fetchone()
                is_new = True
        return {'photo_token': token, 'expires_at': int(row['expires_at'] * 1000),
                'media_type': row['media_type'], 'size': row['size']}, is_new
    except Exception as error:
        if created and new_path is not None:
            try:
                new_path.unlink(missing_ok=True)
            except OSError:
                pass  # Private orphan only; never publish a failed upload.
        if isinstance(error, OSError):
            raise HTTPException(503, '사진을 저장하지 못했습니다. 입력 내용은 유지됩니다. 잠시 후 다시 시도해 주세요.') from None
        raise


def donation_photo(db, data, artwork_id=None):
    token = data.get('photo_token')
    if not token:
        return None
    row = db.execute('SELECT * FROM photo_uploads WHERE token_hash=? AND visitor_id=?',
                     (hashlib.sha256(token.encode()).hexdigest(), data['visitor_id'])).fetchone()
    if not row or row['status'] == 'retired' or (row['artwork_id'] is not None and row['artwork_id'] != artwork_id):
        raise HTTPException(409, '이 작품에 사용할 수 없는 사진입니다. 사진 선택과 저장 결과를 확인해 주세요.')
    if row['artwork_id'] is None and row['expires_at'] < time.time():
        raise HTTPException(410, '사진 기증 가능 시간이 지났습니다. 사진을 다시 선택해 주세요.')
    read_photo(row)
    return row


def retire_photo(db, artwork_id):
    row = db.execute('SELECT filename FROM photo_uploads WHERE artwork_id=?', (artwork_id,)).fetchone()
    if row:
        db.execute("UPDATE photo_uploads SET artwork_id=NULL,status='retired' WHERE artwork_id=?", (artwork_id,))
        db.execute('INSERT OR IGNORE INTO photo_cleanup(filename) VALUES (?)', (row['filename'],))


def link_photo(db, photo, artwork_id):
    if photo['artwork_id'] != artwork_id:
        retire_photo(db, artwork_id)
        db.execute("UPDATE photo_uploads SET artwork_id=?,status='linked' WHERE id=?", (artwork_id, photo['id']))
    db.execute("UPDATE artworks SET image_url=?,image_mode='photo',image_style=NULL WHERE id=?",
               (f'/api/artworks/{artwork_id}/image', artwork_id))


def cleanup_pending():
    """After commit only. Delete exclusively retired, server-managed photo names."""
    try:
        with connection() as db:
            db.execute('BEGIN IMMEDIATE')
            expired = db.execute("SELECT id,filename FROM photo_uploads WHERE status='ready' AND artwork_id IS NULL AND expires_at<?", (time.time(),)).fetchall()
            for row in expired:
                db.execute("UPDATE photo_uploads SET status='retired' WHERE id=?", (row['id'],))
                db.execute('INSERT OR IGNORE INTO photo_cleanup VALUES (?)', (row['filename'],))
            for job in db.execute('SELECT filename FROM photo_cleanup LIMIT 50').fetchall():
                name = job['filename']
                safe = db.execute("SELECT 1 FROM photo_uploads WHERE filename=? AND status='retired' AND artwork_id IS NULL", (name,)).fetchone()
                if not safe or db.execute('SELECT 1 FROM photo_uploads WHERE filename=? AND artwork_id IS NOT NULL', (name,)).fetchone():
                    continue
                try:
                    file_path(name).unlink(missing_ok=True)
                except OSError:
                    continue
                db.execute('DELETE FROM photo_cleanup WHERE filename=?', (name,))
            return db.execute('SELECT count(*) FROM photo_cleanup').fetchone()[0] > 0
    except sqlite3.Error:
        return True  # The durable job remains; never roll back a successful donation.


@router.post('/api/photo-uploads')
async def upload_photo(request: Request, response: Response,
                       visitor: Annotated[UUID4, Header(alias='X-Visitor-ID')],
                       request_id: Annotated[UUID4, Header(alias='X-Upload-ID')],
                       token: Annotated[str, Header(alias='X-Upload-Token', pattern=r'^[A-Za-z0-9_-]{43}$')],
                       filename: Annotated[str, Header(alias='X-File-Name', max_length=4096)]):
    length = request.headers.get('content-length')
    if length and (not length.isdigit() or len(length) > 10 or int(length) > MAX_BYTES):
        raise HTTPException(413, '사진은 5MB 이하로 선택해 주세요.')
    raw = bytearray()
    async for chunk in request.stream():
        if len(raw) + len(chunk) > MAX_BYTES:
            raise HTTPException(413, '사진은 5MB 이하로 선택해 주세요.')
        raw.extend(chunk)
    result, is_new = await run_in_threadpool(persist_upload, bytes(raw), filename,
                                            request.headers.get('content-type', ''), str(visitor), str(request_id), token)
    response.status_code = 201 if is_new else 200
    response.headers['Cache-Control'] = 'no-store'
    await run_in_threadpool(cleanup_pending)
    return result
