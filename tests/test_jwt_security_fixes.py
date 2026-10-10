import os
import json
import jwt
from datetime import datetime, timezone, timedelta
from unittest.mock import patch, MagicMock
import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.auth import generate_token, JWT_SECRET, JWT_ALGORITHM


@pytest.fixture
def client():
    fake_cursor = MagicMock()
    fake_cursor.fetchone.return_value = None
    fake_cursor.fetchall.return_value = []
    with patch("database.postgres_client.get_db_cursor") as mock_db_cursor:
        mock_db_cursor.return_value.__enter__.return_value = fake_cursor
        yield TestClient(app)


class TestJWTSecurityFixes:

    # --- 1. SYSTEM-TOKEN SECURITY ---

    def test_missing_secret_token_no_predictable_fallback(self, client):
        """Historical fallback value 'setu_legacy_system_token_2026' must be rejected when SECRET_TOKEN is not set."""
        with patch("backend.auth.SECRET_TOKEN", None):
            headers = {"Authorization": "Bearer setu_legacy_system_token_2026"}
            resp = client.get("/dashboard", headers=headers)
            assert resp.status_code == 401
            assert "Invalid token" in resp.json().get("detail", "")

    def test_historical_fallback_token_rejected(self, client):
        """Predictable/insecure historical token strings must be rejected."""
        historical_fallbacks = [
            "setu_legacy_system_token_2026",
            "change_me_use_a_long_random_string",
            "secret",
            "123456",
        ]
        with patch("backend.auth.SECRET_TOKEN", "valid_configured_secret_token_999"):
            for fallback in historical_fallbacks:
                headers = {"Authorization": f"Bearer {fallback}"}
                resp = client.get("/dashboard", headers=headers)
                assert resp.status_code == 401

    def test_system_credential_restricted_to_intended_operations(self, client):
        """Valid configured system token yields role='system'."""
        with patch("backend.auth.SECRET_TOKEN", "my_valid_system_secret_token_888"):
            headers = {"Authorization": "Bearer my_valid_system_secret_token_888"}
            with patch("backend.routes.match.get_open_needs", return_value=[]), \
                 patch("backend.routes.match.get_available_volunteers", return_value=[]):
                resp = client.get("/match", headers=headers)
                assert resp.status_code == 200

    def test_system_token_cannot_impersonate_volunteer_identity(self, client):
        """System token caller cannot pass a volunteer identity header to impersonate a volunteer on volunteer routes."""
        with patch("backend.auth.SECRET_TOKEN", "my_valid_system_secret_token_888"):
            headers = {"Authorization": "Bearer my_valid_system_secret_token_888"}
            # System token trying to update own volunteer status (restricted to role='volunteer')
            resp = client.patch("/volunteer/status", json={"available": False}, headers=headers)
            assert resp.status_code == 403

    def test_jwt_auth_works_when_system_token_disabled(self, client):
        """Normal JWT authentication works even if SECRET_TOKEN is None/disabled."""
        with patch("backend.auth.SECRET_TOKEN", None):
            vol_token = generate_token("vol-55", "volunteer", "vol55@test.com")
            headers = {"Authorization": f"Bearer {vol_token}"}
            with patch("backend.routes.dashboard.get_open_needs", return_value=[]), \
                 patch("backend.routes.dashboard.get_available_volunteers", return_value=[]), \
                 patch("backend.routes.dashboard.get_all_volunteers", return_value=[]), \
                 patch("backend.routes.dashboard.get_all_ngos", return_value=[]):
                resp = client.get("/dashboard", headers=headers)
                assert resp.status_code == 200

    # --- 2. MATCHING AUTHORIZATION & RESOURCE PERMISSIONS ---

    def test_matching_unauthenticated_returns_401(self, client):
        """Unauthenticated calls to all /match routes must return 401."""
        assert client.get("/match").status_code == 401
        assert client.get("/match/debug/need-1").status_code == 401
        assert client.post("/match/allocate/need-1").status_code == 401
        assert client.post("/match/coordinate/need-1").status_code == 401

    def test_volunteer_jwt_rejected_on_matching_routes_with_403(self, client):
        """Volunteer role calling any /match endpoint must receive 403 Forbidden."""
        vol_token = generate_token("vol-1", "volunteer", "vol1@test.com")
        headers = {"Authorization": f"Bearer {vol_token}"}

        resp_match = client.get("/match", headers=headers)
        assert resp_match.status_code == 403
        assert "Access denied" in resp_match.json().get("detail", "")

        resp_debug = client.get("/match/debug/need-1", headers=headers)
        assert resp_debug.status_code == 403

        resp_alloc = client.post("/match/allocate/need-1", headers=headers)
        assert resp_alloc.status_code == 403

        resp_coord = client.post("/match/coordinate/need-1", headers=headers)
        assert resp_coord.status_code == 403

    def test_authorized_ngo_access_allowed_on_matching_routes(self, client):
        """Authorized NGO caller (role='ngo') is permitted on matching operations."""
        ngo_token = generate_token("ngo-100", "ngo", "contact@ngo100.org")
        headers = {"Authorization": f"Bearer {ngo_token}"}

        with patch("backend.routes.match.get_open_needs", return_value=[]), \
             patch("backend.routes.match.get_available_volunteers", return_value=[]):
            resp_match = client.get("/match", headers=headers)
            assert resp_match.status_code == 200

        with patch("backend.routes.match.get_need_by_id", return_value={"id": "need-1", "category": "food", "severity": "medium"}), \
             patch("backend.routes.match.get_available_volunteers", return_value=[]):
            resp_debug = client.get("/match/debug/need-1", headers=headers)
            assert resp_debug.status_code == 200

        with patch("backend.routes.match.allocate_ngos_for_need", return_value={"allocated": True}):
            resp_alloc = client.post("/match/allocate/need-1", headers=headers)
            assert resp_alloc.status_code == 200

        with patch("backend.routes.match.allocate_ngos_for_need", return_value={"allocations": [], "status": "matched"}), \
             patch("backend.routes.match.get_need_by_id", return_value={"id": "need-1"}), \
             patch("backend.routes.match.get_available_volunteers", return_value=[]), \
             patch("backend.routes.match.find_best_volunteer", return_value=None):
            resp_coord = client.post("/match/coordinate/need-1", headers=headers)
            assert resp_coord.status_code == 200

    def test_system_and_admin_access_allowed_on_matching_routes(self, client):
        """System or admin role caller is permitted on matching operations."""
        for role_name in ["system", "admin"]:
            sys_token = generate_token("sys-admin", role_name, f"{role_name}@setu.gov")
            headers = {"Authorization": f"Bearer {sys_token}"}

            with patch("backend.routes.match.allocate_ngos_for_need", return_value={"allocated": True}):
                resp_alloc = client.post("/match/allocate/need-1", headers=headers)
                assert resp_alloc.status_code == 200

    def test_unauthorized_ngo_access_rejections(self, client):
        """
        Tests rejection of unauthorized NGO interactions:
        1. Tampered/malformed NGO token returns 401.
        2. NGO attempting to modify another NGO's inventory returns 403.
        """
        # 1. Tampered JWT secret
        bad_token = jwt.encode({"sub": "ngo-100", "uid": "ngo-100", "role": "ngo"}, "wrong_secret_key_12345678901234567890", algorithm="HS256")
        resp_bad = client.get("/match", headers={"Authorization": f"Bearer {bad_token}"})
        assert resp_bad.status_code == 401

        # 2. NGO 100 attempting to modify NGO 200 inventory
        ngo100_token = generate_token("ngo-100", "ngo", "ngo100@test.com")
        headers = {"Authorization": f"Bearer {ngo100_token}"}
        resp_other_inv = client.post(
            "/ngo/ngo-200/inventory",
            json={"resource_type": "food", "total_quantity": 50, "unit": "kg"},
            headers=headers
        )
        assert resp_other_inv.status_code == 403
        assert "cannot modify another NGO's inventory" in resp_other_inv.json().get("detail", "")

    def test_ngo_inventory_read_permissions(self, client):
        """
        Tests read authorization policy on GET /ngo/{ngo_id}/inventory:
        - Owning NGO (uid == ngo_id): 200 OK.
        - Other NGO (uid != ngo_id): 403 Forbidden.
        - Volunteer: 403 Forbidden.
        - System / Admin: 200 OK.
        """
        ngo100_token = generate_token("ngo-100", "ngo", "ngo100@test.com")
        ngo200_token = generate_token("ngo-200", "ngo", "ngo200@test.com")
        vol_token = generate_token("vol-1", "volunteer", "vol1@test.com")
        sys_token = generate_token("sys-1", "system", "sys@setu.gov")

        with patch("backend.routes.ngo.get_ngo_inventory", return_value=[]):
            # 1. Owning NGO -> 200
            resp_own = client.get("/ngo/ngo-100/inventory", headers={"Authorization": f"Bearer {ngo100_token}"})
            assert resp_own.status_code == 200

            # 2. Other NGO -> 403
            resp_other = client.get("/ngo/ngo-100/inventory", headers={"Authorization": f"Bearer {ngo200_token}"})
            assert resp_other.status_code == 403
            assert "cannot view another NGO's inventory" in resp_other.json().get("detail", "")

            # 3. Volunteer -> 403
            resp_vol = client.get("/ngo/ngo-100/inventory", headers={"Authorization": f"Bearer {vol_token}"})
            assert resp_vol.status_code == 403

            # 4. System caller -> 200
            resp_sys = client.get("/ngo/ngo-100/inventory", headers={"Authorization": f"Bearer {sys_token}"})
            assert resp_sys.status_code == 200

    def test_failed_matching_auth_prevents_side_effects(self, client):
        """Failed authorization on matching routes must execute zero allocation functions or side-effects."""
        vol_token = generate_token("vol-1", "volunteer", "vol1@test.com")
        headers = {"Authorization": f"Bearer {vol_token}"}

        with patch("backend.routes.match.allocate_ngos_for_need") as mock_alloc, \
             patch("backend.routes.match.save_assignment") as mock_save:
            resp = client.post("/match/coordinate/need-1", headers=headers)
            assert resp.status_code == 403
            mock_alloc.assert_not_called()
            mock_save.assert_not_called()

    # --- 3. WEBSOCKET SECURITY ---

    def test_websocket_valid_jwt_connects(self, client):
        """Valid JWT connects to WebSocket."""
        token = generate_token("vol-1", "volunteer", "vol1@test.com")
        with client.websocket_connect(f"/ws?token={token}") as ws:
            assert ws is not None

    def test_websocket_expired_token_rejected(self, client):
        """Expired JWT to WebSocket is rejected with code 1008."""
        import starlette.websockets
        exp_payload = {"sub": "v1", "uid": "v1", "role": "volunteer", "exp": datetime.now(timezone.utc) - timedelta(hours=1)}
        exp_token = jwt.encode(exp_payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

        with pytest.raises(starlette.websockets.WebSocketDisconnect) as exc_info:
            with client.websocket_connect(f"/ws?token={exp_token}"):
                pass
        assert exc_info.value.code == 1008

    def test_websocket_malformed_token_rejected(self, client):
        """Malformed token to WebSocket is rejected with code 1008."""
        import starlette.websockets
        with pytest.raises(starlette.websockets.WebSocketDisconnect) as exc_info:
            with client.websocket_connect("/ws?token=not.a.valid.jwt"):
                pass
        assert exc_info.value.code == 1008

    def test_websocket_unsupported_role_rejected(self, client):
        """Token with unsupported role to WebSocket is rejected with code 1008."""
        import starlette.websockets
        bad_role_token = jwt.encode({"sub": "u1", "uid": "u1", "role": "unsupported_role"}, JWT_SECRET, algorithm=JWT_ALGORITHM)

        with pytest.raises(starlette.websockets.WebSocketDisconnect) as exc_info:
            with client.websocket_connect(f"/ws?token={bad_role_token}"):
                pass
        assert exc_info.value.code == 1008

    def test_websocket_insecure_fallback_token_rejected(self, client):
        """Historical fallback token strings to WebSocket are rejected."""
        import starlette.websockets
        with patch("backend.auth.SECRET_TOKEN", "valid_configured_secret_token_999"):
            with pytest.raises(starlette.websockets.WebSocketDisconnect) as exc_info:
                with client.websocket_connect("/ws?token=setu_legacy_system_token_2026"):
                    pass
            assert exc_info.value.code == 1008
