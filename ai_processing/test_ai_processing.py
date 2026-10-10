"""
ai_processing/test_ai_processing.py
==================================
Unit tests for strict prompt schema and robust processor behavior.

These tests are fully offline and use mocks for all provider interactions.
"""

import json
import os
import sys
from unittest.mock import MagicMock, patch

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)


def _gemini_response(text: str):
    """Create a mock Gemini response object with a .text attribute."""
    resp = MagicMock()
    resp.text = text
    return resp


def _as_json(category: str = "supplies", severity: str = "medium", consistency: int = 7) -> str:
    """Return strict JSON string matching processor output contract."""
    return json.dumps(
        {
            "category": category,
            "severity": severity,
            "consistency": consistency,
        }
    )


class TestPrompts:
    """Prompt-level assertions to prevent schema and category drift."""

    def test_valid_categories_are_strict(self):
        from ai_processing.prompts import VALID_CATEGORIES
        assert VALID_CATEGORIES == ["medical", "rescue", "supplies", "logistics", "other"]

    def test_valid_severities_are_five_levels(self):
        from ai_processing.prompts import VALID_SEVERITIES
        assert VALID_SEVERITIES == ["low", "medium", "high", "very high", "critical"]

    def test_prompt_contains_expected_keys(self):
        from ai_processing.prompts import build_prompt
        prompt = build_prompt("Driver is needed to transport supplies at old age home")
        assert "category" in prompt
        assert "severity" in prompt
        assert "consistency" in prompt

    def test_prompt_contains_driver_logistics_guardrail(self):
        from ai_processing.prompts import build_prompt
        prompt = build_prompt("driver needed")
        assert "driver" in prompt.lower()
        assert "logistics" in prompt.lower()


