import json
import os
import re
from typing import Any, Dict, Optional
import requests
from dotenv import load_dotenv

# Try importing Google GenAI SDK if present
try:
    from google import genai
except ImportError:
    genai = None

from ai_processing.prompts import (
    build_prompt,
    VALID_CATEGORIES,
    VALID_SEVERITIES,
    VALID_URGENCIES,
)

# Load configuration
load_dotenv(dotenv_path="config/.env")

_gemini_api_key = os.getenv("GEMINI_API_KEY")
client = genai.Client(api_key=_gemini_api_key) if (genai and _gemini_api_key) else None


class GeminiModelWrapper:
    def generate_content(self, contents, **kwargs):
        if not client:
            raise ValueError("GEMINI_API_KEY is not configured")
        return client.models.generate_content(
            model="gemini-2.0-flash", contents=contents, **kwargs
        )


_gemini_model = GeminiModelWrapper()

_GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
_GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"

SYSTEM_CONTROLLED_FIELDS = {
    "id",
    "status",
    "trust_score",
    "verified",
    "dispatch_action",
    "priority",
    "reasons",
    "reporter_name",
    "reporter_phone",
    "fulfilled_quantity",
    "lat",
    "lng",
}


def _extract_json_text(raw_response: Any) -> str:
    """Extract a JSON object string from arbitrary model output."""
    if raw_response is None:
        raise ValueError("AI response is empty")

    if isinstance(raw_response, dict):
        return json.dumps(raw_response)

    if isinstance(raw_response, list):
        raise ValueError("AI response is a list, expected a JSON object")

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


def _normalize_extraction(parsed: Dict[str, Any], source: str) -> Dict[str, Any]:
    """Strictly normalize and validate extracted AI fields."""
    if not isinstance(parsed, dict):
        raise ValueError("AI response JSON is not an object")

    # Strip any system-controlled fields attempted by the model
    clean_dict = {k: v for k, v in parsed.items() if k not in SYSTEM_CONTROLLED_FIELDS}

    # 1. Category
    raw_cat = str(clean_dict.get("category", "other")).strip().lower()
    category = raw_cat if raw_cat in VALID_CATEGORIES else "other"

    # 2. Severity
    raw_sev = (
        str(clean_dict.get("severity", "medium"))
        .strip()
        .lower()
        .replace("_", " ")
        .replace("-", " ")
    )
    sev_map = {
        "emergency": "high",
        "urgent": "high",
        "catastrophic": "critical",
        "extreme": "critical",
        "moderate": "medium",
        "minor": "low",
    }
    raw_sev = sev_map.get(raw_sev, raw_sev)
    severity = raw_sev if raw_sev in VALID_SEVERITIES else "medium"

    # 3. Urgency
    raw_urg = (
        str(clean_dict.get("urgency", severity))
        .strip()
        .lower()
        .replace("_", " ")
        .replace("-", " ")
    )
    urgency_map = {
        "emergency": "critical",
        "immediate": "critical",
        "urgent": "high",
        "moderate": "medium",
        "routine": "low",
    }
    raw_urg = urgency_map.get(raw_urg, raw_urg)
    urgency = raw_urg if raw_urg in VALID_URGENCIES else ("critical" if severity in ["critical", "very high"] else "medium")

    # 4. Consistency
    raw_cons = clean_dict.get("consistency")
    if isinstance(raw_cons, bool):
        consistency = None
    else:
        try:
            val = int(raw_cons) if raw_cons is not None else None
            consistency = val if (val is not None and 1 <= val <= 10) else None
        except (TypeError, ValueError):
            consistency = None

    # 5. Resource Type
    raw_res = clean_dict.get("resource_type")
    if raw_res and str(raw_res).strip():
        resource_type = str(raw_res).strip().lower()
    else:
        resource_type = category if category != "other" else "supplies"

    # 6. Quantity & Unit
    raw_qty = clean_dict.get("quantity")
    qty = None
    if raw_qty is not None and not isinstance(raw_qty, bool):
        try:
            val = int(raw_qty)
            if val > 0:
                qty = val
        except (TypeError, ValueError):
            qty = None

    raw_unit = clean_dict.get("unit")
    unit = str(raw_unit).strip().lower() if raw_unit and str(raw_unit).strip().lower() not in ["null", "none"] else None
    if resource_type == "food" and unit in [None, "people", "person", "persons", "units"]:
        unit = "meals"
    elif resource_type == "water" and unit in [None, "people", "person", "persons", "units"]:
        unit = "litres"
    elif resource_type == "shelter" and unit in [None, "people", "person", "persons", "units"]:
        unit = "blankets"
    elif not unit:
        unit = "units"

    # 7. Location Entity
    raw_loc = clean_dict.get("location_entity")
    location_entity = None
    if raw_loc and str(raw_loc).strip() and str(raw_loc).strip().lower() not in ["unknown", "unknown location", "none", "null"]:
        location_entity = str(raw_loc).strip()

    return {
        "resource_type": resource_type,
        "quantity": qty,
        "unit": unit,
        "location_entity": location_entity,
        "urgency": urgency,
        "category": category,
        "severity": severity,
        "consistency": consistency,
        "extraction_source": source,
    }


