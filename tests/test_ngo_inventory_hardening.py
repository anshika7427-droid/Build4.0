import os
import sys
import unittest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from backend.main import app
from backend.auth import generate_token
from database.inventory_db import (
    validate_resource_unit,
    add_or_update_inventory,
    get_ngo_inventory,
)


class TestNGOInventoryHardening(unittest.TestCase):
    """Regression tests for NGO inventory updates, unit validation, foreign key guards, and authorization."""

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        # Auth tokens
        cls.admin_token = generate_token("admin_user", "admin", "admin@setu.local")
        cls.ngo_a_token = generate_token("ngo_a_123", "ngo", "ngo_a@setu.local")
        cls.ngo_b_token = generate_token("ngo_b_456", "ngo", "ngo_b@setu.local")
        cls.vol_token = generate_token("vol_789", "volunteer", "vol@setu.local")

        cls.admin_headers = {"Authorization": f"Bearer {cls.admin_token}"}
        cls.ngo_a_headers = {"Authorization": f"Bearer {cls.ngo_a_token}"}
        cls.ngo_b_headers = {"Authorization": f"Bearer {cls.ngo_b_token}"}
        cls.vol_headers = {"Authorization": f"Bearer {cls.vol_token}"}

    def test_unit_validation_helper(self):
        """Test unit validation rules directly."""
        # Food / Meals
        valid, _ = validate_resource_unit("food", "meals")
        self.assertTrue(valid)
        valid, _ = validate_resource_unit("food", "packets")
        self.assertTrue(valid)
        valid, err = validate_resource_unit("food", "liters")
        self.assertFalse(valid)
        self.assertIn("Incompatible unit", err)
        self.assertIn("meals", err)

        # Water
        valid, _ = validate_resource_unit("water", "liters")
        self.assertTrue(valid)
        valid, _ = validate_resource_unit("water", "bottles")
        self.assertTrue(valid)
        valid, err = validate_resource_unit("water", "meals")
        self.assertFalse(valid)
        self.assertIn("Incompatible unit", err)

        # Medical & Shelter
        valid, _ = validate_resource_unit("medical", "kits")
        self.assertTrue(valid)
        valid, _ = validate_resource_unit("shelter", "tents")
        self.assertTrue(valid)

    @patch("backend.routes.ngo.get_ngo")
    @patch("backend.routes.ngo.add_or_update_inventory")
    @patch("backend.routes.ngo.get_ngo_inventory")
    def test_valid_food_meals_update(self, mock_get_inv, mock_add_or_update, mock_get_ngo):
        """Test a valid food/meals update succeeds with HTTP 200."""
        mock_get_ngo.return_value = {"id": "ngo_a_123", "ngo_name": "Test NGO"}
        mock_add_or_update.return_value = "inv_uuid_100"

        payload = {"resource_type": "food", "total_quantity": 250, "unit": "meals"}
        resp = self.client.post("/ngos/ngo_a_123/inventory", json=payload, headers=self.admin_headers)

        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "success")
        self.assertEqual(data["resource_type"], "food")
        self.assertEqual(data["total_quantity"], 250)
        self.assertEqual(data["unit"], "meals")

    def test_incompatible_unit_rejected_with_4xx_not_500(self):
        """Test food/meals with unit 'liters' is rejected with HTTP 400/422, never HTTP 500."""
        payload = {"resource_type": "food", "total_quantity": 1234, "unit": "liters"}
        resp = self.client.post("/ngos/ngo_a_123/inventory", json=payload, headers=self.admin_headers)

        self.assertNotEqual(resp.status_code, 500)
        self.assertIn(resp.status_code, [400, 422])
        err_msg = str(resp.json())
        self.assertIn("Incompatible unit", err_msg)
        self.assertIn("meals", err_msg)

    @patch("backend.routes.ngo.add_or_update_inventory")
    def test_unknown_ngo_id_returns_404_not_500(self, mock_add_or_update):
        """Test unknown NGO ID returns HTTP 404 rather than ForeignKeyViolation HTTP 500."""
        mock_add_or_update.side_effect = LookupError("NGO 'unknown_ngo_999' not found")

        # POST inventory for non-existent NGO
        post_resp = self.client.post(
            "/ngos/unknown_ngo_999/inventory",
            json={"resource_type": "food", "total_quantity": 500, "unit": "meals"},
            headers=self.admin_headers,
        )
        self.assertEqual(post_resp.status_code, 404)
        self.assertIn("not found", post_resp.json()["detail"].lower())

    @patch("backend.routes.ngo.get_ngo")
    @patch("backend.routes.ngo.add_or_update_inventory")
    def test_ngo_with_no_existing_inventory_initialization(self, mock_add_or_update, mock_get_ngo):
        """Test initializing stock for an existing NGO with no prior inventory records."""
        mock_get_ngo.return_value = {"id": "ngo_a_123", "ngo_name": "Test NGO"}
        mock_add_or_update.return_value = "new_inv_id_001"

        payload = {"resource_type": "water", "total_quantity": 1000, "unit": "liters"}
        resp = self.client.post("/ngos/ngo_a_123/inventory", json=payload, headers=self.ngo_a_headers)

        self.assertEqual(resp.status_code, 200)
        mock_add_or_update.assert_called_once_with("ngo_a_123", "water", 1000, "liters")

    @patch("backend.routes.ngo.get_ngo")
    def test_unauthorized_cross_ngo_inventory_update(self, mock_get_ngo):
        """Test NGO B cannot update NGO A's inventory (HTTP 403), and volunteer cannot update (HTTP 403)."""
        mock_get_ngo.return_value = {"id": "ngo_a_123", "ngo_name": "Test NGO"}

        payload = {"resource_type": "food", "total_quantity": 100, "unit": "meals"}

        # NGO B attempting to modify NGO A
        resp_b = self.client.post("/ngos/ngo_a_123/inventory", json=payload, headers=self.ngo_b_headers)
        self.assertEqual(resp_b.status_code, 403)
        self.assertIn("cannot modify another", resp_b.json()["detail"].lower())

        # Volunteer attempting to modify NGO A
        resp_vol = self.client.post("/ngos/ngo_a_123/inventory", json=payload, headers=self.vol_headers)
        self.assertEqual(resp_vol.status_code, 403)
        self.assertIn("insufficient permissions", resp_vol.json()["detail"].lower())

        # Unauthenticated request (HTTP 401)
        resp_unauth = self.client.post("/ngos/ngo_a_123/inventory", json=payload)
        self.assertEqual(resp_unauth.status_code, 401)

    @patch("backend.routes.ngo.get_ngo")
    @patch("backend.routes.ngo.add_or_update_inventory")
    def test_database_failure_handling(self, mock_add_or_update, mock_get_ngo):
        """Test database exception during inventory update is caught cleanly with informative 500 error."""
        mock_get_ngo.return_value = {"id": "ngo_a_123", "ngo_name": "Test NGO"}
        mock_add_or_update.side_effect = Exception("Database connection lost")

        payload = {"resource_type": "food", "total_quantity": 200, "unit": "meals"}
        resp = self.client.post("/ngos/ngo_a_123/inventory", json=payload, headers=self.admin_headers)

        self.assertEqual(resp.status_code, 500)
        self.assertIn("Database error updating inventory", resp.json()["detail"])

    @patch("database.inventory_db.get_db_cursor")
    def test_database_layer_lookup_error_for_missing_ngo(self, mock_get_db_cursor):
        """Test add_or_update_inventory raises LookupError when NGO is not in ngos table."""
        mock_cur = MagicMock()
        mock_get_db_cursor.return_value.__enter__.return_value = mock_cur
        mock_cur.fetchone.return_value = None  # NGO not found

        with self.assertRaises(LookupError) as ctx:
            add_or_update_inventory("non_existent_ngo", "food", 100, "meals")
        self.assertIn("not found", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
