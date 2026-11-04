"""File-backed SQLite storage. Runtime database files must never be committed."""

import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

CATEGORIES = ("지각·조퇴", "휴가·병가", "약속", "운동", "기타")
# Nullable exhibition metadata only. Existing text works remain text works;
# NULL never means that generation/upload has happened.
EXHIBITION_COLUMNS = {
    "refined_description": "TEXT",
    "image_url": "TEXT",
    "image_mode": "TEXT CHECK(image_mode IN ('generated', 'photo'))",
    # Open style identifier: watercolor/oil/pointillism/pencil/collage, extensible later.
    "image_style": "TEXT",
}
DB_PATH = Path(os.environ.get("EXCUSE_ME_DB_PATH") or (
    Path(__file__).resolve().parent.parent / "database" / "excuse_me.sqlite3"
)).resolve()


@contextmanager
def connection():
    db = sqlite3.connect(DB_PATH, timeout=2)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    try:
        with db:
            yield db
    finally:
        db.close()


def initialize():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with connection() as db:
        # Serialize startup migrations and roll back all column additions on failure.
        db.execute("BEGIN IMMEDIATE")
        db.execute("""
            CREATE TABLE IF NOT EXISTS artworks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL CHECK(length(title) BETWEEN 2 AND 50),
                content TEXT NOT NULL CHECK(length(content) BETWEEN 10 AND 300),
                category TEXT NOT NULL CHECK(category IN
                    ('지각·조퇴', '휴가·병가', '약속', '운동', '기타')),
                author TEXT NOT NULL CHECK(length(author) BETWEEN 1 AND 20),
                visitor_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                request_id TEXT NOT NULL,
                UNIQUE(visitor_id, request_id)
            )
        """)
        existing = {row["name"] for row in db.execute("PRAGMA table_info(artworks)")}
        for name, definition in EXHIBITION_COLUMNS.items():
            if name not in existing:
                # Names/definitions come exclusively from the static map above.
                db.execute(f"ALTER TABLE artworks ADD COLUMN {name} {definition}")
        # Private generation ledger: previews are not public artworks. Reservations
        # survive restarts and failures, so retrying cannot silently reset costs.
        db.execute("""
            CREATE TABLE IF NOT EXISTS image_generations (
                id TEXT PRIMARY KEY, visitor_id TEXT NOT NULL, request_id TEXT NOT NULL,
                client_hash TEXT NOT NULL, context_hash TEXT NOT NULL,
                token_hash TEXT NOT NULL UNIQUE, style TEXT NOT NULL,
                status TEXT NOT NULL CHECK(status IN ('pending', 'ready', 'failed', 'expired')),
                created_at REAL NOT NULL, expires_at REAL NOT NULL,
                reserved_cents INTEGER NOT NULL, filename TEXT, digest TEXT,
                artwork_id INTEGER UNIQUE REFERENCES artworks(id),
                UNIQUE(visitor_id, request_id)
            )
        """)
        # Additive migration: one demo recognition per artwork and visitor.
        # Deleting an artwork cascades inside its existing DB transaction.
        db.execute("""
            CREATE TABLE IF NOT EXISTS artwork_recognitions (
                artwork_id INTEGER NOT NULL REFERENCES artworks(id) ON DELETE CASCADE,
                visitor_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                PRIMARY KEY (artwork_id, visitor_id)
            )
        """)
        db.execute("""
            CREATE TABLE IF NOT EXISTS photo_uploads (
                id TEXT PRIMARY KEY, visitor_id TEXT NOT NULL, request_id TEXT NOT NULL,
                token_hash TEXT NOT NULL UNIQUE, filename TEXT NOT NULL UNIQUE,
                digest TEXT NOT NULL, media_type TEXT NOT NULL, size INTEGER NOT NULL,
                created_at REAL NOT NULL, expires_at REAL NOT NULL,
                status TEXT NOT NULL CHECK(status IN ('ready','linked','retired')),
                artwork_id INTEGER UNIQUE REFERENCES artworks(id) ON DELETE SET NULL,
                UNIQUE(visitor_id, request_id)
            )
        """)
        db.execute("CREATE TABLE IF NOT EXISTS photo_cleanup (filename TEXT PRIMARY KEY)")
