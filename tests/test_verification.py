"""Unit tests for SETU Trust Engine V2 (database/verification.py).

Comprehensive test coverage across:
1. Validation gates (NeedRequest, food, transport, phone, coords, units, severities)
2. Credibility scoring (reporter, corroboration, consistency, penalties, clamping)
3. Credibility tiers & boundary tests (44, 45, 74, 75)
4. Dispatch recommendation policy (capacity handling, tiers, need types, risk)
5. Explainability & safety (no PII leakage, deterministic outputs, invalid request blocking)
"""

from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone

import pytest

from database.verification import (
    TRUST_CONFIG,
    CorroborationCandidate,
    DispatchAction,
    DispatchRecommendation,
    EvidenceInput,
    NeedRequest,
    NeedType,
    PriorityLevel,
    TrustResult,
    TrustTier,
    ValidationResult,
    assign_trust_tier,
    calculate_trust_score,
    haversine_distance_km,
    mask_phone,
    normalize_phone,
    recommend_dispatch,
    validate_need,
)


# =============================================================================
# 1. VALIDATION TESTS
# =============================================================================

class TestValidationGates:
    """Tests for Stage One: validate_need."""

    def test_valid_food_request_with_coords(self):
        req = NeedRequest(
            need_type="food",
            item="cooked meals",
            quantity=250,
            unit="meals",
            reporter_phone="+91-98765-43210",
            latitude=12.9716,
            longitude=77.5946,
            severity="medium",
        )
        res = validate_need(req)
        assert res.valid is True
        assert len(res.errors) == 0

    def test_valid_food_request_with_location_description(self):
        req = NeedRequest(
            need_type="food",
            item="rice bags",
            quantity=50,
            unit="kg",
            reporter_phone="9876543210",
            location_description="Community Hall, Sector 4, Relief Camp",
            severity="low",
        )
        res = validate_need(req)
        assert res.valid is True
        assert len(res.errors) == 0

    def test_valid_transport_request(self):
        req = NeedRequest(
            need_type="transport",
            pickup_location="Warehouse A, North Port",
            destination_location="Relief Camp 3, South Hill",
            cargo_or_passenger_type="food supplies",
            quantity=2,
            unit="trucks",
            reporter_phone="9876543210",
            severity="high",
        )
        res = validate_need(req)
        assert res.valid is True
        assert len(res.errors) == 0

    def test_missing_food_item_fails(self):
        req = NeedRequest(
            need_type="food",
            item="",
            quantity=100,
            unit="meals",
            reporter_phone="9876543210",
            location_description="Camp Alpha",
        )
        res = validate_need(req)
        assert res.valid is False
        assert any("food item is required" in err for err in res.errors)

    def test_missing_quantity_or_unit_fails(self):
        req_no_qty = NeedRequest(
            need_type="food",
            item="drinking water",
            quantity=None,
            unit="liters",
            reporter_phone="9876543210",
            location_description="Camp Alpha",
        )
        res_no_qty = validate_need(req_no_qty)
        assert res_no_qty.valid is False
        assert any("quantity is required" in err for err in res_no_qty.errors)

        req_no_unit = NeedRequest(
            need_type="food",
            item="drinking water",
            quantity=100,
            unit="",
            reporter_phone="9876543210",
            location_description="Camp Alpha",
        )
        res_no_unit = validate_need(req_no_unit)
        assert res_no_unit.valid is False
        assert any("unit is required" in err for err in res_no_unit.errors)

    def test_missing_transport_pickup_or_destination_fails(self):
        req = NeedRequest(
            need_type="transport",
            pickup_location="",
            destination_location="Camp Beta",
            cargo_or_passenger_type="people",
            reporter_phone="9876543210",
        )
        res = validate_need(req)
        assert res.valid is False
        assert any("pickup location is required" in err for err in res.errors)

        req2 = NeedRequest(
            need_type="transport",
            pickup_location="Camp Alpha",
            destination_location="",
            cargo_or_passenger_type="people",
            reporter_phone="9876543210",
        )
        res2 = validate_need(req2)
        assert res2.valid is False
        assert any("destination location is required" in err for err in res2.errors)

    def test_missing_transport_cargo_type_fails(self):
        req = NeedRequest(
            need_type="transport",
            pickup_location="Camp Alpha",
            destination_location="Camp Beta",
            cargo_or_passenger_type="",
            reporter_phone="9876543210",
        )
        res = validate_need(req)
        assert res.valid is False
        assert any("cargo or passenger type is required" in err for err in res.errors)

    def test_phone_validation_normalizations_and_errors(self):
        # Valid cases with separators and prefixes
        assert normalize_phone("+91-98765-43210") == "9876543210"
        assert normalize_phone("919876543210") == "9876543210"
        assert normalize_phone("(987) 654-3210") == "9876543210"
        assert normalize_phone("09876543210") == "9876543210"

        # Invalid cases
        invalid_phones = [
            "123",  # too short
            "987654321012345",  # too long
            "abcdefghij",  # non-digits
            "",  # empty
            "+1-555-123-4567",  # US phone not normalizing to 10 digits
        ]
        for phone in invalid_phones:
            req = NeedRequest(
                need_type="food",
                item="bread",
                quantity=10,
                unit="packets",
                reporter_phone=phone,
                location_description="Camp Alpha",
            )
            res = validate_need(req)
            assert res.valid is False
            assert any("phone must contain exactly 10 digits" in err for err in res.errors)

    def test_coordinate_boundaries_and_zero_values(self):
        # Zero latitude and zero longitude are VALID coordinates
        req_zero = NeedRequest(
            need_type="food",
            item="rice",
            quantity=10,
            unit="kg",
            reporter_phone="9876543210",
            latitude=0.0,
            longitude=0.0,
        )
        res_zero = validate_need(req_zero)
        assert res_zero.valid is True

        # Valid boundaries: [-90, 90] and [-180, 180]
        req_bounds = NeedRequest(
            need_type="food",
            item="rice",
            quantity=10,
            unit="kg",
            reporter_phone="9876543210",
            latitude=90.0,
            longitude=180.0,
        )
        assert validate_need(req_bounds).valid is True

        req_neg_bounds = NeedRequest(
            need_type="food",
            item="rice",
            quantity=10,
            unit="kg",
            reporter_phone="9876543210",
            latitude=-90.0,
            longitude=-180.0,
        )
        assert validate_need(req_neg_bounds).valid is True

        # Out of range coordinates
        req_lat_high = NeedRequest(
            need_type="food",
            item="rice",
            quantity=10,
            unit="kg",
            reporter_phone="9876543210",
            latitude=90.01,
            longitude=0.0,
        )
        res_lat = validate_need(req_lat_high)
        assert res_lat.valid is False
        assert any("latitude must be between -90 and 90" in err for err in res_lat.errors)

        req_lng_high = NeedRequest(
            need_type="food",
            item="rice",
            quantity=10,
            unit="kg",
            reporter_phone="9876543210",
            latitude=0.0,
            longitude=180.5,
        )
        res_lng = validate_need(req_lng_high)
        assert res_lng.valid is False
        assert any("longitude must be between -180 and 180" in err for err in res_lng.errors)

    def test_non_positive_quantity_rejected(self):
        for bad_qty in [0, -5, -0.1]:
            req = NeedRequest(
                need_type="food",
                item="water",
                quantity=bad_qty,
                unit="liters",
                reporter_phone="9876543210",
                location_description="Point X",
            )
            res = validate_need(req)
            assert res.valid is False
            assert any("quantity must be greater than zero" in err for err in res.errors)

    def test_unsupported_unit_and_unsupported_need_type(self):
        # Unsupported need type
        req_bad_type = NeedRequest(
            need_type="shelter",
            item="tents",
            quantity=10,
            unit="kits",
            reporter_phone="9876543210",
            location_description="Point Y",
        )
        res_type = validate_need(req_bad_type)
        assert res_type.valid is False
        assert any("need type 'shelter' is unsupported" in err for err in res_type.errors)

        # Unsupported unit for food
        req_bad_unit = NeedRequest(
            need_type="food",
            item="apples",
            quantity=50,
            unit="elephants",
            reporter_phone="9876543210",
            location_description="Point Y",
        )
        res_unit = validate_need(req_bad_unit)
        assert res_unit.valid is False
        assert any("unsupported unit 'elephants' for food" in err for err in res_unit.errors)

    def test_unit_sanity_limit_exceeded(self):
        # Limit for meals is 50,000
        req_over = NeedRequest(
            need_type="food",
            item="cooked meals",
            quantity=60000,
            unit="meals",
            reporter_phone="9876543210",
            location_description="Relief Center",
        )
        res = validate_need(req_over)
        assert res.valid is False
        assert any("exceeds sanity limit of 50000" in err for err in res.errors)

    def test_invalid_request_receives_no_score_and_no_dispatch_recommendation(self):
        # Invalid phone + invalid need type
        bad_req = NeedRequest(
            need_type="unknown_category",
            item="rations",
            quantity=10,
            unit="kg",
            reporter_phone="123",
        )
        res = calculate_trust_score(bad_req, EvidenceInput())
        assert isinstance(res, TrustResult)
        assert res.valid is False
        assert res.trust_score is None
        assert res.trust_tier is None
        assert res.dispatch_action is None
        assert res.priority is None
        assert len(res.validation_errors) > 0


