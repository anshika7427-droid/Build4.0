"""
ai_processing/gemini_processor.py
==================================
Backward compatibility wrapper for AI extraction.
Delegates canonical extraction logic to backend.services.ai.
"""

from typing import Any, Dict
from backend.services.ai import (
    extract_need_ai,
    extract_need_deterministic,
    _call_groq,
    _call_gemini,
    _parse_and_validate,
    _normalize_extraction,
    _extract_json_text,
    _gemini_model,
)

# Backward-compatibility attribute export for test runners patching gemini_processor.client
client = None

def process_need_text(description: str) -> Dict[str, Any]:
    """
    Backward-compatible wrapper for extract_need_ai.
    Extracts structured emergency need fields from unstructured text.
    """
    return extract_need_ai(description)