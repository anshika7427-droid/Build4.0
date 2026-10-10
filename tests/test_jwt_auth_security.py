import os
import json
import jwt
from datetime import datetime, timezone, timedelta
from unittest.mock import patch, MagicMock
import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.auth import generate_token, JWT_SECRET, JWT_ALGORITHM, SECRET_TOKEN


@pytest.fixture
def client():
    fake_cursor = MagicMock()
    fake_cursor.fetchone.return_value = None
    fake_cursor.fetchall.return_value = []
    with patch("database.postgres_client.get_db_cursor") as mock_db_cursor:
        mock_db_cursor.return_value.__enter__.return_value = fake_cursor
        yield TestClient(app)


class TestJWTAuthenticationAndAuthorization:

    # 1. Valid JWT is accepted
    def test_01_valid_jwt_accepted(self, client):
        token = generate_token("vol-123", "volunteer", "vol@setu.org")
        headers = {"Authorization": f"Bearer {token}"}
        with patch("backend.routes.dashboard.get_open_needs", return_value=[]), \
             patch("backend.routes.dashboard.get_available_volunteers", return_value=[]), \
             patch("backend.routes.dashboard.get_all_volunteers", return_value=[]), \
             patch("backend.routes.dashboard.get_all_ngos", return_value=[]):
            resp = client.get("/dashboard", headers=headers)
        assert resp.status_code == 200
        assert "total_needs" in resp.json()

    # 2. Missing token returns 401 on protected endpoints
    def test_02_missing_token_returns_401(self, client):
        protected_routes = [
            ("GET", "/dashboard"),
            ("GET", "/dashboard/reports"),
            ("GET", "/volunteers"),
            ("POST", "/need"),
            ("GET", "/match"),
            ("GET", "/assignments"),
            ("PATCH", "/volunteer/status"),
        ]
        for method, route in protected_routes:
            if method == "GET":
                resp = client.get(route)
            elif method == "POST":
                resp = client.post(route, json={})
            elif method == "PATCH":
                resp = client.patch(route, json={})
            assert resp.status_code == 401, f"Expected 401 for {method} {route}, got {resp.status_code}"

    # 3. Expired, malformed, incorrectly signed, or unsupported tokens return 401
    def test_03_invalid_tokens_return_401(self, client):
        exp_payload = {"sub": "v1", "uid": "v1", "role": "volunteer", "exp": datetime.now(timezone.utc) - timedelta(hours=1)}
        exp_token = jwt.encode(exp_payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
        bad_sig_token = jwt.encode({"sub": "v1", "uid": "v1", "role": "volunteer"}, "wrong_secret_123456789012345678901234567890", algorithm=JWT_ALGORITHM)

        invalid_tokens = [
            "invalid_token_string",
            exp_token,
            bad_sig_token,
            "Bearer ",
        ]

        for token in invalid_tokens:
            resp = client.get("/dashboard", headers={"Authorization": f"Bearer {token}"})
            assert resp.status_code == 401, f"Token '{token}' should be rejected with 401"

    # 4. Missing identity or invalid role claims are rejected
    def test_04_missing_identity_or_invalid_role_rejected(self, client):
        no_uid_token = jwt.encode({"role": "volunteer"}, JWT_SECRET, algorithm=JWT_ALGORITHM)
        bad_role_token = jwt.encode({"sub": "u1", "uid": "u1", "role": "superman"}, JWT_SECRET, algorithm=JWT_ALGORITHM)

        for token in [no_uid_token, bad_role_token]:
            resp = client.get("/dashboard", headers={"Authorization": f"Bearer {token}"})
            assert resp.status_code == 401

    # 5. Invalid supplied Bearer tokens are NOT treated as anonymous on optional-auth endpoints
    def test_05_invalid_supplied_token_on_optional_auth_returns_401(self, client):
        with patch("backend.routes.ngo.get_ngo", return_value={"id": "ngo-1"}):
            # No token -> allowed (200)
            resp_anon = client.get("/ngo/ngo-1")
            assert resp_anon.status_code == 200

            # Invalid token -> MUST fail with 401
            resp_invalid = client.get("/ngo/ngo-1", headers={"Authorization": "Bearer bad_invalid_token_123"})
            assert resp_invalid.status_code == 401

    # 6. Volunteers cannot access or modify another volunteer's resources (IDOR)
    def test_06_volunteer_cannot_access_other_volunteer_resources(self, client):
        vol_a_token = generate_token("vol-A", "volunteer", "a@setu.org")
        headers = {"Authorization": f"Bearer {vol_a_token}"}

        # Volunteer A trying to view Volunteer B's assignments
        resp = client.get("/assignment/volunteer/vol-B", headers=headers)
        assert resp.status_code == 403

        # Volunteer A trying to change Volunteer B's availability
        with patch("backend.routes.volunteer.get_volunteer", return_value={"id": "vol-B", "ngo_id": None}):
            resp = client.patch("/volunteer/vol-B/availability", json={"available": False}, headers=headers)
            assert resp.status_code == 403

    # 7. NGOs cannot modify another NGO's inventory or assignments
    def test_07_ngo_cannot_modify_other_ngo_inventory_or_assignments(self, client):
        ngo_a_token = generate_token("ngo-A", "ngo", "ngoA@setu.org")
        headers = {"Authorization": f"Bearer {ngo_a_token}"}

        # NGO A trying to modify NGO B's inventory
        resp = client.post("/ngo/ngo-B/inventory", json={"resource_type": "food", "total_quantity": 100}, headers=headers)
        assert resp.status_code == 403

        # NGO A trying to view NGO B's dashboard
        resp = client.get("/ngo/ngo-B/dashboard", headers=headers)
        assert resp.status_code == 403

    # 8. Volunteers cannot execute system-only matching/allocation operations
    def test_08_volunteers_cannot_trigger_matching(self, client):
        vol_token = generate_token("vol-1", "volunteer", "vol@setu.org")
        headers = {"Authorization": f"Bearer {vol_token}"}

        resp = client.get("/match", headers=headers)
        assert resp.status_code == 403

        resp = client.get("/match/debug/need-1", headers=headers)
        assert resp.status_code == 403

    # 9. Registration cannot self-assign privileged roles or verification
    def test_09_registration_cannot_self_assign_privileged_status(self, client):
        vol_token = generate_token("vol-1", "volunteer", "vol@setu.org")
        headers = {"Authorization": f"Bearer {vol_token}"}

        with patch("backend.routes.volunteer.save_volunteer", return_value="v-new") as mock_save, \
             patch("backend.routes.volunteer.get_available_volunteers", return_value=[]):
            resp = client.post("/volunteer", json={
                "name": "Sneaky Vol", "phone": "9999999999", "location": "Delhi",
                "skills": ["medical"], "email": "sneaky@test.com", "password": "pass",
                "ngo_id": "ngo-victim", "ngo_verified": True
            }, headers=headers)
            assert resp.status_code == 200
            saved = mock_save.call_args[0][0]
            assert saved.get("ngo_id") is None
            assert saved.get("ngo_verified") is False

    # 10. Static system-token access is restricted to authorized integrations
    def test_10_static_system_token_works_for_system_role(self, client):
        headers = {"Authorization": f"Bearer {SECRET_TOKEN}"}
        with patch("backend.routes.match.get_open_needs", return_value=[]), \
             patch("backend.routes.match.get_available_volunteers", return_value=[]):
            resp = client.get("/match", headers=headers)
        assert resp.status_code == 200

    # 11. Public endpoints continue to work as intended
    def test_11_public_endpoints_accessible(self, client):
        assert client.get("/health").status_code == 200
        assert client.get("/config/public").status_code == 200
        with patch("backend.routes.ngo.get_all_ngos", return_value=[]):
            assert client.get("/ngo/list").status_code == 200

    # 12. Existing volunteer registration/login and OTP login still issue usable JWTs
    def test_12_registration_and_login_issue_valid_jwts(self, client):
        with patch("backend.routes.volunteer_auth.register_volunteer_auth", return_value={"volunteer_id": "v-100"}):
            resp = client.post("/auth/register", json={
                "email": "user100@test.com", "password": "password123",
                "name": "User 100", "phone": "9000000100",
                "location": "Delhi", "skills": ["food"]
            })
            assert resp.status_code == 200
            token = resp.json().get("token")
            assert token is not None

            with patch("backend.routes.dashboard.get_open_needs", return_value=[]), \
                 patch("backend.routes.dashboard.get_available_volunteers", return_value=[]), \
                 patch("backend.routes.dashboard.get_all_volunteers", return_value=[]), \
                 patch("backend.routes.dashboard.get_all_ngos", return_value=[]):
                dash_resp = client.get("/dashboard", headers={"Authorization": f"Bearer {token}"})
                assert dash_resp.status_code == 200

    # 13. Existing legitimate dashboard and assignment flows remain compatible
    def test_13_legitimate_flow_compatibility(self, client):
        ngo_token = generate_token("ngo-1", "ngo", "ngo@test.org")
        headers = {"Authorization": f"Bearer {ngo_token}"}

        with patch("backend.routes.ngo.get_ngo", return_value={"id": "ngo-1", "ngo_name": "Test NGO"}), \
             patch("backend.routes.ngo.get_db_cursor") as mock_db:
            cursor = MagicMock()
            cursor.fetchall.side_effect = [[], []]
            mock_db.return_value.__enter__.return_value = cursor
            resp = client.get("/ngo/ngo-1/dashboard", headers=headers)
            assert resp.status_code == 200

    # 14. Plural REST aliases correctly forward authentication and authorization
    def test_14_plural_rest_aliases_enforce_auth(self, client):
        assert client.get("/assignments").status_code == 401
        token = generate_token("v1", "volunteer", "v1@test.com")
        with patch("backend.routes.assignment.get_db_cursor") as mock_db:
            cursor = MagicMock()
            cursor.fetchall.return_value = []
            mock_db.return_value.__enter__.return_value = cursor
            resp = client.get("/assignments", headers={"Authorization": f"Bearer {token}"})
            assert resp.status_code == 200
