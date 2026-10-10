import os
import sys
import unittest
from unittest.mock import MagicMock, patch, call
from datetime import datetime, timezone
from psycopg2.extensions import TRANSACTION_STATUS_IDLE, TRANSACTION_STATUS_INTRANS

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from database.assignments_db import resolve_assignment
from database.inventory_db import (
    add_or_update_inventory,
    allocate_ngos_for_need,
    COMPATIBLE_RESOURCE_CATEGORIES
)
import database.postgres_client as pg_client


class TestAssignmentHardening(unittest.TestCase):
    """Verifies assignment resolution idempotency, validation, and row locking."""

    @patch("database.assignments_db.get_db_cursor")
    def test_resolve_assignment_success_first_call(self, mock_get_db_cursor):
        mock_cur = MagicMock()
        mock_get_db_cursor.return_value.__enter__.return_value = mock_cur

        # Assignment found, active status
        mock_cur.fetchone.return_value = {
            "id": "asgn_100",
            "need_id": "need_200",
            "volunteer_id": "vol_300",
            "status": "assigned",
            "resolved_at": None
        }

        res = resolve_assignment("asgn_100", "need_200", "vol_300")
        self.assertTrue(res)

        executed_queries = [call_args[0][0] for call_args in mock_cur.execute.call_args_list]
        
        # Verify row locking on assignments
        self.assertTrue(any("FOR UPDATE" in q and "assignments" in q for q in executed_queries))
        # Verify row locking on needs_reports and volunteers
        self.assertTrue(any("FOR UPDATE" in q and "needs_reports" in q for q in executed_queries))
        self.assertTrue(any("FOR UPDATE" in q and "volunteers" in q for q in executed_queries))
        # Verify assignment, need, and volunteer status updates were executed
        self.assertTrue(any("UPDATE assignments" in q for q in executed_queries))
        self.assertTrue(any("UPDATE needs_reports" in q for q in executed_queries))
        self.assertTrue(any("UPDATE volunteers" in q and "active_assignments" in q for q in executed_queries))

    @patch("database.assignments_db.get_db_cursor")
    def test_resolve_assignment_idempotent_no_double_decrement(self, mock_get_db_cursor):
        mock_cur = MagicMock()
        mock_get_db_cursor.return_value.__enter__.return_value = mock_cur

        # Assignment is ALREADY resolved
        mock_cur.fetchone.return_value = {
            "id": "asgn_100",
            "need_id": "need_200",
            "volunteer_id": "vol_300",
            "status": "resolved",
            "resolved_at": datetime.now(timezone.utc)
        }

        res = resolve_assignment("asgn_100", "need_200", "vol_300")
        self.assertTrue(res)

        executed_queries = [call_args[0][0] for call_args in mock_cur.execute.call_args_list]
        # Must fetch and lock assignment
        self.assertTrue(any("FROM assignments" in q for q in executed_queries))
        # But MUST NOT execute update on volunteers or needs_reports
        self.assertFalse(any("UPDATE volunteers" in q for q in executed_queries))
        self.assertFalse(any("UPDATE needs_reports" in q for q in executed_queries))

    @patch("database.assignments_db.get_db_cursor")
    def test_resolve_assignment_mismatched_need_id_raises(self, mock_get_db_cursor):
        mock_cur = MagicMock()
        mock_get_db_cursor.return_value.__enter__.return_value = mock_cur

        mock_cur.fetchone.return_value = {
            "id": "asgn_100",
            "need_id": "need_CORRECT",
            "volunteer_id": "vol_300",
            "status": "assigned",
            "resolved_at": None
        }

        with self.assertRaises(ValueError) as ctx:
            resolve_assignment("asgn_100", "need_WRONG", "vol_300")
        self.assertIn("Mismatched need_id", str(ctx.exception))

        executed_queries = [call_args[0][0] for call_args in mock_cur.execute.call_args_list]
        # No mutations executed
        self.assertFalse(any("UPDATE volunteers" in q for q in executed_queries))
        self.assertFalse(any("UPDATE needs_reports" in q for q in executed_queries))

    @patch("database.assignments_db.get_db_cursor")
    def test_resolve_assignment_mismatched_volunteer_id_raises(self, mock_get_db_cursor):
        mock_cur = MagicMock()
        mock_get_db_cursor.return_value.__enter__.return_value = mock_cur

        mock_cur.fetchone.return_value = {
            "id": "asgn_100",
            "need_id": "need_200",
            "volunteer_id": "vol_CORRECT",
            "status": "assigned",
            "resolved_at": None
        }

        with self.assertRaises(ValueError) as ctx:
            resolve_assignment("asgn_100", "need_200", "vol_WRONG")
        self.assertIn("Mismatched volunteer_id", str(ctx.exception))

        executed_queries = [call_args[0][0] for call_args in mock_cur.execute.call_args_list]
        self.assertFalse(any("UPDATE volunteers" in q for q in executed_queries))
        self.assertFalse(any("UPDATE needs_reports" in q for q in executed_queries))

    @patch("database.assignments_db.get_db_cursor")
    def test_resolve_assignment_not_found_raises(self, mock_get_db_cursor):
        mock_cur = MagicMock()
        mock_get_db_cursor.return_value.__enter__.return_value = mock_cur
        mock_cur.fetchone.return_value = None

        with self.assertRaises(ValueError) as ctx:
            resolve_assignment("asgn_nonexistent", "need_200", "vol_300")
        self.assertIn("not found", str(ctx.exception))


