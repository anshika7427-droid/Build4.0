"""
tests/test_ai_extraction_persistence.py
=========================================
Automated test suite verifying the AI extraction, request normalization,
HTTP error handling, coordinate bounds, and persistence boundary.

Covers all 13 required verification cases from the Final Blocking Repair Prompt.
"""

import json
import os
import sys
from unittest.mock import MagicMock, patch
import pytest
from fastapi import BackgroundTasks, HTTPException

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from backend.services.ai import (
    extract_need_ai,
    extract_need_deterministic,
    _parse_and_validate,
    _normalize_extraction,
    _extract_json_text,
    _fetch_tinyfish_context,
)
from backend.models import NeedInput
from backend.routes.need import process_and_save_need
from database.needs_db import save_need


class TestExtractionCorrectness:
    """Tests 1-6: Extraction parsing, quantity handling, and guardrails."""

    @patch("backend.routes.need.get_coordinates")
    @patch("backend.routes.need.save_need")
    def test_01_valid_report_explicit_positive_quantity(self, mock_save, mock_geocode):
        mock_geocode.return_value = {"lat": 11.6854, "lng": 76.1320}
        mock_save.return_value = "doc-pos-123"

        bg = BackgroundTasks()
        inp = NeedInput(
            reporter_name="Valid Reporter",
            description="Need 200 cooked meals at Wayanad relief camp",
            location_text="Wayanad",
            required_quantity=200,
            unit="meals"
        )
        res = process_and_save_need(inp, bg)
        assert res["required_quantity"] == 200
        assert res["unit"] == "meals"
        assert res["id"] == "doc-pos-123"
        assert mock_save.called

    @patch.dict(os.environ, {"GROQ_API_KEY": ""})
    def test_02_quantity_missing_from_user_and_ai(self):
        res = extract_need_deterministic("Need drinking water at Kanpur center")
        assert res["quantity"] is None
        assert res["resource_type"] == "water"
        assert res["category"] == "supplies"

    def test_03_zero_negative_boolean_malformed_quantities(self):
        bg = BackgroundTasks()
        # Zero explicit quantity raises 400
        with pytest.raises(HTTPException) as exc_zero:
            process_and_save_need(NeedInput(description="Need food at Wayanad", location_text="Wayanad", required_quantity=0, lat=11.1, lng=76.1), bg)
        assert exc_zero.value.status_code == 400

        # Negative explicit quantity raises 400
        with pytest.raises(HTTPException) as exc_neg:
            process_and_save_need(NeedInput(description="Need food at Wayanad", location_text="Wayanad", required_quantity=-50, lat=11.1, lng=76.1), bg)
        assert exc_neg.value.status_code == 400

        # Boolean in normalization becomes None
        raw_bool = {"quantity": True, "consistency": True}
        res_bool = _normalize_extraction(raw_bool, "test")
        assert res_bool["quantity"] is None
        assert res_bool["consistency"] is None

        # Out-of-range or malformed consistency becomes None
        res_oor = _normalize_extraction({"consistency": 99}, "test")
        assert res_oor["consistency"] is None
        res_neg = _normalize_extraction({"consistency": -5}, "test")
        assert res_neg["consistency"] is None
        res_str = _normalize_extraction({"consistency": "invalid"}, "test")
        assert res_str["consistency"] is None

    @patch("backend.routes.need.check_reporter_reputation")
    @patch("backend.routes.need.check_duplicate_and_rate_limit")
    @patch("backend.routes.need.get_coordinates")
    @patch("backend.routes.need.save_need")
    @patch("backend.routes.need._auto_match_for_need")
    def test_04_unknown_quantity_cannot_create_actionable_record(self, mock_match, mock_save, mock_geocode, mock_dup, mock_rep):
        """Replaces legacy test 22: Unknown quantity must NEVER be 0/100/200 and NEVER auto-dispatch."""
        mock_geocode.return_value = {"lat": 26.4499, "lng": 80.3319}
        mock_save.return_value = "doc-unk-999"
        mock_dup.return_value = {"is_identical_text": False, "recent_reports_count_one_hour": 0, "text_hash": "hash_unk"}
        mock_rep.return_value = {"is_registered_ngo_or_camp": False, "has_resolved_history": False, "is_flagged_history": False, "flagged_deduction": 0}

        bg = BackgroundTasks()
        inp = NeedInput(
            reporter_name="John",
            description="Need food supplies at Kanpur",
            location_text="Kanpur"
        )
        res = process_and_save_need(inp, bg)
        assert res["required_quantity"] is None
        assert res["dispatch_action"] == "secondary_review"
        assert res["status"] == "secondary_review"
        assert res["dispatch_action"] != "auto_dispatch"
        mock_match.assert_not_called()

    @patch("database.needs_db.get_db_cursor")
    def test_05_save_need_preserves_unknown_quantity_as_null(self, mock_cursor_cm):
        mock_cur = MagicMock()
        mock_cursor_cm.return_value.__enter__.return_value = mock_cur

        data = {
            "id": "need-null-qty",
            "reporter_name": "Test",
            "location_text": "Delhi",
            "description": "Need assistance",
            "lat": 28.6139,
            "lng": 77.2090,
            "required_quantity": None,
            "category": "supplies",
            "status": "secondary_review"
        }
        doc_id = save_need(data)
        assert doc_id == "need-null-qty"
        assert mock_cur.execute.call_count >= 1
        insert_calls = [c for c in mock_cur.execute.call_args_list if len(c[0]) > 0 and "INSERT INTO" in str(c[0][0])]
        assert len(insert_calls) == 1
        args = insert_calls[0][0][1]
        # index 18 corresponds to required_quantity parameter
        assert args[18] is None

    def test_06_invalid_ai_json_or_field_types_cannot_reach_persistence(self):
        with pytest.raises(ValueError, match="No JSON object found"):
            _parse_and_validate("Not valid json", "test")

        raw_hacked = {
            "category": "rescue",
            "severity": "high",
            "id": "hacked-id",
            "trust_score": 100,
            "dispatch_action": "auto_dispatch"
        }
        clean = _normalize_extraction(raw_hacked, "test")
        assert "id" not in clean
        assert "trust_score" not in clean
        assert "dispatch_action" not in clean