# =============================================================================
# 2. CREDIBILITY SCORING TESTS
# =============================================================================

class TestCredibilityScoring:
    """Tests for Stage Two: calculate_trust_score."""

    @pytest.fixture
    def base_food_request(self) -> NeedRequest:
        return NeedRequest(
            need_type="food",
            item="dry rations",
            quantity=100,
            unit="packets",
            reporter_phone="9876543210",
            latitude=26.8467,
            longitude=80.9462,
            severity="medium",
            request_id="req-001",
        )

    def test_all_components_at_zero(self, base_food_request):
        # No evidence supplied (empty evidence)
        ev = EvidenceInput(reference_time=datetime(2026, 10, 10, 12, 0, tzinfo=timezone.utc))
        res = calculate_trust_score(base_food_request, ev)
        assert res.valid is True
        assert res.trust_score == 0
        assert res.trust_tier == TrustTier.LOW.value
        assert res.component_breakdown["reporter_score"] == 0
        assert res.component_breakdown["corroboration_score"] == 0
        assert res.component_breakdown["consistency_score"] == 0
        assert res.component_breakdown["penalties_total"] == 0

    def test_reporter_contribution_limits(self, base_food_request):
        # Registered NGO (+15)
        ev_ngo = EvidenceInput(is_registered_ngo_or_camp=True)
        res_ngo = calculate_trust_score(base_food_request, ev_ngo)
        assert res_ngo.component_breakdown["reporter_score"] == 15

        # Resolved history (+10)
        ev_hist = EvidenceInput(has_resolved_history=True)
        res_hist = calculate_trust_score(base_food_request, ev_hist)
        assert res_hist.component_breakdown["reporter_score"] == 10

        # Both registered NGO and resolved history (+25, max 30)
        ev_both = EvidenceInput(is_registered_ngo_or_camp=True, has_resolved_history=True)
        res_both = calculate_trust_score(base_food_request, ev_both)
        assert res_both.component_breakdown["reporter_score"] == 25
        assert res_both.component_breakdown["reporter_score"] <= 30

        # Unknown reporter gets 0, not a penalty
        ev_unknown = EvidenceInput(is_registered_ngo_or_camp=None, has_resolved_history=None)
        res_unknown = calculate_trust_score(base_food_request, ev_unknown)
        assert res_unknown.component_breakdown["reporter_score"] == 0
        assert res_unknown.component_breakdown["penalties_total"] == 0

    def test_one_corroborating_report(self, base_food_request):
        ref_time = datetime(2026, 10, 10, 14, 0, tzinfo=timezone.utc)
        # 1 km away, 1 hour ago, same need_type, distinct phone
        cand1 = CorroborationCandidate(
            candidate_id="c1",
            need_type="food",
            reporter_phone="9123456780",
            timestamp=ref_time - timedelta(hours=1),
            latitude=26.8500,  # ~0.5 km away
            longitude=80.9500,
        )
        ev = EvidenceInput(candidates=[cand1], reference_time=ref_time)
        res = calculate_trust_score(base_food_request, ev)
        assert res.component_breakdown["corroboration_score"] == 15

    def test_two_independent_corroborating_reports(self, base_food_request):
        ref_time = datetime(2026, 10, 10, 14, 0, tzinfo=timezone.utc)
        cand1 = CorroborationCandidate(
            candidate_id="c1",
            need_type="food",
            reporter_phone="9123456780",
            timestamp=ref_time - timedelta(hours=1),
            latitude=26.8500,
            longitude=80.9500,
        )
        cand2 = CorroborationCandidate(
            candidate_id="c2",
            need_type="food",
            reporter_phone="9123456781",
            timestamp=ref_time - timedelta(minutes=45),
            latitude=26.8520,
            longitude=80.9480,
        )
        ev = EvidenceInput(candidates=[cand1, cand2], reference_time=ref_time)
        res = calculate_trust_score(base_food_request, ev)
        assert res.component_breakdown["corroboration_score"] == 30

    def test_same_phone_report_excluded_from_corroboration(self, base_food_request):
        ref_time = datetime(2026, 10, 10, 14, 0, tzinfo=timezone.utc)
        # Same phone as request (9876543210)
        cand_same_phone = CorroborationCandidate(
            candidate_id="c_same",
            need_type="food",
            reporter_phone="9876543210",
            timestamp=ref_time - timedelta(hours=1),
            latitude=26.8500,
            longitude=80.9500,
        )
        ev = EvidenceInput(candidates=[cand_same_phone], reference_time=ref_time)
        res = calculate_trust_score(base_food_request, ev)
        assert res.component_breakdown["corroboration_score"] == 0

    def test_two_candidates_with_same_phone_count_as_only_one(self, base_food_request):
        ref_time = datetime(2026, 10, 10, 14, 0, tzinfo=timezone.utc)
        # Two reports from same phone 9123456780
        cand1 = CorroborationCandidate(
            candidate_id="c1",
            need_type="food",
            reporter_phone="9123456780",
            timestamp=ref_time - timedelta(hours=1),
            latitude=26.8500,
            longitude=80.9500,
        )
        cand2 = CorroborationCandidate(
            candidate_id="c2",
            need_type="food",
            reporter_phone="9123456780",
            timestamp=ref_time - timedelta(minutes=30),
            latitude=26.8510,
            longitude=80.9510,
        )
        ev = EvidenceInput(candidates=[cand1, cand2], reference_time=ref_time)
        res = calculate_trust_score(base_food_request, ev)
        # Should count as 1 match (+15), not 2 matches (+30)
        assert res.component_breakdown["corroboration_score"] == 15

    def test_report_outside_three_hour_window_excluded(self, base_food_request):
        ref_time = datetime(2026, 10, 10, 14, 0, tzinfo=timezone.utc)
        # 3.5 hours ago (> 3.0 hours)
        cand_old = CorroborationCandidate(
            candidate_id="c_old",
            need_type="food",
            reporter_phone="9123456780",
            timestamp=ref_time - timedelta(hours=3, minutes=30),
            latitude=26.8500,
            longitude=80.9500,
        )
        # Future timestamp
        cand_future = CorroborationCandidate(
            candidate_id="c_future",
            need_type="food",
            reporter_phone="9123456781",
            timestamp=ref_time + timedelta(minutes=10),
            latitude=26.8500,
            longitude=80.9500,
        )
        ev = EvidenceInput(candidates=[cand_old, cand_future], reference_time=ref_time)
        res = calculate_trust_score(base_food_request, ev)
        assert res.component_breakdown["corroboration_score"] == 0

    def test_report_beyond_3km_excluded(self, base_food_request):
        ref_time = datetime(2026, 10, 10, 14, 0, tzinfo=timezone.utc)
        # Base lat=26.8467, lng=80.9462. A shift of ~0.05 degrees is ~5.5 km.
        dist = haversine_distance_km(26.8467, 80.9462, 26.9000, 80.9462)
        assert dist > 3.0

        cand_far = CorroborationCandidate(
            candidate_id="c_far",
            need_type="food",
            reporter_phone="9123456780",
            timestamp=ref_time - timedelta(hours=1),
            latitude=26.9000,
            longitude=80.9462,
        )
        ev = EvidenceInput(candidates=[cand_far], reference_time=ref_time)
        res = calculate_trust_score(base_food_request, ev)
        assert res.component_breakdown["corroboration_score"] == 0

    def test_missing_coordinate_report_excluded(self, base_food_request):
        ref_time = datetime(2026, 10, 10, 14, 0, tzinfo=timezone.utc)
        cand_no_coords = CorroborationCandidate(
            candidate_id="c_no_coords",
            need_type="food",
            reporter_phone="9123456780",
            timestamp=ref_time - timedelta(hours=1),
            latitude=None,
            longitude=None,
        )
        ev = EvidenceInput(candidates=[cand_no_coords], reference_time=ref_time)
        res = calculate_trust_score(base_food_request, ev)
        assert res.component_breakdown["corroboration_score"] == 0

    def test_different_need_type_excluded_from_corroboration(self, base_food_request):
        ref_time = datetime(2026, 10, 10, 14, 0, tzinfo=timezone.utc)
        cand_transport = CorroborationCandidate(
            candidate_id="c_trans",
            need_type="transport",
            reporter_phone="9123456780",
            timestamp=ref_time - timedelta(hours=1),
            latitude=26.8500,
            longitude=80.9500,
        )
        ev = EvidenceInput(candidates=[cand_transport], reference_time=ref_time)
        res = calculate_trust_score(base_food_request, ev)
        assert res.component_breakdown["corroboration_score"] == 0

    def test_duplicate_marked_candidate_excluded(self, base_food_request):
        ref_time = datetime(2026, 10, 10, 14, 0, tzinfo=timezone.utc)
        cand_dup = CorroborationCandidate(
            candidate_id="c_dup",
            need_type="food",
            reporter_phone="9123456780",
            timestamp=ref_time - timedelta(hours=1),
            latitude=26.8500,
            longitude=80.9500,
            is_duplicate=True,
        )
        ev = EvidenceInput(candidates=[cand_dup], reference_time=ref_time)
        res = calculate_trust_score(base_food_request, ev)
        assert res.component_breakdown["corroboration_score"] == 0

    def test_ai_consistency_and_malformed_input(self, base_food_request):
        # AI score 8.5 -> scaled by 2 = 17 points
        ev_valid_ai = EvidenceInput(ai_consistency=8.5, ai_source="gemini-1.5-flash")
        res = calculate_trust_score(base_food_request, ev_valid_ai)
        assert res.component_breakdown["consistency_score"] == 17
        assert any("AI extraction consistency (8.5/10) (source: gemini-1.5-flash)" in r for r in res.reasons)

        # AI score 10.0 -> scaled by 2 = 20 points (max)
        ev_max = EvidenceInput(ai_consistency=10.0)
        res_max = calculate_trust_score(base_food_request, ev_max)
        assert res_max.component_breakdown["consistency_score"] == 20

        # Out-of-range AI inputs (e.g. -2 or 12) award 0 points and explain
        for bad_ai in [-2.0, 15.0]:
            ev_bad = EvidenceInput(ai_consistency=bad_ai)
            res_bad = calculate_trust_score(base_food_request, ev_bad)
            assert res_bad.component_breakdown["consistency_score"] == 0
            assert any("Invalid AI consistency input" in r for r in res_bad.reasons)

    def test_missing_evidence_produces_explanatory_reason(self, base_food_request):
        ev_empty = EvidenceInput()
        res = calculate_trust_score(base_food_request, ev_empty)
        # Verify explanatory reasons exist and missing evidence is not treated as fraud
        reasons_text = " ".join(res.reasons)
        assert "evidence unavailable" in reasons_text
        assert res.component_breakdown["penalties_total"] == 0

    def test_penalties_applied_individually_and_capped(self, base_food_request):
        # Base with full positive points: 25 reporter + 30 corroboration + 40 consistency = 95
        ref_time = datetime(2026, 10, 10, 14, 0, tzinfo=timezone.utc)
        cand1 = CorroborationCandidate("c1", "food", "9123456780", ref_time - timedelta(hours=1), 26.85, 80.95)
        cand2 = CorroborationCandidate("c2", "food", "9123456781", ref_time - timedelta(hours=1), 26.85, 80.95)

        # Identical text hash (-15)
        ev_hash = EvidenceInput(
            is_registered_ngo_or_camp=True,
            has_resolved_history=True,
            location_consistent=True,
            quantity_plausible=True,
            ai_consistency=10.0,
            candidates=[cand1, cand2],
            reference_time=ref_time,
            is_identical_text=True,
        )
        res_hash = calculate_trust_score(base_food_request, ev_hash)
        assert res_hash.applied_penalties["identical_text_hash"] == 15
        assert res_hash.component_breakdown["penalties_total"] == 15
        assert res_hash.trust_score == 95 - 15  # 80

        # Rate limit penalty (-15 if >3 reports in 1h)
        ev_rate = EvidenceInput(
            is_registered_ngo_or_camp=True,
            has_resolved_history=True,
            location_consistent=True,
            quantity_plausible=True,
            ai_consistency=10.0,
            candidates=[cand1, cand2],
            reference_time=ref_time,
            recent_reports_count_one_hour=5,
        )
        res_rate = calculate_trust_score(base_food_request, ev_rate)
        assert res_rate.applied_penalties["rate_limit_exceeded"] == 15
        assert res_rate.component_breakdown["penalties_total"] == 15
        assert res_rate.trust_score == 95 - 15  # 80

        # Flagged history penalty (-15)
        ev_flag = EvidenceInput(
            is_registered_ngo_or_camp=True,
            has_resolved_history=True,
            location_consistent=True,
            quantity_plausible=True,
            ai_consistency=10.0,
            candidates=[cand1, cand2],
            reference_time=ref_time,
            is_flagged_history=True,
        )
        res_flag = calculate_trust_score(base_food_request, ev_flag)
        assert res_flag.applied_penalties["flagged_history"] == 15
        assert res_flag.component_breakdown["penalties_total"] == 15

        # All 3 penalties combined (-15 + -15 + -15 = -45) -> MUST BE CAPPED AT 30
        ev_all_penalties = EvidenceInput(
            is_registered_ngo_or_camp=True,
            has_resolved_history=True,
            location_consistent=True,
            quantity_plausible=True,
            ai_consistency=10.0,
            candidates=[cand1, cand2],
            reference_time=ref_time,
            is_identical_text=True,
            recent_reports_count_one_hour=6,
            is_flagged_history=True,
        )
        res_all = calculate_trust_score(base_food_request, ev_all_penalties)
        assert res_all.component_breakdown["penalties_total"] == 30
        assert res_all.trust_score == 95 - 30  # 65

    def test_score_never_falls_below_zero_or_exceeds_100(self, base_food_request):
        # Heavy penalties with zero positive points
        ev_negative = EvidenceInput(
            is_identical_text=True,
            recent_reports_count_one_hour=10,
            is_flagged_history=True,
        )
        res_low = calculate_trust_score(base_food_request, ev_negative)
        assert res_low.trust_score == 0

        # Maximum possible positive components
        ref_time = datetime(2026, 10, 10, 14, 0, tzinfo=timezone.utc)
        cand1 = CorroborationCandidate("c1", "food", "9123456780", ref_time - timedelta(hours=1), 26.85, 80.95)
        cand2 = CorroborationCandidate("c2", "food", "9123456781", ref_time - timedelta(hours=1), 26.85, 80.95)
        ev_high = EvidenceInput(
            is_registered_ngo_or_camp=True,
            has_resolved_history=True,
            candidates=[cand1, cand2],
            reference_time=ref_time,
            location_consistent=True,
            quantity_plausible=True,
            ai_consistency=10.0,
        )
        res_high = calculate_trust_score(base_food_request, ev_high)
        assert 0 <= res_high.trust_score <= 100