class TestInventoryHardening(unittest.TestCase):
    """Verifies inventory locking, stock constraints, and category matching."""

    def test_add_or_update_negative_quantity_raises(self):
        with self.assertRaises(ValueError) as ctx:
            add_or_update_inventory("ngo_1", "food", -10)
        self.assertIn("non-negative", str(ctx.exception))

    @patch("database.inventory_db.get_db_cursor")
    def test_add_or_update_total_below_reserved_raises(self, mock_get_db_cursor):
        mock_cur = MagicMock()
        mock_get_db_cursor.return_value.__enter__.return_value = mock_cur

        # Existing inventory has 50 units currently reserved by needs
        mock_cur.fetchone.return_value = {
            "id": "inv_1",
            "total_quantity": 100,
            "reserved_quantity": 50
        }

        # Attempt to reduce total stock to 30 (which is < 50 reserved)
        with self.assertRaises(ValueError) as ctx:
            add_or_update_inventory("ngo_1", "food", 30)
        self.assertIn("lower than currently reserved stock (50)", str(ctx.exception))

    @patch("database.inventory_db.get_db_cursor")
    def test_add_or_update_valid_total_updates_with_lock(self, mock_get_db_cursor):
        mock_cur = MagicMock()
        mock_get_db_cursor.return_value.__enter__.return_value = mock_cur

        mock_cur.fetchone.return_value = {
            "id": "inv_1",
            "total_quantity": 100,
            "reserved_quantity": 40
        }

        inv_id = add_or_update_inventory("ngo_1", "food", 120, unit="meals")
        self.assertEqual(inv_id, "inv_1")

        executed_queries = [call_args[0][0] for call_args in mock_cur.execute.call_args_list]
        # Check FOR UPDATE on SELECT
        self.assertTrue(any("FOR UPDATE" in q for q in executed_queries))
        # Check UPDATE sets total_quantity=120 and available=80 (120 - 40)
        update_calls = [c for c in mock_cur.execute.call_args_list if "UPDATE ngo_inventory" in c[0][0]]
        self.assertEqual(len(update_calls), 1)
        params = update_calls[0][0][1]
        self.assertEqual(params[0], 120)  # total_quantity
        self.assertEqual(params[1], 80)   # available_quantity

    def test_category_matching_mappings(self):
        """Verifies explicit category mapping structure and isolation."""
        self.assertIn("food", COMPATIBLE_RESOURCE_CATEGORIES)
        self.assertIn("medical", COMPATIBLE_RESOURCE_CATEGORIES)
        self.assertIn("rescue", COMPATIBLE_RESOURCE_CATEGORIES)

        food_terms = COMPATIBLE_RESOURCE_CATEGORIES["food"]
        self.assertIn("meals", food_terms)
        self.assertIn("food", food_terms)

        # Cross category isolation: medical terms must NOT overlap with food terms
        med_terms = COMPATIBLE_RESOURCE_CATEGORIES["medical"]
        self.assertNotIn("meals", med_terms)
        self.assertNotIn("food", med_terms)

    @patch("database.inventory_db.get_db_cursor")
    def test_allocate_ngos_category_fallback_scoped(self, mock_get_db_cursor):
        mock_cur = MagicMock()
        mock_get_db_cursor.return_value.__enter__.return_value = mock_cur

        # Mock need
        need_row = {
            "id": "need_test",
            "resource_type": "cooked meals",
            "required_quantity": 50,
            "fulfilled_quantity": 0,
            "lat": 12.0,
            "lng": 76.0
        }

        # First call fetches need
        # Second call fetches exact match candidates -> return empty list to trigger category fallback
        # Third call fetches category fallback candidates -> return empty list
        mock_cur.fetchone.return_value = need_row
        mock_cur.fetchall.return_value = []

        result = allocate_ngos_for_need("need_test")
        self.assertEqual(result["fulfilled_quantity"], 0)

        # Check queries executed
        executed = [c[0] for c in mock_cur.execute.call_args_list]
        # Confirm that category fallback used ANY(%s) with compatible terms instead of wildcard
        category_query_found = False
        for call_item in mock_cur.execute.call_args_list:
            sql = call_item[0][0]
            if "ANY(%s)" in sql and "LOWER(i.resource_type)" in sql:
                category_query_found = True
                terms_arg = call_item[0][1][0]
                self.assertIn("food", terms_arg)
                self.assertIn("meals", terms_arg)
                # Ensure no medical terms were injected into food query
                self.assertNotIn("medicines", terms_arg)
        self.assertTrue(category_query_found)


