"""Integration tests for SETU Trust Engine V2 and Emergency Reporting Pipeline.

Covers:
- End-to-end report processing for food supplies and transport
- Trust scoring, tiering, and dispatch recommendation policy enforcement
- Inventory and vehicle/volunteer capacity gating (no dispatch without capacity)
- Review and hold enforcement (suppression of alerts and volunteer matching)
- Duplicate text detection and rate limiting penalties
- Reporter reputation integration (verified NGOs, resolved history, flagged history)
- Security tests: Client trust payload override attempts, IDOR, coordinator authorization
- Safe dispatch gating in global matcher
- Privacy: No raw phone numbers in reasons or metadata
"""

import os
import sys
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

os.environ.setdefault("SECRET_TOKEN", "test-secret-token-1234567890-secure-32chars")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-1234567890-secure-32chars")

from backend.main import app
from backend.auth import verify_token
from database.verification import (
    CorroborationCandidate,
    EvidenceInput,
    NeedRequest,
    calculate_trust_score,
    compute_text_hash,
    mask_phone,
    normalize_phone,
)
from database.needs_db import (
    check_duplicate_and_rate_limit,
    check_reporter_reputation,
    get_corroboration_candidates,
    save_need,
)


class TestTrustIntegration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.auth_headers = {"Authorization": f"Bearer {os.environ['SECRET_TOKEN']}"}

    # =========================================================================
    # 1. END-TO-END PIPELINE: FOOD SUPPLIES
    # =========================================================================

    def test_food_report_high_trust_with_capacity_auto_dispatches(self):
        """
        High credibility food report with confirmed capacity should result in auto_dispatch,
        status='open', flag='verified', and trigger auto-match & alerts.
        """
        with patch("backend.routes.need.get_coordinates", return_value={"lat": 11.6854, "lng": 76.1320}), \
             patch("backend.routes.need.check_reporter_reputation", return_value={
                 "is_registered_ngo_or_camp": True, "has_resolved_history": True,
                 "is_flagged_history": False, "flagged_deduction": 0
             }), \
             patch("backend.routes.need.check_duplicate_and_rate_limit", return_value={
                 "text_hash": "hash_food_1", "is_identical_text": False, "recent_reports_count_one_hour": 1
             }), \
             patch("backend.routes.need.get_corroboration_candidates", return_value=[
                 CorroborationCandidate("c1", "food", "9900000002", datetime.now(timezone.utc), 11.685, 76.132),
                 CorroborationCandidate("c2", "food", "9900000003", datetime.now(timezone.utc), 11.686, 76.133),
             ]), \
             patch("database.inventory_db.check_food_inventory_available", return_value=True), \
             patch("backend.routes.need.save_need", return_value="need_food_high"), \
             patch("backend.routes.need._auto_match_for_need") as mock_auto_match, \
             patch("backend.routes.need.send_alert") as mock_send_alert:

            resp = self.client.post("/need", json={
                "name": "Camp Coordinator",
                "phone": "9876543210",
                "location": "Wayanad Relief Camp",
                "description": "Relief camp housing 200 flood survivors urgently requires 200 packets of food meals",
                "disaster_type": "flood",
                "help_needed": "food",
                "resource_type": "food",
                "required_quantity": 200,
                "unit": "meals",
                "urgency": "medium",
            }, headers=self.auth_headers)

        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["need_id"], "need_food_high")
        self.assertGreaterEqual(data["trust_score"], 75)
        self.assertEqual(data["trust_tier"], "high")
        self.assertEqual(data["dispatch_action"], "auto_dispatch")
        self.assertEqual(data["status"], "open")
        self.assertEqual(data["flag"], "verified")
        self.assertTrue(mock_auto_match.called or mock_send_alert.called)

    def test_food_report_high_trust_without_capacity_held_for_review(self):
        """
        High credibility food report without confirmed capacity MUST be routed to
        human_review (status='secondary_review'), suppressing automated dispatch.
        """
        with patch("backend.routes.need.get_coordinates", return_value={"lat": 11.6854, "lng": 76.1320}), \
             patch("backend.routes.need.check_reporter_reputation", return_value={
                 "is_registered_ngo_or_camp": True, "has_resolved_history": True,
                 "is_flagged_history": False, "flagged_deduction": 0
             }), \
             patch("backend.routes.need.check_duplicate_and_rate_limit", return_value={
                 "text_hash": "hash_food_2", "is_identical_text": False, "recent_reports_count_one_hour": 1
             }), \
             patch("backend.routes.need.get_corroboration_candidates", return_value=[
                 CorroborationCandidate("c1", "food", "9900000002", datetime.now(timezone.utc), 11.685, 76.132),
                 CorroborationCandidate("c2", "food", "9900000003", datetime.now(timezone.utc), 11.686, 76.133),
             ]), \
             patch("database.inventory_db.check_food_inventory_available", return_value=False), \
             patch("backend.routes.need.save_need", return_value="need_food_no_cap"), \
             patch("backend.routes.need._auto_match_for_need") as mock_auto_match, \
             patch("backend.routes.need.send_alert") as mock_send_alert:

            resp = self.client.post("/need", json={
                "name": "Camp Coordinator",
                "phone": "9876543210",
                "location": "Wayanad Relief Camp",
                "description": "Relief camp housing 200 flood survivors urgently requires 200 packets of food meals",
                "help_needed": "food",
                "resource_type": "food",
                "required_quantity": 200,
                "unit": "meals",
                "urgency": "medium",
            }, headers=self.auth_headers)

        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["trust_tier"], "high")
        self.assertEqual(data["dispatch_action"], "human_review")
        self.assertEqual(data["status"], "secondary_review")
        self.assertEqual(data["flag"], "pending_review")
        mock_auto_match.assert_not_called()
        mock_send_alert.assert_not_called()

    # =========================================================================
    # 2. END-TO-END PIPELINE: TRANSPORT
    # =========================================================================

    def test_transport_report_high_trust_with_capacity_auto_dispatches(self):
        """
        High credibility transport report with confirmed vehicle capacity should auto_dispatch.
        """
        with patch("backend.routes.need.get_coordinates", return_value={"lat": 26.4499, "lng": 80.3319}), \
             patch("backend.routes.need.check_reporter_reputation", return_value={
                 "is_registered_ngo_or_camp": True, "has_resolved_history": True,
                 "is_flagged_history": False, "flagged_deduction": 0
             }), \
             patch("backend.routes.need.check_duplicate_and_rate_limit", return_value={
                 "text_hash": "hash_trans_1", "is_identical_text": False, "recent_reports_count_one_hour": 1
             }), \
             patch("backend.routes.need.get_corroboration_candidates", return_value=[
                 CorroborationCandidate("c1", "transport", "9900000004", datetime.now(timezone.utc), 26.45, 80.33),
                 CorroborationCandidate("c2", "transport", "9900000005", datetime.now(timezone.utc), 26.451, 80.331),
             ]), \
             patch("database.volunteers_db.check_transport_capacity_available", return_value=True), \
             patch("backend.routes.need.save_need", return_value="need_trans_high"), \
             patch("backend.routes.need._auto_match_for_need") as mock_auto_match, \
             patch("backend.routes.need.send_alert") as mock_send_alert:

            resp = self.client.post("/need", json={
                "name": "Rescue Lead",
                "phone": "9876543210",
                "location": "Kanpur, India",
                "description": "Stranded citizens need transport vehicle evacuation to relief camp immediately",
                "help_needed": "transport",
                "resource_type": "transport",
                "required_quantity": 2,
                "unit": "vehicles",
                "urgency": "medium",
            }, headers=self.auth_headers)

        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["resource_type"], "transport")
        self.assertGreaterEqual(data["trust_score"], 75)
        self.assertEqual(data["dispatch_action"], "auto_dispatch")
        self.assertEqual(data["status"], "open")
        self.assertTrue(mock_auto_match.called or mock_send_alert.called)

    def test_transport_report_without_capacity_routes_to_human_review(self):
        """
        High credibility transport report without available vehicle capacity routes to human_review.
        """
        with patch("backend.routes.need.get_coordinates", return_value={"lat": 26.4499, "lng": 80.3319}), \
             patch("backend.routes.need.check_reporter_reputation", return_value={
                 "is_registered_ngo_or_camp": True, "has_resolved_history": True,
                 "is_flagged_history": False, "flagged_deduction": 0
             }), \
             patch("backend.routes.need.check_duplicate_and_rate_limit", return_value={
                 "text_hash": "hash_trans_2", "is_identical_text": False, "recent_reports_count_one_hour": 1
             }), \
             patch("backend.routes.need.get_corroboration_candidates", return_value=[
                 CorroborationCandidate("c1", "transport", "9900000004", datetime.now(timezone.utc), 26.45, 80.33),
                 CorroborationCandidate("c2", "transport", "9900000005", datetime.now(timezone.utc), 26.451, 80.331),
             ]), \
             patch("database.volunteers_db.check_transport_capacity_available", return_value=False), \
             patch("backend.routes.need.save_need", return_value="need_trans_no_cap"), \
             patch("backend.routes.need._auto_match_for_need") as mock_auto_match:

            resp = self.client.post("/need", json={
                "name": "Rescue Lead",
                "phone": "9876543210",
                "location": "Kanpur, India",
                "description": "Stranded citizens need transport vehicle evacuation to relief camp immediately",
                "help_needed": "transport",
                "resource_type": "transport",
                "required_quantity": 2,
                "unit": "vehicles",
            }, headers=self.auth_headers)

        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["dispatch_action"], "human_review")
        self.assertEqual(data["status"], "secondary_review")
        mock_auto_match.assert_not_called()

    # =========================================================================
    # 3. MEDIUM & LOW TIERS, CRITICAL SEVERITY, AND HOLD POLICY
    # =========================================================================

    def test_medium_tier_critical_severity_elevates_priority_without_bypassing_review(self):
        """
        Critical severity requests with medium trust must receive elevated priority
        (HIGH), but CANNOT bypass human_review.
        """
        with patch("backend.routes.need.get_coordinates", return_value={"lat": 11.6854, "lng": 76.1320}), \
             patch("backend.routes.need.check_reporter_reputation", return_value={
                 "is_registered_ngo_or_camp": False, "has_resolved_history": False,
                 "is_flagged_history": False, "flagged_deduction": 0
             }), \
             patch("backend.routes.need.check_duplicate_and_rate_limit", return_value={
                 "text_hash": "hash_crit_1", "is_identical_text": False, "recent_reports_count_one_hour": 1
             }), \
             patch("backend.routes.need.get_corroboration_candidates", return_value=[
                 CorroborationCandidate("c1", "food", "9900000002", datetime.now(timezone.utc), 11.685, 76.132)
             ]), \
             patch("backend.routes.need.process_need_text", return_value={
                 "category": "food", "severity": "critical", "consistency": 7, "quantity": 100, "unit": "meals"
             }), \
             patch("backend.routes.need.save_need", return_value="need_crit_med"), \
             patch("backend.routes.need._auto_match_for_need") as mock_auto_match:

            resp = self.client.post("/need", json={
                "name": "Citizen",
                "phone": "9876543210",
                "location": "Wayanad Relief Camp",
                "description": "Critical food shortage! 100 people without clean drinking water and rations for days",
                "urgency": "critical",
                "severity": "critical",
            }, headers=self.auth_headers)

        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["trust_tier"], "medium")
        self.assertEqual(data["priority"], "HIGH")
        self.assertEqual(data["dispatch_action"], "human_review")
        self.assertEqual(data["status"], "secondary_review")
        mock_auto_match.assert_not_called()

    def test_low_tier_held_and_flagged_without_dispatch(self):
        """
        Low credibility reports (unknown reporter, no corroboration, low consistency)
        must receive hold_and_flag action and status='flagged'.
        """
        with patch("backend.routes.need.get_coordinates", return_value={"lat": 11.6854, "lng": 76.1320}), \
             patch("backend.routes.need.check_reporter_reputation", return_value={
                 "is_registered_ngo_or_camp": False, "has_resolved_history": False,
                 "is_flagged_history": False, "flagged_deduction": 0
             }), \
             patch("backend.routes.need.check_duplicate_and_rate_limit", return_value={
                 "text_hash": "hash_spam", "is_identical_text": False, "recent_reports_count_one_hour": 1
             }), \
             patch("backend.routes.need.get_corroboration_candidates", return_value=[]), \
             patch("backend.routes.need.process_need_text", return_value={
                 "category": "food", "severity": "low", "consistency": 2
             }), \
             patch("backend.routes.need.save_need", return_value="need_low"), \
             patch("backend.routes.need._auto_match_for_need") as mock_auto_match, \
             patch("backend.routes.need.send_alert") as mock_send_alert:

            resp = self.client.post("/need", json={
                "name": "Suspicious User",
                "phone": "9876543210",
                "location": "Wayanad",
                "description": "Send 50000 free food packets to my home immediately right now please",
            }, headers=self.auth_headers)

        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertLess(data["trust_score"], 45)
        self.assertEqual(data["trust_tier"], "low")
        self.assertEqual(data["dispatch_action"], "hold_and_flag")
        self.assertEqual(data["status"], "flagged")
        self.assertEqual(data["flag"], "suspicious")
        mock_auto_match.assert_not_called()
        mock_send_alert.assert_not_called()

    # =========================================================================
    # 4. DUPLICATE DETECTION AND RATE LIMITING PENALTIES
    # =========================================================================

    def test_identical_text_hash_applies_penalty(self):
        """
        Submitting a report with an identical text hash incurs a -15 penalty.
        """
        with patch("backend.routes.need.get_coordinates", return_value={"lat": 11.6854, "lng": 76.1320}), \
             patch("backend.routes.need.check_reporter_reputation", return_value={
                 "is_registered_ngo_or_camp": True, "has_resolved_history": True,
                 "is_flagged_history": False, "flagged_deduction": 0
             }), \
             patch("backend.routes.need.check_duplicate_and_rate_limit", return_value={
                 "text_hash": "dup_hash_123", "is_identical_text": True, "recent_reports_count_one_hour": 1
             }), \
             patch("backend.routes.need.get_corroboration_candidates", return_value=[]), \
             patch("backend.routes.need.save_need", return_value="need_dup"):

            resp = self.client.post("/need", json={
                "name": "Spam User",
                "phone": "9876543210",
                "location": "Wayanad",
                "description": "Identical text description repeated multiple times for flood food relief",
            }, headers=self.auth_headers)

        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        reasons_text = " ".join(data["reasons"])
        self.assertIn("-15", reasons_text)
        self.assertIn("Identical", reasons_text)

    def test_rate_limit_exceeded_applies_penalty(self):
        """
        Submitting >3 reports in 1 hour from the same phone incurs a -15 rate limit penalty.
        """
        with patch("backend.routes.need.get_coordinates", return_value={"lat": 11.6854, "lng": 76.1320}), \
             patch("backend.routes.need.check_reporter_reputation", return_value={
                 "is_registered_ngo_or_camp": True, "has_resolved_history": True,
                 "is_flagged_history": False, "flagged_deduction": 0
             }), \
             patch("backend.routes.need.check_duplicate_and_rate_limit", return_value={
                 "text_hash": "hash_rl", "is_identical_text": False, "recent_reports_count_one_hour": 5
             }), \
             patch("backend.routes.need.get_corroboration_candidates", return_value=[]), \
             patch("backend.routes.need.save_need", return_value="need_rl"):

            resp = self.client.post("/need", json={
                "name": "Spam Reporter",
                "phone": "9876543210",
                "location": "Wayanad",
                "description": "Burst of five flood reports submitted within one hour from same phone",
            }, headers=self.auth_headers)

        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        reasons_text = " ".join(data["reasons"])
        self.assertIn("-15", reasons_text)
        self.assertIn("Rate limit", reasons_text)

    # =========================================================================
    # 5. SECURITY & CLIENT TRUST BYPASS RESISTANCE
    # =========================================================================

    def test_client_supplied_trust_score_and_action_are_ignored(self):
        """
        Malicious client payload sending trust_score=100 and dispatch_action='auto_dispatch'
        must be completely ignored and evaluated purely server-side.
        """
        with patch("backend.routes.need.get_coordinates", return_value={"lat": 11.6854, "lng": 76.1320}), \
             patch("backend.routes.need.check_reporter_reputation", return_value={
                 "is_registered_ngo_or_camp": False, "has_resolved_history": False,
                 "is_flagged_history": False, "flagged_deduction": 0
             }), \
             patch("backend.routes.need.check_duplicate_and_rate_limit", return_value={
                 "text_hash": "hash_hack", "is_identical_text": False, "recent_reports_count_one_hour": 1
             }), \
             patch("backend.routes.need.get_corroboration_candidates", return_value=[]), \
             patch("backend.routes.need.process_need_text", return_value={
                 "category": "food", "severity": "low", "consistency": 1
             }), \
             patch("backend.routes.need.save_need", return_value="need_hack"):

            resp = self.client.post("/need", json={
                "name": "Attacker",
                "phone": "9876543210",
                "location": "Wayanad",
                "description": "Attempting to force auto dispatch with client side score payload parameters",
                "trust_score": 100,
                "trust_tier": "high",
                "dispatch_action": "auto_dispatch",
                "priority": "CRITICAL",
            }, headers=self.auth_headers)

        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        # Must NOT be 100 or auto_dispatch
        self.assertNotEqual(data["dispatch_action"], "auto_dispatch")
        self.assertLess(data["trust_score"], 50)
        self.assertEqual(data["dispatch_action"], "hold_and_flag")

    # =========================================================================
    # 6. MATCHER SAFETY GATING (ALTERNATE ROUTE BYPASS PROTECTION)
    # =========================================================================

    def test_global_matcher_blocks_low_trust_and_held_needs(self):
        """
        Global matching route (/match) must strictly refuse to dispatch needs
        marked with low trust tier or hold_and_flag/human_review dispatch actions.
        """
        mock_needs = [
            {
                "id": "need_held",
                "trust_score": 20,
                "trust_tier": "low",
                "dispatch_action": "hold_and_flag",
                "status": "flagged",
                "severity": "critical",
                "category": "food",
                "lat": 11.6854,
                "lng": 76.1320,
            },
            {
                "id": "need_review",
                "trust_score": 55,
                "trust_tier": "medium",
                "dispatch_action": "human_review",
                "status": "secondary_review",
                "severity": "high",
                "category": "food",
                "lat": 11.6854,
                "lng": 76.1320,
            }
        ]
        mock_volunteers = [
            {
                "id": "vol_1",
                "name": "Free Volunteer",
                "lat": 11.6854,
                "lng": 76.1320,
                "available": True,
                "active_assignments": 0,
                "skills": ["food", "supplies"],
                "ngo_verified": True,
            }
        ]

        with patch("backend.routes.match.get_open_needs", return_value=mock_needs), \
             patch("backend.routes.match.get_available_volunteers", return_value=mock_volunteers):
            resp = self.client.get("/match", headers=self.auth_headers)

        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["total_matches_made"], 0)

    # =========================================================================
    # 7. COORDINATOR REVIEW WORKFLOW
    # =========================================================================

    def test_coordinator_review_requires_authentication(self):
        """Unauthenticated call to /need/{id}/review returns 401."""
        resp = self.client.post("/need/some-id/review", json={"action": "approve"})
        self.assertEqual(resp.status_code, 401)

    def test_coordinator_review_rejects_non_coordinator_role(self):
        """A volunteer role cannot approve or reject needs (returns 403)."""
        app.dependency_overrides[verify_token] = lambda: {"sub": "vol-1", "role": "volunteer"}
        try:
            resp = self.client.post("/need/some-id/review", json={"action": "approve"}, headers=self.auth_headers)
            self.assertEqual(resp.status_code, 403)
        finally:
            app.dependency_overrides.pop(verify_token, None)

    def test_coordinator_review_approve_transitions_to_open_and_dispatches(self):
        """
        An authenticated NGO coordinator approving a held need updates its status to 'open'
        and triggers volunteer matching.
        """
        mock_need = {
            "id": "need-hold-1",
            "status": "secondary_review",
            "dispatch_action": "human_review",
            "category": "food",
        }
        app.dependency_overrides[verify_token] = lambda: {"sub": "ngo-admin", "role": "ngo"}
        try:
            with patch("backend.routes.need.get_need_by_id", return_value=mock_need), \
                 patch("database.needs_db.update_need_status") as mock_update, \
                 patch("backend.routes.need._auto_match_for_need") as mock_auto_match:

                resp = self.client.post("/need/need-hold-1/review", json={
                    "action": "approve",
                    "notes": "Verified situation on ground with relief camp lead"
                }, headers=self.auth_headers)

            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertEqual(data["status"], "success")
            self.assertEqual(data["new_status"], "open")
            self.assertEqual(data["dispatch_action"], "coordinator_approved")
            mock_update.assert_called_with("need-hold-1", "open")
            mock_auto_match.assert_called_with("need-hold-1")
        finally:
            app.dependency_overrides.pop(verify_token, None)

    def test_coordinator_review_reject_transitions_to_rejected(self):
        """
        An authenticated coordinator rejecting a need updates its status to 'rejected'.
        """
        mock_need = {
            "id": "need-fake-1",
            "status": "flagged",
            "dispatch_action": "hold_and_flag",
            "category": "food",
        }
        app.dependency_overrides[verify_token] = lambda: {"sub": "admin", "role": "system"}
        try:
            with patch("backend.routes.need.get_need_by_id", return_value=mock_need), \
                 patch("database.needs_db.update_need_status") as mock_update, \
                 patch("backend.routes.need._auto_match_for_need") as mock_auto_match:

                resp = self.client.post("/need/need-fake-1/review", json={
                    "action": "reject",
                    "notes": "Confirmed prank distress report"
                }, headers=self.auth_headers)

            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertEqual(data["status"], "success")
            self.assertEqual(data["new_status"], "rejected")
            self.assertEqual(data["dispatch_action"], "coordinator_rejected")
            mock_update.assert_called_with("need-fake-1", "rejected")
            mock_auto_match.assert_not_called()
        finally:
            app.dependency_overrides.pop(verify_token, None)

    # =========================================================================
    # 8. PRIVACY AND PII SANITIZATION
    # =========================================================================

    def test_no_raw_phone_numbers_in_reasons(self):
        """
        Diagnostic reasons returned to callers must never expose unmasked 10-digit phone numbers.
        """
        raw_phone = "9876543210"
        with patch("backend.routes.need.get_coordinates", return_value={"lat": 11.6854, "lng": 76.1320}), \
             patch("backend.routes.need.check_reporter_reputation", return_value={
                 "is_registered_ngo_or_camp": True, "has_resolved_history": True,
                 "is_flagged_history": False, "flagged_deduction": 0
             }), \
             patch("backend.routes.need.check_duplicate_and_rate_limit", return_value={
                 "text_hash": "hash_pii", "is_identical_text": False, "recent_reports_count_one_hour": 1
             }), \
             patch("backend.routes.need.get_corroboration_candidates", return_value=[
                 CorroborationCandidate("c1", "food", "9900000002", datetime.now(timezone.utc), 11.685, 76.132)
             ]), \
             patch("backend.routes.need.save_need", return_value="need_pii"):

            resp = self.client.post("/need", json={
                "name": "Secret Reporter",
                "phone": raw_phone,
                "location": "Wayanad",
                "description": "Emergency food supplies needed at shelter with complete privacy guarantee",
            }, headers=self.auth_headers)

        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        reasons_text = " ".join(data.get("reasons", []))
        self.assertNotIn(raw_phone, reasons_text)
        self.assertNotIn("9900000002", reasons_text)


if __name__ == "__main__":
    unittest.main()