class TestProviderResilience:
    """Tests 7-9: AI providers, TinyFish context, and coordinate safety."""

    @patch.dict(os.environ, {"GROQ_API_KEY": "fake_groq", "GEMINI_API_KEY": "fake_gemini"})
    @patch("backend.services.ai._call_groq")
    @patch("backend.services.ai._call_gemini")
    def test_07_groq_and_gemini_failures_use_deterministic_fallback(self, mock_groq, mock_gemini):
        mock_groq.side_effect = Exception("Groq offline")
        mock_gemini.side_effect = Exception("Gemini offline")

        res = extract_need_ai("Need 50 blankets at Kanpur shelter")
        assert res["category"] == "supplies"
        assert res["quantity"] == 50
        assert res["extraction_source"] == "deterministic_fallback"

    @patch("backend.routes.need.get_coordinates")
    @patch("backend.routes.need.save_need")
    def test_08_unresolved_geocoding_blocks_unsafe_persistence(self, mock_save, mock_geocode):
        mock_geocode.return_value = {"lat": 0.0, "lng": 0.0}
        bg = BackgroundTasks()
        inp = NeedInput(
            reporter_name="John",
            description="Emergency help needed at Atlantis Island",
            location_text="Atlantis Island"
        )
        with pytest.raises(HTTPException) as exc_info:
            process_and_save_need(inp, bg)
        assert exc_info.value.status_code == 400
        mock_save.assert_not_called()

    @patch("backend.routes.need.save_need")
    def test_09_valid_zero_latitude_or_longitude_coordinates_handled_correctly(self, mock_save):
        mock_save.return_value = "doc-zero-coord"
        bg = BackgroundTasks()

        # Location on equator (lat=0.0, lng=25.0) is valid!
        inp_equator = NeedInput(
            description="Need food at equator camp",
            location_text="Equator Camp",
            lat=0.0,
            lng=25.0,
            required_quantity=100
        )
        res_eq = process_and_save_need(inp_equator, bg)
        assert res_eq["lat"] == 0.0
        assert res_eq["lng"] == 25.0

        # Location on prime meridian (lat=51.5, lng=0.0) is valid!
        inp_meridian = NeedInput(
            description="Need medical supplies at London camp",
            location_text="Greenwich Camp",
            lat=51.5,
            lng=0.0,
            required_quantity=50
        )
        res_mer = process_and_save_need(inp_meridian, bg)
        assert res_mer["lat"] == 51.5
        assert res_mer["lng"] == 0.0


