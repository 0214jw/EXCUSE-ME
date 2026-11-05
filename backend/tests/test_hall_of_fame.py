"""Monthly ranking checks use a disposable DB and a fixed server clock only."""
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
from uuid import uuid4

from fastapi import Response

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import database
import main


NOW = datetime(2026, 11, 5, tzinfo=timezone.utc)
START = datetime(2026, 10, 31, 15, tzinfo=timezone.utc)
END = datetime(2026, 11, 30, 15, tzinfo=timezone.utc)


class MonthlyHallTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory(prefix='excuse-me-monthly-hall-')
        self.addCleanup(temp.cleanup)
        path = patch.object(database, 'DB_PATH', Path(temp.name) / 'artworks.sqlite3')
        path.start()
        self.addCleanup(path.stop)
        database.initialize()
        clock = patch.object(main, 'datetime', wraps=datetime)
        self.clock = clock.start()
        self.clock.now.return_value = NOW
        self.addCleanup(clock.stop)

    def create(self, date=NOW, likes=0, id=None):
        # Fixtures are inserted only into this test's temporary database.
        with database.connection() as db:
            stamp = date.astimezone(timezone.utc).isoformat(timespec='microseconds')
            row = db.execute('''INSERT INTO artworks
                (id,title,content,category,author,visitor_id,request_id,created_at,updated_at)
                VALUES (?, '월간 테스트', '임시 DB에서만 사용하는 작품입니다.', '약속', '테스트', ?, ?, ?, ?)''',
                (id, str(uuid4()), str(uuid4()), stamp, stamp))
            artwork_id = row.lastrowid
            for _ in range(likes):
                # Lifetime likes count, even if a like was made outside this month.
                db.execute('INSERT INTO artwork_recognitions VALUES (?, ?, ?)',
                           (artwork_id, str(uuid4()), '2026-12-01T00:00:00.000000+00:00'))
        return artwork_id

    def hall(self):
        response = Response()
        rows = main.hall_of_fame(response)
        self.assertEqual(response.headers['Cache-Control'], 'no-store')
        self.clock.now.assert_called_with(timezone.utc)
        for row in rows:
            main.ArtworkOutput.model_validate(row)
        return rows

    def ids(self):
        return [row['id'] for row in self.hall()]

    def test_a_same_month_sorted_by_lifetime_like_count(self):
        low = self.create(likes=1)
        high = self.create(likes=4)
        middle = self.create(likes=2)
        self.assertEqual(self.ids(), [high, middle, low])
        self.assertEqual([row['recognition_count'] for row in self.hall()], [4, 2, 1])

    def test_b_previous_month_excluded_even_with_more_likes(self):
        self.create(START - timedelta(microseconds=1), likes=20)
        current = self.create(likes=1)
        self.assertEqual(self.ids(), [current])

    def test_c_next_month_excluded_even_with_more_likes(self):
        self.create(END, likes=20)
        current = self.create(likes=1)
        self.assertEqual(self.ids(), [current])

    def test_d_like_ties_use_earliest_registration_with_microsecond_precision(self):
        later = self.create(NOW + timedelta(microseconds=1), likes=2)
        earlier = self.create(NOW, likes=2)
        self.assertEqual(self.ids(), [earlier, later])

    def test_e_equal_registration_uses_id_ascending(self):
        self.create(id=20)
        self.create(id=4)
        self.create(id=11)
        self.assertEqual(self.ids(), [4, 11, 20])

    def test_f_more_than_ten_returns_only_top_ten(self):
        ids = [self.create(likes=count) for count in range(12)]
        self.assertEqual(self.ids(), ids[::-1][:10])

    def test_g_three_real_works_include_zero_likes_without_padding(self):
        ids = [self.create() for _ in range(3)]
        self.assertEqual(self.ids(), ids)
        self.assertTrue(all(row['recognition_count'] == 0 for row in self.hall()))

    def test_h_no_current_month_works_returns_empty_list(self):
        self.assertEqual(self.hall(), [])
        self.create(START - timedelta(days=1), likes=10)
        self.assertEqual(self.hall(), [])

    def test_i_seoul_boundaries_are_inclusive_start_exclusive_end(self):
        self.create(START - timedelta(microseconds=1))
        first = self.create(START)
        last = self.create(END - timedelta(microseconds=1))
        self.create(END)
        self.assertEqual(self.ids(), [first, last])
        # Korea has already entered November while UTC is still in October.
        self.clock.now.return_value = START
        self.assertEqual(self.ids(), [first, last])
        self.clock.now.return_value = END
        self.assertEqual(len(self.hall()), 1)

    def test_i_february_leap_year_and_december_rollover(self):
        for now, start, end in (
            ('2026-02-15', '2026-01-31T15:00:00.000000+00:00', '2026-02-28T15:00:00.000000+00:00'),
            ('2028-02-15', '2028-01-31T15:00:00.000000+00:00', '2028-02-29T15:00:00.000000+00:00'),
            ('2026-12-15', '2026-11-30T15:00:00.000000+00:00', '2026-12-31T15:00:00.000000+00:00'),
        ):
            with self.subTest(month=now):
                self.assertEqual(main.hall_month_bounds(datetime.fromisoformat(now).replace(tzinfo=timezone.utc)), (start, end))

    def test_j_read_only_ranking_preserves_artworks_and_like_add_remove(self):
        current = self.create()
        old = self.create(START - timedelta(days=1))
        visitor = str(uuid4())
        with database.connection() as db:
            before = [tuple(row) for row in db.execute('SELECT * FROM artworks ORDER BY id')]
        for artwork_id in (current, old):
            for _ in range(2):
                self.assertEqual(main.set_recognition(artwork_id, visitor, True)['recognition_count'], 1)
        self.assertEqual([(row['id'], row['recognition_count']) for row in self.hall()], [(current, 1)])
        with database.connection() as db:
            self.assertEqual([tuple(row) for row in db.execute('SELECT * FROM artworks ORDER BY id')], before)
            self.assertEqual(db.execute('SELECT count(*) FROM artwork_recognitions').fetchone()[0], 2)
        for artwork_id in (current, old):
            for _ in range(2):
                self.assertEqual(main.set_recognition(artwork_id, visitor, False)['recognition_count'], 0)
        self.assertEqual(self.hall()[0]['recognition_count'], 0)


if __name__ == '__main__':
    unittest.main()