class TestConnectionPoolHygiene(unittest.TestCase):
    """Verifies connection pool hygiene and transaction status handling."""

    def test_cursor_read_only_rollback(self):
        """get_db_cursor(commit=False) should call conn.rollback() on normal exit."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value = mock_cursor
        mock_conn.closed = 0
        mock_conn.get_transaction_status.return_value = TRANSACTION_STATUS_IDLE

        with patch("database.postgres_client.get_db_connection") as mock_get_conn:
            mock_get_conn.return_value.__enter__.return_value = mock_conn

            with pg_client.get_db_cursor(commit=False) as cur:
                self.assertEqual(cur, mock_cursor)

            # Normal exit with commit=False should invoke rollback to keep connection IDLE
            mock_conn.rollback.assert_called_once()
            mock_conn.commit.assert_not_called()
            mock_cursor.close.assert_called_once()

    def test_cursor_commit_true(self):
        """get_db_cursor(commit=True) should call conn.commit() on normal exit."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value = mock_cursor
        mock_conn.closed = 0
        mock_conn.get_transaction_status.return_value = TRANSACTION_STATUS_IDLE

        with patch("database.postgres_client.get_db_connection") as mock_get_conn:
            mock_get_conn.return_value.__enter__.return_value = mock_conn

            with pg_client.get_db_cursor(commit=True) as cur:
                self.assertEqual(cur, mock_cursor)

            mock_conn.commit.assert_called_once()
            mock_conn.rollback.assert_not_called()
            mock_cursor.close.assert_called_once()

    def test_cursor_exception_rollback(self):
        """get_db_cursor should call conn.rollback() if an exception is raised."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value = mock_cursor
        mock_conn.closed = 0
        mock_conn.get_transaction_status.return_value = TRANSACTION_STATUS_IDLE

        with patch("database.postgres_client.get_db_connection") as mock_get_conn:
            mock_get_conn.return_value.__enter__.return_value = mock_conn

            with self.assertRaises(RuntimeError):
                with pg_client.get_db_cursor(commit=True):
                    raise RuntimeError("Something failed during DB query")

            mock_conn.rollback.assert_called_once()
            mock_cursor.close.assert_called_once()

    def test_get_db_connection_rollback_if_not_idle(self):
        """If a connection has an active transaction upon return, it must be rolled back."""
        mock_pool = MagicMock()
        mock_conn = MagicMock()
        mock_conn.closed = 0
        mock_conn.get_transaction_status.return_value = TRANSACTION_STATUS_INTRANS
        mock_pool.getconn.return_value = mock_conn

        with patch("database.postgres_client.get_pool", return_value=mock_pool):
            with pg_client.get_db_connection() as conn:
                self.assertEqual(conn, mock_conn)

            # On exit, because transaction status was INTRANS, conn.rollback() must be called
            mock_conn.rollback.assert_called_once()
            mock_pool.putconn.assert_called_once_with(mock_conn)

    def test_get_db_connection_closed_conn_returned_with_close_true(self):
        """If connection is closed/broken, putconn is called with close=True."""
        mock_pool = MagicMock()
        mock_conn = MagicMock()
        mock_conn.closed = 1  # closed
        mock_pool.getconn.return_value = mock_conn

        with patch("database.postgres_client.get_pool", return_value=mock_pool):
            with pg_client.get_db_connection() as conn:
                self.assertEqual(conn, mock_conn)

            mock_pool.putconn.assert_called_once_with(mock_conn, close=True)


if __name__ == "__main__":
    unittest.main()