def _parse_and_validate(raw_response: Any, source: str) -> Dict[str, Any]:
    json_text = _extract_json_text(raw_response)
    parsed = json.loads(json_text)
    return _normalize_extraction(parsed, source)


def _fetch_tinyfish_context(description: str) -> Optional[str]:
    """
    Adapter for TinyFish API to retrieve relevant external web context
    (e.g., official disaster updates, relief camp announcements).
    Safe, bounded execution with isolated untrusted output.
    """
    agent_key = os.getenv("TINY_FISH_AGENT") or os.getenv("TINYFISH_API_KEY")
    if not agent_key or os.getenv("DISABLE_TINYFISH"):
        return None

    url = os.getenv("TINYFISH_API_URL", "https://api.tinyfish.io/v1/context")
    try:
        headers = {
            "Authorization": f"Bearer {agent_key}",
            "Content-Type": "application/json",
        }
        payload = {"query": description[:200], "max_results": 2}
        resp = requests.post(url, headers=headers, json=payload, timeout=5)
        if resp.status_code == 200:
            data = resp.json()
            if isinstance(data, dict) and data.get("context"):
                context_str = str(data["context"]).strip()
                return context_str[:500]
    except Exception:
        pass
    return None


def _call_groq(prompt: str, context: Optional[str] = None) -> Dict[str, Any]:
    groq_api_key = os.getenv("GROQ_API_KEY")
    if not groq_api_key:
        raise ValueError("GROQ_API_KEY is not configured")

    headers = {
        "Authorization": f"Bearer {groq_api_key}",
        "Content-Type": "application/json",
    }

    user_content = prompt
    if context:
        user_content = f"External public context (UNTRUSTED REFERENCE):\n{context}\n\n{prompt}"

    payload = {
        "model": _GROQ_MODEL,
        "messages": [
            {"role": "system", "content": "Return strict JSON only."},
            {"role": "user", "content": user_content},
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0,
    }

    response = requests.post(_GROQ_API_URL, headers=headers, json=payload, timeout=15)
    response.raise_for_status()
    response_json = response.json()
    raw_text = response_json.get("choices", [{}])[0].get("message", {}).get("content", "")
    source = "tinyfish_groq_ai" if context else "groq_ai"
    return _parse_and_validate(raw_text, source)


def _call_gemini(prompt: str) -> Dict[str, Any]:
    if _gemini_model is None or not os.getenv("GEMINI_API_KEY"):
        raise ValueError("Gemini model is not configured")
    response = _gemini_model.generate_content(prompt)
    direct_text = (getattr(response, "text", "") or "").strip()
    return _parse_and_validate(direct_text, "gemini_ai")


def extract_need_deterministic(text: str) -> Dict[str, Any]:
    """
    Deterministic rule-based extractor for emergency distress reports.
    Provides transparent, conservative extraction when external AI providers
    fail or are unconfigured.
    NEVER fabricates guessed quantities, unknown locations, or false confidence.
    """
    cleaned = (text or "").strip()
    if not cleaned:
        return {
            "resource_type": "supplies",
            "quantity": None,
            "unit": None,
            "location_entity": None,
            "urgency": "medium",
            "category": "other",
            "severity": "medium",
            "consistency": None,
            "extraction_source": "deterministic_fallback",
            "error": "empty input",
        }

    lowered = cleaned.lower()

    # 1. Quantity & Unit
    qty = None
    unit = None
    qty_match = re.search(
        r'(\d+)\s*(meals?|food packets?|rations?|blankets?|tents?|kits?|water bottles?|litres?|people|persons?|patients?)?',
        lowered,
    )
    if qty_match:
        try:
            val = int(qty_match.group(1))
            if val > 0:
                qty = val
                extracted_unit = qty_match.group(2)
                if extracted_unit:
                    unit = extracted_unit.strip()
        except (ValueError, TypeError):
            qty = None

    # 2. Resource Type & Category
    resource_type = "supplies"
    category = "supplies"

    if any(k in lowered for k in ["meal", "food", "ration", "cook", "grain", "hunger"]):
        resource_type = "food"
        category = "supplies"
        if unit in [None, "people", "persons"]:
            unit = "meals"
    elif any(k in lowered for k in ["water", "drinking water"]):
        resource_type = "water"
        category = "supplies"
        if unit in [None, "people"]:
            unit = "litres"
    elif any(k in lowered for k in ["blanket", "tent", "tarp", "tarpaulin", "cloth", "sheet"]):
        resource_type = "shelter"
        category = "supplies"
        if unit in [None, "people"]:
            unit = "blankets"
    elif any(k in lowered for k in ["doctor", "medic", "injury", "bleeding", "first-aid", "hospital", "patient", "medicine"]):
        resource_type = "medical"
        category = "medical"
    elif any(k in lowered for k in ["trapped", "collapse", "drowning", "flood rescue", "boat", "evacuate", "rescue"]):
        resource_type = "rescue"
        category = "rescue"
    elif any(k in lowered for k in ["driver", "truck", "transport", "delivery", "vehicle", "van"]):
        resource_type = "logistics"
        category = "logistics"
    else:
        resource_type = "supplies"
        category = "other"

    # 3. Urgency & Severity
    urgency = "medium"
    severity = "medium"
    if re.search(r'\b(collapse|trapped|drowning|unconscious|catastrophic)\b', lowered):
        urgency = "critical"
        severity = "critical"
    elif re.search(r'\b(urgent|urgently|emergency|immediate|sos|now|critical|dying)\b', lowered):
        urgency = "high"
        severity = "high"
    elif re.search(r'\b(routine|low|whenever)\b', lowered):
        urgency = "low"
        severity = "low"

    # 4. Location Entity
    location_entity = None
    loc_match = re.search(
        r'(?:at|in|near|camp in)\s+([A-Za-z0-9\s,\-]+?)(?:\s+(?:need|needs|requir|urgently|help|\.|$))',
        cleaned,
        re.I,
    )
    if loc_match:
        matched_loc = loc_match.group(1).strip()
        if len(matched_loc) > 2 and matched_loc.lower() not in ["the", "a", "need", "urgent"]:
            location_entity = matched_loc

    return {
        "resource_type": resource_type,
        "quantity": qty,
        "unit": unit,
        "location_entity": location_entity,
        "urgency": urgency,
        "category": category,
        "severity": severity,
        "consistency": None,
        "extraction_source": "deterministic_fallback",
    }


def extract_need_ai(description: str) -> Dict[str, Any]:
    """
    Main entry point for AI extraction.
    1. Fetches optional TinyFish web context.
    2. Tries Groq LLM (primary).
    3. Tries Gemini LLM (secondary).
    4. Falls back to deterministic rule-based extractor.
    """
    cleaned = (description or "").strip()
    if not cleaned or len(cleaned) < 3:
        return extract_need_deterministic("")

    prompt = build_prompt(cleaned)

    # 1. External Web Context via TinyFish (optional)
    context = _fetch_tinyfish_context(cleaned)

    # 2. Primary: Groq API
    if os.getenv("GROQ_API_KEY"):
        try:
            return _call_groq(prompt, context=context)
        except Exception as groq_err:
            print(f"[AI] Groq extraction failed: {groq_err}. Trying Gemini...")

    # 3. Secondary: Gemini API
    if os.getenv("GEMINI_API_KEY"):
        try:
            return _call_gemini(prompt)
        except Exception as gemini_err:
            print(f"[AI] Gemini extraction failed: {gemini_err}. Trying deterministic fallback...")

    # 4. Fallback: Deterministic Rule-Based Engine
    return extract_need_deterministic(cleaned)