class TestGeminiProcessor:
    """Processor behavior tests for parsing, validation, and fallback safety."""

    @patch.dict(os.environ, {"GROQ_API_KEY": "", "GEMINI_API_KEY": "fake_gemini"})
    @patch("backend.services.ai._gemini_model")
    def test_successful_gemini_parse_returns_strict_schema(self, mock_model):
        mock_model.generate_content.return_value = _gemini_response(
            _as_json("medical", "high", 8)
        )

        from ai_processing.gemini_processor import process_need_text

        result = process_need_text("Multiple injuries after bus accident")
        assert result["category"] == "medical"
        assert result["severity"] == "high"
        assert result["consistency"] == 8

    @patch.dict(os.environ, {"GROQ_API_KEY": "", "GEMINI_API_KEY": "fake_gemini"})
    @patch("backend.services.ai._gemini_model")
    def test_markdown_wrapped_json_is_safely_parsed(self, mock_model):
        raw = """```json
        {
          "category": "supplies",
          "severity": "medium",
          "consistency": 6
        }
        ```"""
        mock_model.generate_content.return_value = _gemini_response(raw)

        from ai_processing.gemini_processor import process_need_text

        result = process_need_text("Need food and drinking water")
        assert result["category"] == "supplies"
        assert result["severity"] == "medium"
        assert result["consistency"] == 6

    @patch.dict(os.environ, {"GROQ_API_KEY": "", "GEMINI_API_KEY": "fake_gemini"})
    @patch("backend.services.ai._gemini_model")
    def test_invalid_category_is_normalized_to_other(self, mock_model):
        mock_model.generate_content.return_value = _gemini_response(
            _as_json("transportation", "medium", 7)
        )

        from ai_processing.gemini_processor import process_need_text

        result = process_need_text("Need transport coordination")
        assert result["category"] == "other"

    @patch.dict(os.environ, {"GROQ_API_KEY": "", "GEMINI_API_KEY": "fake_gemini"})
    @patch("backend.services.ai._gemini_model")
    def test_invalid_severity_is_normalized_to_medium(self, mock_model):
        raw = json.dumps(
            {
                "category": "logistics",
                "severity": "invalid_sev",
                "consistency": 7,
            }
        )
        mock_model.generate_content.return_value = _gemini_response(raw)

        from ai_processing.gemini_processor import process_need_text

        result = process_need_text("Driver required for supply movement")
        assert result["severity"] == "medium"

    @patch.dict(os.environ, {"GROQ_API_KEY": "", "GEMINI_API_KEY": "fake_gemini"})
    @patch("backend.services.ai._gemini_model")
    def test_out_of_range_consistency_becomes_none(self, mock_model):
        from ai_processing.gemini_processor import process_need_text

        mock_model.generate_content.return_value = _gemini_response(
            _as_json("rescue", "critical", 99)
        )
        high_result = process_need_text("People trapped in debris")
        assert high_result["consistency"] is None

        mock_model.generate_content.return_value = _gemini_response(
            _as_json("rescue", "critical", -8)
        )
        low_result = process_need_text("People trapped in debris")
        assert low_result["consistency"] is None

    @patch.dict(os.environ, {"GROQ_API_KEY": "fake_groq", "GEMINI_API_KEY": "fake_gemini"})
    @patch("backend.services.ai._call_gemini")
    @patch("backend.services.ai._call_groq")
    def test_groq_failure_falls_back_to_gemini(self, mock_groq, mock_gemini):
        mock_groq.side_effect = Exception("Groq quota exceeded")
        mock_gemini.return_value = {
            "category": "logistics",
            "severity": "medium",
            "consistency": 7,
            "extraction_source": "gemini_ai"
        }

        from ai_processing.gemini_processor import process_need_text

        result = process_need_text("Driver needed to move supplies")
        assert result["category"] == "logistics"
        assert result["severity"] == "medium"
        mock_groq.assert_called_once()
        mock_gemini.assert_called_once()

    @patch.dict(os.environ, {"GROQ_API_KEY": "fake_groq", "GEMINI_API_KEY": "fake_gemini"})
    @patch("backend.services.ai._call_gemini")
    @patch("backend.services.ai._call_groq")
    def test_if_both_providers_fail_returns_safe_defaults(self, mock_groq, mock_gemini):
        mock_groq.side_effect = Exception("Groq down")
        mock_gemini.side_effect = Exception("Gemini down")

        from ai_processing.gemini_processor import process_need_text

        result = process_need_text("Unknown report")
        assert result["category"] == "other"
        assert result["severity"] == "medium"
        assert result["consistency"] is None
        assert result["extraction_source"] == "deterministic_fallback"

    def test_empty_input_returns_safe_defaults_with_error(self):
        from ai_processing.gemini_processor import process_need_text

        result = process_need_text("")
        assert result["category"] == "other"
        assert result["severity"] == "medium"
        assert result["consistency"] is None
        assert result.get("error") == "empty input"

    @patch.dict(os.environ, {"GROQ_API_KEY": "", "GEMINI_API_KEY": "fake_gemini"})
    @patch("backend.services.ai._gemini_model")
    def test_edge_case_driver_old_age_home_is_not_medical(self, mock_model):
        """Required edge case from the bug report."""
        mock_model.generate_content.return_value = _gemini_response(
            _as_json("logistics", "low", 8)
        )

        from ai_processing.gemini_processor import process_need_text

        result = process_need_text("Driver is needed to transport supplies at old age home")
        assert result["category"] == "logistics"
        assert result["category"] != "medical"
        assert result["severity"] in ["low", "medium"]

    @patch.dict(os.environ, {"GROQ_API_KEY": "", "GEMINI_API_KEY": "fake_gemini"})
    @patch("backend.services.ai._gemini_model")
    def test_edge_case_collapse_trapped_is_rescue_critical(self, mock_model):
        """Required edge case for high-stakes emergency classification."""
        mock_model.generate_content.return_value = _gemini_response(
            _as_json("rescue", "critical", 9)
        )

        from ai_processing.gemini_processor import process_need_text

        result = process_need_text("Building collapsed, 3 people trapped")
        assert result["category"] == "rescue"
        assert result["severity"] == "critical"