class TestErrorAndCompatibilitySafety:
    """Tests 10-13: HTTP exception handling, side-effect safety, and legacy compatibility."""

    @patch("backend.routes.need.get_coordinates")
    @patch("backend.routes.need.save_need")
    @patch("backend.routes.need._auto_match_for_need")
    @patch("backend.routes.need.send_alert")
    def test_10_database_failure_returns_http_500_and_no_side_effects(self, mock_alert, mock_match, mock_save, mock_geocode):
        mock_geocode.return_value = {"lat": 11.6854, "lng": 76.1320}
        mock_save.side_effect = Exception("Fatal PostgreSQL Connection Error")

        bg = BackgroundTasks()
        inp = NeedInput(
            description="Building collapsed in Wayanad, 3 people trapped",
            location_text="Wayanad",
            required_quantity=10
        )
        with pytest.raises(HTTPException) as exc_info:
            process_and_save_need(inp, bg)
        assert exc_info.value.status_code == 500
        assert "Database persistence failed" in exc_info.value.detail
        mock_match.assert_not_called()
        mock_alert.assert_not_called()

    @patch("backend.routes.need.get_coordinates")
    @patch("backend.routes.need.save_need")
    def test_11_successful_persistence_returns_valid_id(self, mock_save, mock_geocode):
        mock_geocode.return_value = {"lat": 11.6854, "lng": 76.1320}
        mock_save.return_value = "doc-success-777"

        bg = BackgroundTasks()
        inp = NeedInput(
            reporter_name="Valid Reporter",
            reporter_phone="9876543210",
            description="Cooked meals needed for flood victims in Wayanad",
            location_text="Wayanad",
            required_quantity=100
        )
        res = process_and_save_need(inp, bg)
        assert res["id"] == "doc-success-777"
        assert res["need_id"] == "doc-success-777"
        assert res["required_quantity"] == 100

    def test_12_existing_request_aliases_and_legacy_callers(self):
        inp = NeedInput(name="Alice", phone="9876543210", address="Delhi", quantity=30)
        assert inp.reporter_name == "Alice"
        assert inp.reporter_phone == "9876543210"
        assert inp.location_text == "Delhi"
        assert inp.required_quantity == 30

        from ai_processing.gemini_processor import process_need_text
        with patch("ai_processing.gemini_processor.extract_need_ai") as mock_ext:
            mock_ext.return_value = {"category": "supplies", "severity": "medium", "consistency": 7}
            legacy_res = process_need_text("Need supplies")
            assert legacy_res["category"] == "supplies"

    @patch("backend.routes.need.get_coordinates")
    @patch("backend.routes.need.save_need")
    def test_13_existing_golden_path_behavior_remains_compatible(self, mock_save, mock_geocode):
        mock_geocode.return_value = {"lat": 11.6854, "lng": 76.1320}
        mock_save.return_value = "golden-doc-1"

        bg = BackgroundTasks()
        inp = NeedInput(
            description="200 people at flood relief camp in Wayanad need cooked meals urgently",
            location_text="Wayanad"
        )
        res = process_and_save_need(inp, bg)
        assert res["id"] == "golden-doc-1"
        assert res["resource_type"] == "food"
        assert res["unit"] == "meals"


class TestDeterministicSeverityAndExtraction:
    """Mandatory Section 7 verification test suite for exact reports."""

    def test_case_1_explicit_item_and_quantity(self):
        res = extract_need_deterministic("Need 50 blankets at the relief camp.")
        assert res["quantity"] == 50
        assert res["resource_type"] in ["shelter", "supplies"]
        assert res["unit"] == "blankets"
        assert res["location_entity"] in [None, "relief camp", "the relief camp"]
        assert res["urgency"] in ["medium", "routine"]

    def test_case_2_explicit_item_quantity_urgency(self):
        res = extract_need_deterministic("Need 50 blankets urgently at the relief camp.")
        assert res["quantity"] == 50
        assert res["resource_type"] in ["shelter", "supplies"]
        assert res["unit"] == "blankets"
        assert res["urgency"] == "high"

    def test_case_3_critical_water_shortage(self):
        res = extract_need_deterministic("Critical shortage of drinking water; people have no safe water.")
        assert res["quantity"] is None  # missing quantity is NOT fabricated
        assert res["resource_type"] == "water"
        assert res["severity"] in ["high", "critical"]
        assert res["urgency"] in ["critical", "high"]

    def test_case_4_ambiguous_supplies_no_fabricated_details(self):
        res = extract_need_deterministic("We need supplies.")
        assert res["quantity"] is None  # missing quantity is NOT fabricated
        assert res["resource_type"] == "supplies"
        assert res["location_entity"] is None  # no fabricated location
        assert res["consistency"] is None  # missing confidence is None

    @patch("backend.services.ai._call_groq")
    @patch("backend.services.ai._call_gemini")
    def test_case_5_empty_input_no_provider_calls_or_persistence(self, mock_gemini, mock_groq):
        res = extract_need_ai("")
        assert res["quantity"] is None
        assert res["consistency"] is None
        assert res.get("error") == "empty input"
        mock_groq.assert_not_called()
        mock_gemini.assert_not_called()
