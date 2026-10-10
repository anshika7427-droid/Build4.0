import json
import os
import re
from typing import Any, Dict
import requests
from dotenv import load_dotenv

# Try importing Google GenAI SDK if present
try:
    from google import genai
except ImportError:
    genai = None

from ai_processing.prompts import build_prompt, VALID_CATEGORIES, VALID_SEVERITIES

# Load from shared config folder
load_dotenv(dotenv_path="config/.env")

_gemini_api_key = os.getenv("GEMINI_API_KEY")
client = genai.Client(api_key=_gemini_api_key) if (genai and _gemini_api_key) else None

class GeminiModelWrapper:
    def generate_content(self, contents, **kwargs):
        if not client:
            raise ValueError("GEMINI_API_KEY is not configured")
        return client.models.generate_content(
            model="gemini-2.0-flash",
            contents=contents,
            **kwargs
        )

_gemini_model = GeminiModelWrapper()

_GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
_GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"

def extract_need_deterministic(text: str) -> Dict[str, Any]:
    """
    Deterministic rule-based extractor for emergency distress reports.
    Guarantees clean, transparent extraction when external LLM providers
    are unconfigured, timed out, or offline.
    """
    cleaned = (text or "").strip()
    lowered = cleaned.lower()

    # 1. Quantity & Unit
    # Patterns like: "200 meals", "200 people ... cooked meals", "50 blankets", "100 water bottles"
    qty = 0
    unit = "units"
    qty_match = re.search(r'(\d+)\s*(meals?|food packets?|rations?|blankets?|tents?|kits?|water bottles?|litres?|people|persons?|patients?)?', lowered)
    if qty_match:
        try:
            qty = int(qty_match.group(1))
            extracted_unit = qty_match.group(2)
            if extracted_unit:
                unit = extracted_unit.strip()
        except (ValueError, TypeError):
            qty = 0

    # 2. Resource Type & Category
    resource_type = "supplies"
    category = "supplies"
    
    if any(k in lowered for k in ["meal", "food", "ration", "cook", "grain", "hunger"]):
        resource_type = "food"
        category = "supplies"
        if unit in ["units", "people", "persons"]:
            unit = "meals"
    elif any(k in lowered for k in ["water", "drinking water"]):
        resource_type = "water"
        category = "supplies"
        if unit in ["units", "people"]:
            unit = "litres"
    elif any(k in lowered for k in ["blanket", "tent", "tarp", "tarpaulin", "cloth", "sheet"]):
        resource_type = "shelter"
        category = "supplies"
        if unit in ["units", "people"]:
            unit = "blankets"
    elif any(k in lowered for k in ["doctor", "medic", "injury", "bleeding", "first-aid", "ambulance", "hospital", "patient"]):
        resource_type = "medical"
        category = "medical"
    elif any(k in lowered for k in ["trapped", "collapse", "drowning", "flood rescue", "boat", "evacuate", "rescue"]):
        resource_type = "rescue"
        category = "rescue"
    elif any(k in lowered for k in ["driver", "truck", "transport", "delivery", "vehicle", "van"]):
        resource_type = "logistics"
        category = "logistics"

    # 3. Urgency & Severity
    urgency = "medium"
    severity = "medium"
    if any(k in lowered for k in ["urgent", "urgently", "emergency", "immediate", "sos", "now", "critical", "dying"]):
        urgency = "high"
        severity = "high"
    if any(k in lowered for k in ["collapse", "trapped", "drowning", "unconscious", "catastrophic"]):
        urgency = "critical"
        severity = "critical"
    elif any(k in lowered for k in ["routine", "low", "whenever"]):
        urgency = "low"
        severity = "low"

    # 4. Location Entity
    location_entity = "Unknown Location"
    loc_match = re.search(r'(?:at|in|near|camp in)\s+([A-Za-z0-9\s,\-]+?)(?:\s+(?:need|needs|requir|urgently|help|\.|$))', cleaned, re.I)
    if loc_match:
        location_entity = loc_match.group(1).strip()
    elif "wayanad" in lowered:
        location_entity = "Wayanad Relief Camp"
    elif "kanpur" in lowered:
        location_entity = "Kanpur"

    return {
        "resource_type": resource_type,
        "quantity": qty if qty > 0 else 100,
        "unit": unit,
        "location_entity": location_entity,
        "urgency": urgency,
        "category": category,
        "severity": severity,
        "consistency": 8,
        "extraction_source": "deterministic_fallback"
    }