# =============================================================================
# 3. TIER BOUNDARY TESTS
# =============================================================================

class TestTierBoundaries:
    """Tests for Stage Three: assign_trust_tier and boundaries (44, 45, 74, 75)."""

    def test_exact_tier_boundaries(self):
        # Low: 0 - 44
        assert assign_trust_tier(0) == TrustTier.LOW
        assert assign_trust_tier(44) == TrustTier.LOW

        # Medium: 45 - 74
        assert assign_trust_tier(45) == TrustTier.MEDIUM
        assert assign_trust_tier(74) == TrustTier.MEDIUM

        # High: 75 - 100
        assert assign_trust_tier(75) == TrustTier.HIGH
        assert assign_trust_tier(100) == TrustTier.HIGH

    def test_out_of_range_raises_error(self):
        with pytest.raises(ValueError, match="out of the valid range"):
            assign_trust_tier(-1)

        with pytest.raises(ValueError, match="out of the valid range"):
            assign_trust_tier(101)


# =============================================================================
# 4. DISPATCH POLICY TESTS
# =============================================================================

class TestDispatchPolicy:
    """Tests for pure policy function: recommend_dispatch."""

    def test_high_tier_food_with_capacity(self):
        # Low risk food with capacity -> auto_dispatch
        rec = recommend_dispatch(
            trust_tier=TrustTier.HIGH,
            severity="medium",
            need_type="food",
            capacity_available=True,
        )
        assert rec.action == DispatchAction.AUTO_DISPATCH.value

    def test_high_tier_food_without_capacity(self):
        # No capacity -> human_review
        rec = recommend_dispatch(
            trust_tier=TrustTier.HIGH,
            severity="medium",
            need_type="food",
            capacity_available=False,
        )
        assert rec.action == DispatchAction.HUMAN_REVIEW.value
        assert "capacity is currently unavailable" in " ".join(rec.reasons)

    def test_high_tier_transport_with_capacity(self):
        # Transport with confirmed capacity -> auto_dispatch
        rec = recommend_dispatch(
            trust_tier=TrustTier.HIGH,
            severity="medium",
            need_type="transport",
            capacity_available=True,
        )
        assert rec.action == DispatchAction.AUTO_DISPATCH.value

    def test_high_tier_transport_without_capacity(self):
        # Transport without capacity -> human_review
        rec = recommend_dispatch(
            trust_tier=TrustTier.HIGH,
            severity="high",
            need_type="transport",
            capacity_available=False,
        )
        assert rec.action == DispatchAction.HUMAN_REVIEW.value

    def test_medium_tier_normal_request(self):
        rec = recommend_dispatch(
            trust_tier=TrustTier.MEDIUM,
            severity="medium",
            need_type="food",
            capacity_available=True,
        )
        assert rec.action == DispatchAction.HUMAN_REVIEW.value
        assert rec.priority == PriorityLevel.NORMAL.value

    def test_critical_medium_tier_elevates_priority(self):
        rec = recommend_dispatch(
            trust_tier=TrustTier.MEDIUM,
            severity="critical",
            need_type="food",
            capacity_available=True,
        )
        assert rec.action == DispatchAction.HUMAN_REVIEW.value
        assert rec.priority == PriorityLevel.ELEVATED.value
        assert "Critical severity elevates review priority" in " ".join(rec.reasons)

    def test_low_tier_held_and_flagged(self):
        # Low tier is held regardless of capacity
        rec_with_cap = recommend_dispatch(
            trust_tier=TrustTier.LOW,
            severity="high",
            need_type="food",
            capacity_available=True,
        )
        assert rec_with_cap.action == DispatchAction.HOLD_AND_FLAG.value

        rec_no_cap = recommend_dispatch(
            trust_tier=TrustTier.LOW,
            severity="low",
            need_type="transport",
            capacity_available=False,
        )
        assert rec_no_cap.action == DispatchAction.HOLD_AND_FLAG.value

    def test_unknown_capacity_safe_fallback(self):
        # Unknown capacity (None) must never auto-dispatch
        rec_high = recommend_dispatch(
            trust_tier=TrustTier.HIGH,
            severity="medium",
            need_type="food",
            capacity_available=None,
        )
        assert rec_high.action == DispatchAction.HUMAN_REVIEW.value
        assert "Capacity availability is unknown" in " ".join(rec_high.reasons)

        rec_low = recommend_dispatch(
            trust_tier=TrustTier.LOW,
            severity="medium",
            need_type="food",
            capacity_available=None,
        )
        assert rec_low.action == DispatchAction.HOLD_AND_FLAG.value

    def test_review_or_hold_cannot_become_auto_dispatch_by_score_bonus(self):
        # Medium tier cannot auto dispatch even if capacity is confirmed
        rec = recommend_dispatch(
            trust_tier=TrustTier.MEDIUM,
            severity="low",
            need_type="food",
            capacity_available=True,
        )
        assert rec.action != DispatchAction.AUTO_DISPATCH.value


# =============================================================================
# 5. PRIVACY, SAFETY AND EXPLAINABILITY TESTS
# =============================================================================

class TestPrivacyAndSafety:
    """Verifies no raw PII in output messages and strict isolation."""

    def test_no_raw_phone_in_metadata_or_reasons(self):
        raw_phone = "9876543210"
        masked = mask_phone(raw_phone)
        assert masked == "******3210"
        assert raw_phone not in masked

        req = NeedRequest(
            need_type="food",
            item="cooked meals",
            quantity=100,
            unit="meals",
            reporter_phone=raw_phone,
            location_description="Relief Camp 1",
        )
        res = calculate_trust_score(req, EvidenceInput())
        assert res.metadata["masked_reporter_phone"] == "******3210"
        for reason in res.reasons:
            assert raw_phone not in reason

    def test_output_json_serializable(self):
        req = NeedRequest(
            need_type="food",
            item="cooked meals",
            quantity=100,
            unit="meals",
            reporter_phone="9876543210",
            location_description="Relief Camp 1",
        )
        res = calculate_trust_score(req, EvidenceInput(capacity_available=True))
        d = res.to_dict()
        assert isinstance(d, dict)
        assert d["valid"] is True
        assert "engine_version" in d
        assert "component_breakdown" in d
