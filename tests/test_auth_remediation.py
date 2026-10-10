import os
import sys
import unittest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

# Ensure SECRET_TOKEN is set for test environment
os.environ.setdefault("SECRET_TOKEN", "test-secret-token-1234567890")

from backend.main import app
from backend.auth import generate_token, SECRET_TOKEN


class TestAuthRemediation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        # Generate test JWT tokens
        cls.vol_a_token = generate_token("vol_a", "volunteer", "vol_a@test.com")
        cls.vol_b_token = generate_token("vol_b", "volunteer", "vol_b@test.com")
        cls.ngo_a_token = generate_token("ngo_a", "ngo", "contact@ngoa.org")
        cls.ngo_b_token = generate_token("ngo_b", "ngo", "contact@ngob.org")
        cls.coord_token = generate_token("coord_1", "coordinator", "coord@setu.org")
        cls.system_token = SECRET_TOKEN

        cls.vol_a_headers = {"Authorization": f"Bearer {cls.vol_a_token}"}
        cls.vol_b_headers = {"Authorization": f"Bearer {cls.vol_b_token}"}
        cls.ngo_a_headers = {"Authorization": f"Bearer {cls.ngo_a_token}"}
        cls.ngo_b_headers = {"Authorization": f"Bearer {cls.ngo_b_token}"}
        cls.coord_headers = {"Authorization": f"Bearer {cls.coord_token}"}
        cls.system_headers = {"Authorization": f"Bearer {cls.system_token}"}

    # =========================================================================
    # 1. Unauthenticated Protected Write Operations Blocked (401)
    # =========================================================================
    def test_unauthenticated_inventory_endpoints_rejected(self):
        """Unauthenticated requests to modify NGO inventory must return 401."""
        payload = {"resource_type": "food", "total_quantity": 100, "unit": "meals"}
        
        # Canonical POST
        resp1 = self.client.post("/ngo/ngo_a/inventory", json=payload)
        self.assertEqual(resp1.status_code, 401)

        # Alias POST
        resp2 = self.client.post("/ngos/ngo_a/inventory", json=payload)
        self.assertEqual(resp2.status_code, 401)

        # Alias PATCH
        resp3 = self.client.patch("/ngos/ngo_a/inventory", json=payload)
        self.assertEqual(resp3.status_code, 401)

    def test_unauthenticated_volunteer_availability_rejected(self):
        """Unauthenticated requests to toggle volunteer availability must return 401."""
        payload = {"available": False}
        resp1 = self.client.patch("/volunteer/vol_a/availability", json=payload)
        self.assertEqual(resp1.status_code, 401)

        resp2 = self.client.patch("/volunteers/vol_a/availability", json=payload)
        self.assertEqual(resp2.status_code, 401)

    def test_unauthenticated_assignment_resolution_rejected(self):
        """Unauthenticated requests to resolve assignments must return 401."""
        resp1 = self.client.patch("/assignment/asgn_1/resolve")
        self.assertEqual(resp1.status_code, 401)

        resp2 = self.client.patch("/assignments/asgn_1/resolve")
        self.assertEqual(resp2.status_code, 401)

    def test_unauthenticated_assignment_claim_and_progress_rejected(self):
        """Unauthenticated task claims and progress updates must return 401."""
        resp1 = self.client.post("/assignment/volunteer/need_1")
        self.assertEqual(resp1.status_code, 401)

        resp2 = self.client.post("/assignments/asgn_1/accept")
        self.assertEqual(resp2.status_code, 401)

        resp3 = self.client.patch("/assignments/asgn_1/progress", json={"notes": "on the way"})
        self.assertEqual(resp3.status_code, 401)

        resp4 = self.client.patch("/assignments/asgn_1/dispatch")
        self.assertEqual(resp4.status_code, 401)

    def test_unauthenticated_dispatches_and_assignments_feeds_rejected(self):
        """Unauthenticated reads of sensitive dispatches and personal assignment feeds must return 401."""
        resp1 = self.client.get("/ngo/ngo_a/dispatches")
        self.assertEqual(resp1.status_code, 401)

        resp2 = self.client.get("/ngos/ngo_a/dispatches")
        self.assertEqual(resp2.status_code, 401)

        resp3 = self.client.get("/assignment/volunteer/vol_a")
        self.assertEqual(resp3.status_code, 401)

        resp4 = self.client.get("/volunteers/vol_a/assignments")
        self.assertEqual(resp4.status_code, 401)

    # =========================================================================
    # 2. Wrong-Role Rejections (403)
    # =========================================================================
    def test_volunteer_cannot_modify_ngo_inventory(self):
        """Volunteers cannot modify NGO inventory (403)."""
        payload = {"resource_type": "food", "total_quantity": 500, "unit": "meals"}
        resp = self.client.post("/ngo/ngo_a/inventory", json=payload, headers=self.vol_a_headers)
        self.assertEqual(resp.status_code, 403)
        self.assertIn("insufficient permissions", resp.json().get("detail", ""))

    def test_volunteer_cannot_trigger_matching_or_allocation(self):
        """Volunteers cannot trigger inventory allocation or coordination (403)."""
        resp1 = self.client.post("/match/allocate/need_1", headers=self.vol_a_headers)
        self.assertEqual(resp1.status_code, 403)

        resp2 = self.client.post("/match/coordinate/need_1", headers=self.vol_a_headers)
        self.assertEqual(resp2.status_code, 403)

        resp3 = self.client.get("/match", headers=self.vol_a_headers)
        self.assertEqual(resp3.status_code, 403)

    # =========================================================================
    # 3. Cross-User / BOLA Rejections (403)
    # =========================================================================
    def test_ngo_cannot_modify_another_ngo_inventory(self):
        """NGO A cannot update NGO B's inventory (403)."""
        payload = {"resource_type": "food", "total_quantity": 250, "unit": "meals"}
        resp = self.client.post("/ngo/ngo_b/inventory", json=payload, headers=self.ngo_a_headers)
        self.assertEqual(resp.status_code, 403)
        self.assertIn("cannot modify another NGO's inventory", resp.json().get("detail", ""))

    def test_ngo_cannot_view_another_ngo_dispatches(self):
        """NGO A cannot view NGO B's dispatches (403)."""
        resp = self.client.get("/ngo/ngo_b/dispatches", headers=self.ngo_a_headers)
        self.assertEqual(resp.status_code, 403)
        self.assertIn("cannot view another NGO's dispatches", resp.json().get("detail", ""))

    @patch("backend.routes.volunteer.get_volunteer")
    def test_volunteer_cannot_modify_another_volunteer_availability(self, mock_get_vol):
        """Volunteer A cannot toggle Volunteer B's availability (403)."""
        mock_get_vol.return_value = {"id": "vol_b", "name": "Volunteer B", "available": True}
        payload = {"available": False}
        resp = self.client.patch("/volunteer/vol_b/availability", json=payload, headers=self.vol_a_headers)
        self.assertEqual(resp.status_code, 403)
        self.assertIn("cannot modify another volunteer's availability", resp.json().get("detail", ""))

    def test_volunteer_cannot_claim_need_for_another_volunteer(self):
        """Volunteer A cannot claim a need on behalf of Volunteer B (403)."""
        resp = self.client.post(
            "/assignment/volunteer/need_1?volunteer_id=vol_b",
            headers=self.vol_a_headers
        )
        self.assertEqual(resp.status_code, 403)
        self.assertIn("cannot claim an assignment for another volunteer", resp.json().get("detail", ""))

    @patch("database.assignments_db.get_assignment_by_id")
    def test_volunteer_cannot_resolve_another_volunteer_assignment(self, mock_get_assign):
        """Volunteer A cannot resolve an assignment belonging to Volunteer B (403)."""
        mock_get_assign.return_value = {
            "id": "asgn_100",
            "need_id": "need_200",
            "volunteer_id": "vol_b",
            "status": "assigned",
            "resolved_at": None
        }
        resp = self.client.patch("/assignment/asgn_100/resolve", headers=self.vol_a_headers)
        self.assertEqual(resp.status_code, 403)
        self.assertIn("only resolve your own assignments", resp.json().get("detail", ""))

    # =========================================================================
    # 4. Legitimate Authorized Requests Succeed (200)
    # =========================================================================
    @patch("backend.routes.ngo.add_or_update_inventory")
    def test_ngo_can_update_own_inventory(self, mock_add_inv):
        """NGO A can update NGO A's inventory (200)."""
        mock_add_inv.return_value = "inv_123"
        payload = {"resource_type": "food", "total_quantity": 300, "unit": "meals"}
        resp = self.client.post("/ngo/ngo_a/inventory", json=payload, headers=self.ngo_a_headers)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "success")
        self.assertEqual(data["ngo_id"], "ngo_a")

    @patch("backend.routes.volunteer.get_volunteer")
    @patch("backend.routes.volunteer.update_volunteer_status")
    def test_volunteer_can_update_own_availability(self, mock_update_status, mock_get_vol):
        """Volunteer A can update their own availability (200)."""
        mock_get_vol.return_value = {"id": "vol_a", "name": "Volunteer A", "available": True}
        mock_update_status.return_value = True

        payload = {"available": False}
        resp = self.client.patch("/volunteer/vol_a/availability", json=payload, headers=self.vol_a_headers)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["available"], False)

    @patch("database.assignments_db.get_assignment_by_id")
    @patch("database.assignments_db.resolve_assignment")
    def test_volunteer_can_resolve_own_assignment(self, mock_resolve_db, mock_get_assign):
        """Volunteer A can resolve their own assignment (200)."""
        mock_get_assign.return_value = {
            "id": "asgn_100",
            "need_id": "need_200",
            "volunteer_id": "vol_a",
            "status": "assigned",
            "resolved_at": None
        }
        mock_resolve_db.return_value = True

        resp = self.client.patch("/assignment/asgn_100/resolve", headers=self.vol_a_headers)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "resolved")
        self.assertEqual(data["assignment_id"], "asgn_100")

    # =========================================================================
    # 5. Sensitive Data Masking Verification
    # =========================================================================
    @patch("backend.routes.dashboard.get_all_needs")
    @patch("backend.routes.dashboard.get_db_cursor")
    def test_dashboard_reports_masks_sensitive_data_for_unauthenticated_callers(
        self, mock_db_cursor, mock_get_needs
    ):
        """Unauthenticated GET /dashboard/reports must mask phone numbers and volunteer GPS coordinates."""
        mock_get_needs.return_value = [
            {
                "id": "need_1",
                "reporter_name": "Citizen In Distress",
                "reporter_phone": "+91 9999911111",
                "location_text": "Camp Alpha",
                "description": "Flooding",
                "lat": 11.6854,
                "lng": 76.1320
            }
        ]
        mock_cur = MagicMock()
        mock_cur.fetchall.side_effect = [
            # assignments
            [{"id": "asgn_1", "need_id": "need_1", "volunteer_id": "vol_1", "status": "assigned", "resolved_at": None}],
            # volunteers
            [{"id": "vol_1", "name": "Medic One", "phone": "+91 8888822222", "lat": 11.6890, "lng": 76.1350}]
        ]
        mock_db_cursor.return_value.__enter__.return_value = mock_cur

        # Unauthenticated request returns 401 under JWT auth
        resp_unauth = self.client.get("/dashboard/reports")
        self.assertEqual(resp_unauth.status_code, 401)

        mock_get_needs.return_value = [
            {
                "id": "need_1",
                "reporter_name": "Citizen In Distress",
                "reporter_phone": "+91 9999911111",
                "location_text": "Camp Alpha",
                "description": "Flooding",
                "lat": 11.6854,
                "lng": 76.1320
            }
        ]
        mock_cur = MagicMock()
        mock_cur.fetchall.side_effect = [
            # assignments
            [{"id": "asgn_1", "need_id": "need_1", "volunteer_id": "vol_1", "status": "assigned", "resolved_at": None}],
            # volunteers
            [{"id": "vol_1", "name": "Medic One", "phone": "+91 8888822222", "lat": 11.6890, "lng": 76.1350}]
        ]
        mock_db_cursor.return_value.__enter__.return_value = mock_cur

        resp = self.client.get("/dashboard/reports", headers=self.vol_a_headers)
        self.assertEqual(resp.status_code, 200)
        reports = resp.json()
        self.assertGreater(len(reports), 0)
        report = reports[0]

        # Sensitive phone numbers and volunteer coordinates MUST be masked (None)
        self.assertIsNone(report.get("reporter_phone"))
        self.assertIsNone(report.get("volunteer_phone"))
        self.assertIsNone(report.get("volunteer_lat"))
        self.assertIsNone(report.get("volunteer_lng"))

        # Inside assigned_volunteers array
        assigned_vols = report.get("assigned_volunteers", [])
        self.assertGreater(len(assigned_vols), 0)
        self.assertIsNone(assigned_vols[0].get("phone"))
        self.assertIsNone(assigned_vols[0].get("lat"))
        self.assertIsNone(assigned_vols[0].get("lng"))

    @patch("backend.routes.volunteer.get_volunteer")
    def test_get_single_volunteer_masks_contact_for_unauthenticated_callers(self, mock_get_vol):
        """Unauthenticated GET /volunteer/{id} returns 401 under strict JWT auth, and non-privileged token masks contact details."""
        resp_unauth = self.client.get("/volunteer/vol_1")
        self.assertEqual(resp_unauth.status_code, 401)

        mock_get_vol.return_value = {
            "id": "vol_1",
            "name": "Jane Responder",
            "skills": ["first_aid"],
            "phone": "+91 9999933333",
            "email": "jane@responder.org",
            "available": True,
            "location": "Sector 4"
        }
        resp = self.client.get("/volunteer/vol_1", headers=self.vol_a_headers)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()

        # Phone and email must NOT be present
        self.assertNotIn("phone", data)
        self.assertNotIn("email", data)
        self.assertEqual(data["name"], "Jane Responder")

    @patch("backend.routes.volunteer.get_volunteer")
    def test_get_single_volunteer_shows_contact_to_self(self, mock_get_vol):
        """Authenticated volunteer can see their own phone and email."""
        mock_get_vol.return_value = {
            "id": "vol_a",
            "name": "Volunteer A",
            "skills": ["medical"],
            "phone": "+91 9999911111",
            "email": "vol_a@test.com",
            "available": True,
            "location": "Sector 1"
        }
        resp = self.client.get("/volunteer/vol_a", headers=self.vol_a_headers)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data.get("phone"), "+91 9999911111")
        self.assertEqual(data.get("email"), "vol_a@test.com")

    @patch("backend.routes.need.get_all_needs")
    def test_list_needs_masks_reporter_phone_for_public(self, mock_get_needs):
        """Public GET /need must mask reporter_phone."""
        mock_get_needs.return_value = [
            {
                "id": "need_1",
                "reporter_name": "Citizen",
                "reporter_phone": "+91 9123456789",
                "description": "Urgent food needed",
                "lat": 11.6854,
                "lng": 76.1320
            }
        ]
        resp = self.client.get("/need")
        self.assertEqual(resp.status_code, 200)
        needs = resp.json()
        self.assertGreater(len(needs), 0)
        self.assertIsNone(needs[0].get("reporter_phone"))


if __name__ == "__main__":
    unittest.main()