def _extract_json_text(raw_response: Any) -> str:
    """Extract a JSON object string from arbitrary model output."""
    if raw_response is None:
        raise ValueError("AI response is empty")

    if isinstance(raw_response, (dict, list)):
        return json.dumps(raw_response)

    raw_text = str(raw_response).strip()
    if not raw_text:
        raise ValueError("AI response text is empty")

    fenced_match = re.search(
        r"```(?:json)?\s*(\{.*?\})\s*```", raw_text, flags=re.DOTALL | re.IGNORECASE
    )
    if fenced_match:
        return fenced_match.group(1).strip()

    first_brace = raw_text.find("{")
    last_brace = raw_text.rfind("}")
    if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
        return raw_text[first_brace : last_brace + 1].strip()

    raise ValueError("No JSON object found in AI response")

def _normalize_classification(parsed: Dict[str, Any], source: str) -> Dict[str, Any]:
    """Normalize classifications to strict schema validation."""
    category = str(parsed.get("category", "other")).strip().lower()
    if category not in VALID_CATEGORIES:
        category = "other"

    severity = (
        str(parsed.get("severity", "medium"))
        .strip()
        .lower()
        .replace("_", " ")
        .replace("-", " ")
    )
    if severity not in VALID_SEVERITIES:
        severity = "medium"

    try:
        consistency = int(parsed.get("consistency", 5))
    except (TypeError, ValueError):
        consistency = 5
    consistency = max(1, min(10, consistency))

    qty = 0
    try:
        if parsed.get("quantity") is not None:
            qty = int(parsed["quantity"])
    except (TypeError, ValueError):
        qty = 0

    return {
        "resource_type": str(parsed.get("resource_type") or category or "food").lower(),
        "quantity": qty,
        "unit": str(parsed.get("unit") or "units").lower(),
        "location_entity": str(parsed.get("location_entity") or "Unknown Location"),
        "urgency": str(parsed.get("urgency") or severity or "medium").lower(),
        "category": category,
        "severity": severity,
        "consistency": consistency,
        "extraction_source": source
    }

def _parse_and_validate(raw_response: Any, source: str) -> Dict[str, Any]:
    json_text = _extract_json_text(raw_response)
    parsed = json.loads(json_text)
    if not isinstance(parsed, dict):
        raise ValueError("AI response JSON is not an object")
    return _normalize_classification(parsed, source)

def _call_groq(prompt: str) -> Dict[str, Any]:
    groq_api_key = os.getenv("GROQ_API_KEY")
    if not groq_api_key:
        raise ValueError("GROQ_API_KEY is not configured")

    headers = {
        "Authorization": f"Bearer {groq_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": _GROQ_MODEL,
        "messages": [
            {"role": "system", "content": "Return strict JSON only."},
            {"role": "user", "content": prompt},
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0,
    }

    response = requests.post(_GROQ_API_URL, headers=headers, json=payload, timeout=15)
    response.raise_for_status()
    response_json = response.json()
    raw_text = response_json.get("choices", [{}])[0].get("message", {}).get("content", "")
    return _parse_and_validate(raw_text, "groq_ai")

def _call_gemini(prompt: str) -> Dict[str, Any]:
    if _gemini_model is None or not os.getenv("GEMINI_API_KEY"):
        raise ValueError("Gemini model is not configured")
    response = _gemini_model.generate_content(prompt)
    direct_text = (getattr(response, "text", "") or "").strip()
    return _parse_and_validate(direct_text, "gemini_ai")

def process_need_text(description: str) -> Dict[str, Any]:
    """
    Extracts structured emergency need fields from unstructured text.
    1. Tries Groq LLM (Llama) if GROQ_API_KEY configured.
    2. Tries Gemini if GEMINI_API_KEY configured.
    3. Seamlessly falls back to deterministic rule-based extractor.
    """
    if not description or not description.strip():
        return extract_need_deterministic("emergency")

    prompt = build_prompt(description)

    # 1. Primary: Groq API (target stack)
    if os.getenv("GROQ_API_KEY"):
        try:
            return _call_groq(prompt)
        except Exception as groq_err:
            print(f"[AI] Groq failed: {groq_err}. Trying fallback...")

    # 2. Secondary: Gemini
    if os.getenv("GEMINI_API_KEY"):
        try:
            return _call_gemini(prompt)
        except Exception as gemini_err:
            print(f"[AI] Gemini failed: {gemini_err}. Trying deterministic fallback...")

    # 3. Transparent, reliable deterministic fallback
    return extract_need_deterministic(description)