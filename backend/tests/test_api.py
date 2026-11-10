"""Integration tests against a real Uvicorn process and a disposable SQLite file.

Run from the repository root:
backend/.venv/Scripts/python.exe -m unittest discover -s backend/tests -v
"""

import json
import os
from contextlib import closing
from pathlib import Path
import socket
import sqlite3
import subprocess
import sys
import tempfile
import time
import unittest
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from uuid import uuid4

BACKEND = Path(__file__).resolve().parents[1]


class ArtworkApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="excuse-me-api-")
        cls.db_path = Path(cls.temp.name) / "artworks.sqlite3"
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            cls.port = sock.getsockname()[1]
        cls.base = f"http://127.0.0.1:{cls.port}"
        cls.start_server()

    @classmethod
    def start_server(cls):
        cls.process = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", getattr(cls, 'application', 'main:app'), "--host", "127.0.0.1", "--port", str(cls.port)],
            cwd=BACKEND,
            # Integration tests must never inherit a real provider key or make paid calls.
            env={**os.environ, "EXCUSE_ME_DB_PATH": str(cls.db_path), "OPENAI_API_KEY": "", "GEMINI_API_KEY": ""},
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        for _ in range(100):
            if cls.process.poll() is not None:
                raise RuntimeError("Test API server exited unexpectedly")
            try:
                with urlopen(cls.base + "/api/health", timeout=1) as response:
                    if response.status == 200:
                        return
            except (URLError, TimeoutError, ConnectionError):
                time.sleep(0.05)
        cls.stop_server()
        raise RuntimeError("Test API server did not become ready")

    @classmethod
    def stop_server(cls):
        cls.process.terminate()
        cls.process.wait(timeout=10)

    @classmethod
    def tearDownClass(cls):
        cls.stop_server()
        cls.temp.cleanup()

    def request(self, path, payload=None, method=None, headers=None):
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8") if payload is not None else None
        request = Request(self.base + path, data=raw, method=method or ("POST" if raw else "GET"),
                          headers={"Content-Type": "application/json", **(headers or {})})
        try:
            response = urlopen(request, timeout=10)
        except HTTPError as error:
            response = error
        with response:
            body = response.read()
            try:
                data = json.loads(body) if body else None
            except json.JSONDecodeError:
                data = body.decode('utf-8')
            return response.status, data, response.headers

    def payload(self, **changes):
        return {"title": "이불의 중력", "content": "오늘은 이불의 중력이 너무 강했습니다.",
                "category": "지각·조퇴", "author": "작은 예술가", "visitor_id": str(uuid4()),
                "request_id": str(uuid4()), **changes}

    def test_create_list_detail_and_storage(self):
        payload = self.payload(title="  이불의 중력  ")
        status, created, headers = self.request("/api/artworks", payload)
        self.assertEqual(status, 201)
        self.assertEqual(created["title"], "이불의 중력")
        self.assertEqual(created["created_at"], created["updated_at"])
        self.assertNotIn("visitor_id", created)
        self.assertNotIn("request_id", created)
        self.assertEqual(headers["Location"], f"/api/artworks/{created['id']}")
        self.assertEqual(self.request(headers["Location"])[1], created)
        self.assertIn(created, self.request("/api/artworks")[1])
        with closing(sqlite3.connect(self.db_path)) as db:
            stored = db.execute("SELECT visitor_id, author FROM artworks WHERE id = ?", (created["id"],)).fetchone()
        self.assertEqual(stored, (payload["visitor_id"], payload["author"]))

    def test_anonymous_optional_author(self):
        for author in (None, "", "  \n "):
            payload = self.payload()
            if author is None:
                payload.pop("author")
            else:
                payload["author"] = author
            status, created, _ = self.request("/api/artworks", payload)
            self.assertEqual(status, 201)
            self.assertEqual(created["author"], "익명의 예술가")

    def test_all_five_categories_and_no_old_values(self):
        for category in ("지각·조퇴", "휴가·병가", "약속", "운동", "기타"):
            self.assertEqual(self.request("/api/artworks", self.payload(category=category))[0], 201)
        for category in ("지각", "과제", "전체", "휴가", "지각ㆍ조퇴", "", None):
            with self.subTest(category=category):
                self.assertEqual(self.request("/api/artworks", self.payload(category=category))[0], 422)

    def test_invalid_fields_do_not_write(self):
        before = len(self.request("/api/artworks")[1])
        cases = [{"title": ""}, {"title": " \n "}, {"title": "가"}, {"title": "가" * 51},
                 {"content": ""}, {"content": " " * 20}, {"content": "가" * 9}, {"content": "가" * 301},
                 {"author": "가" * 21}, {"author": None}, {"title": 123}, {"visitor_id": ""},
                 {"visitor_id": "not-a-uuid"}, {"request_id": "bad"}, {"image": "unsupported"}]
        for change in cases:
            with self.subTest(fields=list(change)):
                status, error, _ = self.request("/api/artworks", self.payload(**change))
                self.assertEqual(status, 422)
                self.assertIn("errors", error)
        for field in ("title", "content", "category", "visitor_id"):
            payload = self.payload()
            payload.pop(field)
            self.assertEqual(self.request("/api/artworks", payload)[0], 422)
        self.assertEqual(len(self.request("/api/artworks")[1]), before)

    def test_length_boundaries_and_unicode(self):
        for length in (2, 49, 50):
            self.assertEqual(self.request("/api/artworks", self.payload(title="😀" * length))[0], 201)
        for length in (10, 299, 300):
            self.assertEqual(self.request("/api/artworks", self.payload(content="가" * length))[0], 201)
        for length in (19, 20):
            self.assertEqual(self.request("/api/artworks", self.payload(author="😀" * length))[0], 201)
        self.assertEqual(self.request("/api/artworks", self.payload(title="😀" * 51))[0], 422)
        self.assertEqual(self.request("/api/artworks", self.payload(content="😀" * 301))[0], 422)
        status, created, _ = self.request("/api/artworks", self.payload(content=" \n가나다라\n마바사아자차 \n"))
        self.assertEqual(status, 201)
        self.assertEqual(created["content"], "가나다라\n마바사아자차")

    def test_replay_after_unread_response_and_conflict(self):
        payload = self.payload()
        # Ignore the original result, as a client with a lost response would.
        self.request("/api/artworks", payload)
        status, replay, _ = self.request("/api/artworks", payload)
        self.assertEqual(status, 200)
        again = self.request("/api/artworks", payload)[1]
        self.assertEqual(replay, again)
        self.assertEqual(sum(row["id"] == replay["id"] for row in self.request("/api/artworks")[1]), 1)
        self.assertEqual(self.request("/api/artworks", {**payload, "title": "다른 제목"})[0], 409)
        self.assertEqual(self.request(f"/api/artworks/{replay['id']}")[1]["title"], payload["title"])

    def test_database_failure_rolls_back_and_retry_succeeds(self):
        payload = self.payload()
        with closing(sqlite3.connect(self.db_path)) as db:
            db.execute("BEGIN EXCLUSIVE")
            status, error, _ = self.request("/api/artworks", payload)
            self.assertEqual(status, 503)
            self.assertNotIn(str(self.db_path), json.dumps(error))
            self.assertEqual(db.execute("SELECT count(*) FROM artworks WHERE request_id = ?", (payload["request_id"],)).fetchone()[0], 0)
        self.assertEqual(self.request("/api/artworks", payload)[0], 201)

    def test_restart_persists_data_and_initializes_empty_database(self):
        payload = self.payload()
        created = self.request("/api/artworks", payload)[1]
        self.stop_server()
        self.start_server()
        self.assertEqual(self.request(f"/api/artworks/{created['id']}")[1], created)
        self.assertEqual(self.request("/api/artworks", payload)[0], 200)
        original = self.db_path
        self.stop_server()
        try:
            self.__class__.db_path = original.parent / "empty.sqlite3"
            self.start_server()
            self.assertEqual(self.request("/api/artworks")[:2], (200, []))
        finally:
            self.stop_server()
            self.__class__.db_path = original
            self.start_server()

    def test_missing_and_invalid_ids(self):
        self.assertEqual(self.request("/api/artworks/999999999")[0], 404)
        for invalid in ("0", "-1", "abc", "1.5", "999999999999999999999999999999"):
            self.assertEqual(self.request("/api/artworks/" + invalid)[0], 422)

    def test_health_cors_and_unimplemented_methods(self):
        self.assertEqual(self.request("/api/health")[:2], (200, {"status": "ok"}))
        for origin in ("http://localhost:5173", "http://127.0.0.1:5173"):
            status, _, headers = self.request("/api/artworks", method="OPTIONS", headers={
                "Origin": origin, "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            })
            self.assertEqual(status, 200)
            self.assertEqual(headers["Access-Control-Allow-Origin"], origin)
        status, _, headers = self.request("/api/artworks", method="OPTIONS", headers={
            "Origin": "https://untrusted.example", "Access-Control-Request-Method": "POST",
        })
        self.assertEqual(status, 400)
        self.assertIsNone(headers.get("Access-Control-Allow-Origin"))
        self.assertEqual(self.request("/api/artworks/1", method="PATCH")[0], 405)
        for method in ("DELETE", "PUT"):
            self.assertEqual(self.request("/api/artworks/1", method=method)[0], 422)

    def test_latest_first(self):
        first = self.request("/api/artworks", self.payload())[1]
        second = self.request("/api/artworks", self.payload())[1]
        rows = self.request("/api/artworks")[1]
        ids = [row["id"] for row in rows]
        self.assertLess(ids.index(second["id"]), ids.index(first["id"]))

    def test_exhibition_metadata_is_optional_read_only_and_keeps_original_content(self):
        payload = self.payload()
        created = self.request("/api/artworks", payload)[1]
        for field in ("refined_description", "image_url", "image_mode", "image_style"):
            self.assertIsNone(created[field])
            self.assertEqual(self.request("/api/artworks", {**self.payload(), field: "not-enabled"})[0], 422)
        # Simulate a future server-side media service, not a public edit endpoint.
        with closing(sqlite3.connect(self.db_path)) as db:
            db.execute("UPDATE artworks SET refined_description = ?, image_url = ?, image_mode = ?, image_style = ? WHERE id = ?",
                       ("원문과 별개로 저장된 작품 설명", "/media/future.png", "photo", "oil", created["id"]))
            db.commit()
        detail = self.request(f"/api/artworks/{created['id']}")[1]
        self.assertEqual(detail["content"], payload["content"])
        self.assertEqual(detail["refined_description"], "원문과 별개로 저장된 작품 설명")
        self.assertEqual(detail["image_url"], "/media/future.png")
        self.assertEqual(detail["image_mode"], "photo")
        self.assertEqual(detail["image_style"], "oil")
        self.assertIn(detail, self.request("/api/artworks")[1])
        # A replay with a different final description must not silently overwrite it.
        self.assertEqual(self.request("/api/artworks", payload)[0], 409)

    def test_curator_key_missing_and_invalid_input_do_not_block_text_donation(self):
        payload = self.payload()
        payload.pop('author')
        status, error, _ = self.request('/api/curator', payload)
        self.assertEqual(status, 503)
        self.assertEqual(error['detail'], {'code': 'curator_not_configured'})
        self.assertNotIn('titles', error)
        self.assertEqual(self.request('/api/curator', {**payload, 'content': '짧음'})[0], 422)
        self.assertEqual(self.request('/api/artworks', self.payload())[0], 201)

    def test_only_confirmed_final_description_and_title_are_saved(self):
        payload = self.payload(refined_description='사용자가 확인하고 직접 다듬은 작품 설명입니다.', description_confirmed=True)
        status, created, _ = self.request('/api/artworks', payload)
        self.assertEqual(status, 201)
        self.assertEqual(created['refined_description'], payload['refined_description'])
        self.assertEqual(created['content'], payload['content'])
        self.assertEqual(created['title'], payload['title'])
        self.assertEqual(self.request(f"/api/artworks/{created['id']}")[1], created)
        self.assertEqual(self.request('/api/artworks', payload)[0], 200)
        self.assertEqual(self.request('/api/artworks', {**payload, 'refined_description': '다르게 바꾼 최종 설명입니다.'})[0], 409)
        self.assertEqual(self.request('/api/artworks', self.payload(refined_description='확인하지 않은 설명입니다.'))[0], 422)
        self.assertEqual(self.request('/api/artworks', self.payload(refined_description='가' * 1001, description_confirmed=True))[0], 422)
        self.assertEqual(self.request('/api/artworks', self.payload(titles=['후보 하나', '후보 둘', '후보 셋']))[0], 422)
        with closing(sqlite3.connect(self.db_path)) as db:
            columns = {row[1] for row in db.execute('PRAGMA table_info(artworks)')}
        self.assertNotIn('titles', columns)
        self.assertNotIn('description_confirmed', columns)


if __name__ == "__main__":
    unittest.main()
