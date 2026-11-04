"""Non-destructive migration tests using the original Phase 2 schema."""

import importlib.util
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("tested_database", Path(__file__).resolve().parents[1] / "database.py")
database = importlib.util.module_from_spec(spec)
spec.loader.exec_module(database)

LEGACY_SCHEMA = """
    CREATE TABLE artworks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL CHECK(length(title) BETWEEN 2 AND 50),
        content TEXT NOT NULL CHECK(length(content) BETWEEN 10 AND 300),
        category TEXT NOT NULL CHECK(category IN ('지각·조퇴', '휴가·병가', '약속', '운동', '기타')),
        author TEXT NOT NULL CHECK(length(author) BETWEEN 1 AND 20),
        visitor_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        request_id TEXT NOT NULL,
        UNIQUE(visitor_id, request_id)
    )
"""
LEGACY_ROW = (42, "기존 작품", "이전에 기증한 작품의 원문 핑계입니다.", "약속", "기존 작가",
              "fb504ced-8f18-4af9-b5da-e633efc7c516", "2026-11-02T00:00:00+00:00",
              "2026-11-02T00:00:00+00:00", "ea91fae7-0fc2-4eda-a09b-919f93aa4ddd")


class ExhibitionMigrationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="excuse-me-migration-")
        self.path_patch = patch.object(database, "DB_PATH", Path(self.temp.name) / "legacy.sqlite3")
        self.path_patch.start()
        with database.connection() as db:
            db.execute(LEGACY_SCHEMA)
            db.execute("INSERT INTO artworks VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", LEGACY_ROW)

    def tearDown(self):
        self.path_patch.stop()
        self.temp.cleanup()

    def test_additive_migration_preserves_legacy_data_and_constraints(self):
        database.initialize()
        with database.connection() as db:
            row = db.execute("SELECT * FROM artworks WHERE id = 42").fetchone()
            self.assertEqual(tuple(row)[:9], LEGACY_ROW)
            self.assertTrue(all(row[key] is None for key in database.EXHIBITION_COLUMNS))
            with self.assertRaises(sqlite3.IntegrityError):
                db.execute("INSERT INTO artworks (title, content, category, author, visitor_id, created_at, updated_at, request_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", LEGACY_ROW[1:])
            self.assertEqual(db.execute("SELECT count(*) FROM artworks").fetchone()[0], 1)
            self.assertEqual(db.execute("SELECT seq FROM sqlite_sequence WHERE name = 'artworks'").fetchone()[0], 42)

    def test_repeated_startup_preserves_refined_copy_and_future_media(self):
        database.initialize()
        with database.connection() as db:
            db.execute("UPDATE artworks SET refined_description = ?, image_url = ?, image_mode = ?, image_style = ? WHERE id = 42",
                       ("큐레이터가 다듬은 설명", "/media/future-artwork.png", "generated", "watercolor"))
        database.initialize()
        database.initialize()
        with database.connection() as db:
            row = db.execute("SELECT * FROM artworks WHERE id = 42").fetchone()
            self.assertEqual(tuple(row)[:9], LEGACY_ROW)
            self.assertEqual(row["refined_description"], "큐레이터가 다듬은 설명")
            self.assertEqual(row["image_mode"], "generated")
            self.assertEqual(row["image_style"], "watercolor")
            self.assertEqual(row["image_url"], "/media/future-artwork.png")
            self.assertEqual(len(db.execute("PRAGMA table_info(artworks)").fetchall()), 13)

    def test_photo_tables_are_additive_and_repeated_startup_preserves_legacy_work(self):
        database.initialize()
        with database.connection() as db:
            before = tuple(db.execute('SELECT * FROM artworks WHERE id=42').fetchone())
            self.assertEqual(db.execute('SELECT count(*) FROM photo_uploads').fetchone()[0], 0)
            self.assertEqual(db.execute('SELECT count(*) FROM photo_cleanup').fetchone()[0], 0)
        database.initialize()
        with database.connection() as db:
            self.assertEqual(tuple(db.execute('SELECT * FROM artworks WHERE id=42').fetchone()), before)
            self.assertEqual(len(db.execute('PRAGMA table_info(artworks)').fetchall()), 13)

    def test_failed_migration_rolls_back_all_added_columns(self):
        with patch.object(database, "EXHIBITION_COLUMNS", {"refined_description": "TEXT", "broken": "INVALID ("}):
            with self.assertRaises(sqlite3.Error):
                database.initialize()
        with database.connection() as db:
            self.assertEqual(tuple(db.execute("SELECT * FROM artworks WHERE id = 42").fetchone()), LEGACY_ROW)
            self.assertEqual(len(db.execute("PRAGMA table_info(artworks)").fetchall()), 9)

    def test_recognition_migration_is_additive_unique_and_cascades(self):
        database.initialize()
        with database.connection() as db:
            self.assertEqual(tuple(db.execute('SELECT * FROM artworks WHERE id=42').fetchone())[:9], LEGACY_ROW)
            db.execute("INSERT INTO artwork_recognitions VALUES(42,'demo','2026-11-04')")
        database.initialize()
        with database.connection() as db:
            self.assertEqual(db.execute('SELECT count(*) FROM artwork_recognitions').fetchone()[0], 1)
            with self.assertRaises(sqlite3.IntegrityError):
                db.execute("INSERT INTO artwork_recognitions VALUES(42,'demo','2026-11-04')")
            with self.assertRaises(sqlite3.IntegrityError):
                db.execute("INSERT INTO artwork_recognitions VALUES(999,'demo','2026-11-04')")
            db.execute('DELETE FROM artworks WHERE id=42')
            self.assertEqual(db.execute('SELECT count(*) FROM artwork_recognitions').fetchone()[0], 0)


if __name__ == "__main__":
    unittest.main()
