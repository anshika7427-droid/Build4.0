import os
import sys
import unittest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

# Ensure SECRET_TOKEN is present for test auth
os.environ.setdefault("SECRET_TOKEN", "test-secret-token-1234567890")

from backend.main import app
from ai_processing.gemini_processor import process_need_text, extract_need_deterministic
from database.inventory_db import allocate_ngos_for_need

class TestMVPGoldenPath(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.auth_headers = {"Authorization": f"Bearer {os.environ['SECRET_TOKEN']}"}

    def test_01_health_and_docs_startup(self):
        """Verify app boots, /health reports status, and /openapi.json generates."""
        resp = self.client.get("/health")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("status", data)
        self.assertIn("database", data)

        openapi_resp = self.client.get("/openapi.json")
        self.assertEqual(openapi_resp.status_code, 200)
        openapi_data = openapi_resp.json()
        self.assertIn("paths", openapi_data)
        # Check newly added and core routes exist in openapi schema
        self.assertIn("/health", openapi_data["paths"])
        self.assertIn("/need/report", openapi_data["paths"])
        self.assertIn("/match/allocate/{need_id}", openapi_data["paths"])
        self.assertIn("/match/coordinate/{need_id}", openapi_data["paths"])
        self.assertIn("/ngo/{ngo_id}/inventory", openapi_data["paths"])

    def test_02_deterministic_report_extraction(self):
        """Test plain-text emergency extraction produces structured fields."""
        text = "200 people at flood relief camp in Wayanad need cooked meals urgently"
        extracted = extract_need_deterministic(text)
        self.assertEqual(extracted["resource_type"], "food")
        self.assertEqual(extracted["quantity"], 200)
        self.assertEqual(extracted["unit"], "meals")
        self.assertIn("Wayanad", extracted["location_entity"])
        self.assertEqual(extracted["urgency"], "high")
        self.assertEqual(extracted["extraction_source"], "deterministic_fallback")

    @patch("backend.routes.need.save_need")
    def test_03_public_emergency_report_api(self, mock_save_need):
        """Test public emergency reporting accepts raw text without authentication."""
        mock_save_need.return_value = "need_test_123"
        
        payload = {
            "description": "200 people at flood relief camp in Wayanad need cooked meals urgently",
            "lat": 11.6854,
            "lng": 76.1320
        }
        resp = self.client.post("/need/report", json=payload)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["resource_type"], "food")
        self.assertEqual(data["required_quantity"], 200)
        self.assertEqual(data["unit"], "meals")
        self.assertEqual(data["id"], "need_test_123")

    def test_04_ngo_multi_allocation_120_plus_80(self):
        """Test 200 meals allocated as 120 from NGO A and 80 from NGO B."""
        # Mock database cursor for allocation
        fake_need = {
            "id": "need_200",
            "required_quantity": 200,
            "fulfilled_quantity": 0,
            "resource_type": "food",
            "lat": 11.6854,
            "lng": 76.1320,
            "status": "open"
        }
        fake_candidates = [
            {
                "inventory_id": "inv_a",
                "ngo_id": "ngo_a",
                "resource_type": "food",
                "total_quantity": 120,
                "reserved_quantity": 0,
                "available_stock": 120,
                "ngo_name": "Relief NGO A",
                "lat": 11.6854,
                "lng": 76.1320,
                "radius": 50.0,
                "verified": True
            },
            {
                "inventory_id": "inv_b",
                "ngo_id": "ngo_b",
                "resource_type": "food",
                "total_quantity": 100,
                "reserved_quantity": 0,
                "available_stock": 100,
                "ngo_name": "Relief NGO B",
                "lat": 11.2588,
                "lng": 75.7804,
                "radius": 80.0,
                "verified": True
            }
        ]

        mock_cur = MagicMock()
        mock_cur.fetchone.return_value = fake_need
        mock_cur.fetchall.return_value = fake_candidates

        with patch("database.inventory_db.get_db_cursor") as mock_get_db:
            mock_get_db.return_value.__enter__.return_value = mock_cur
            res = allocate_ngos_for_need("need_200")

        self.assertEqual(res["required_quantity"], 200)
        self.assertEqual(res["fulfilled_quantity"], 200)
        self.assertEqual(res["remaining_shortfall"], 0)
        self.assertEqual(res["status"], "matched")
        self.assertEqual(len(res["allocations"]), 2)
        # NGO A supplies 120
        self.assertEqual(res["allocations"][0]["ngo_id"], "ngo_a")
        self.assertEqual(res["allocations"][0]["allocated_quantity"], 120)
        # NGO B supplies remaining 80
        self.assertEqual(res["allocations"][1]["ngo_id"], "ngo_b")
        self.assertEqual(res["allocations"][1]["allocated_quantity"], 80)

    def test_05_insufficient_inventory_shortfall(self):
        """Test shortage preserved when inventory is less than required quantity."""
        fake_need = {
            "id": "need_500",
            "required_quantity": 500,
            "fulfilled_quantity": 0,
            "resource_type": "food",
            "lat": 11.6854,
            "lng": 76.1320,
            "status": "open"
        }
        fake_candidates = [
            {
                "inventory_id": "inv_a",
                "ngo_id": "ngo_a",
                "resource_type": "food",
                "total_quantity": 120,
                "reserved_quantity": 0,
                "available_stock": 120,
                "ngo_name": "Relief NGO A",
                "lat": 11.6854,
                "lng": 76.1320,
                "radius": 50.0,
                "verified": True
            }
        ]
        mock_cur = MagicMock()
        mock_cur.fetchone.return_value = fake_need
        mock_cur.fetchall.return_value = fake_candidates

        with patch("database.inventory_db.get_db_cursor") as mock_get_db:
            mock_get_db.return_value.__enter__.return_value = mock_cur
            res = allocate_ngos_for_need("need_500")

        self.assertEqual(res["required_quantity"], 500)
        self.assertEqual(res["fulfilled_quantity"], 120)
        self.assertEqual(res["remaining_shortfall"], 380)
        self.assertEqual(res["status"], "partially_matched")

    @patch("backend.routes.match.get_need_by_id")
    @patch("backend.routes.match.allocate_ngos_for_need")
    @patch("backend.routes.match.get_available_volunteers")
    @patch("backend.routes.match.save_assignment")
    def test_06_coordinate_golden_path_endpoint(self, mock_save_assign, mock_get_vols, mock_alloc_ngos, mock_get_need):
        """Test POST /match/coordinate/{need_id} coordinates NGOs and Volunteer."""
        mock_get_need.return_value = {
            "id": "need_demo_1",
            "description": "200 meals needed at Wayanad camp",
            "category": "supplies",
            "severity": "high",
            "lat": 11.6854,
            "lng": 76.1320
        }
        mock_alloc_ngos.return_value = {
            "status": "matched",
            "required_quantity": 200,
            "fulfilled_quantity": 200,
            "remaining_shortfall": 0,
            "allocations": [
                {"ngo_id": "ngo_a", "ngo_name": "NGO A", "allocated_quantity": 120},
                {"ngo_id": "ngo_b", "ngo_name": "NGO B", "allocated_quantity": 80}
            ]
        }
        mock_get_vols.return_value = [
            {
                "id": "vol_v1",
                "name": "Volunteer V1",
                "skills": ["supplies", "driving"],
                "lat": 11.6854,
                "lng": 76.1320,
                "ngo_verified": True,
                "available": True,
                "active_assignments": 0
            }
        ]
        mock_save_assign.return_value = "assign_doc_999"

        resp = self.client.post("/match/coordinate/need_demo_1", headers=self.auth_headers)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "coordinated")
        self.assertEqual(len(data["ngo_allocations"]), 2)
        self.assertEqual(data["ngo_allocations"][0]["allocated_quantity"], 120)
        self.assertEqual(data["ngo_allocations"][1]["allocated_quantity"], 80)
        self.assertIsNotNone(data["assigned_volunteer"])
        self.assertEqual(data["assigned_volunteer"]["volunteer_id"], "vol_v1")
        self.assertEqual(data["assigned_volunteer"]["assignment_id"], "assign_doc_999")

    @patch("database.assignments_db.get_assignment_by_id")
    @patch("database.assignments_db.resolve_assignment")
    def test_07_resolve_assignment(self, mock_resolve_db, mock_get_assign):
        """Test resolving assignment closes case and restores availability."""
        mock_get_assign.return_value = {
            "id": "assign_123",
            "need_id": "need_123",
            "volunteer_id": "vol_123",
            "status": "assigned",
            "resolved_at": None
        }
        mock_resolve_db.return_value = True

        resp = self.client.patch("/assignment/assign_123/resolve", headers=self.auth_headers)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "resolved")
        self.assertEqual(data["assignment_id"], "assign_123")

if __name__ == "__main__":
    unittest.main()
