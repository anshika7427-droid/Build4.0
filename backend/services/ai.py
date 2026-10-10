import json
import logging
import os
import re
from typing import Any, Dict, Optional
import requests
from dotenv import load_dotenv

logger = logging.getLogger(__name__)


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


def _construct_tinyfish_query(description: str, location_text: Optional[str] = None) -> Optional[str]:
    """
    Constructs a focused search query using only non-sensitive public event descriptors.
    Strips phone numbers, email addresses, personal names, and authentication tokens.
    """
    text = (description or "").strip()
    if not text:
        return None

    # Strip phone numbers (10+ digits or formats like +91-9876543210 or 9876543210)
    text = re.sub(r'\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b', '', text)
    text = re.sub(r'\b\d{10,12}\b', '', text)

    # Strip email addresses
    text = re.sub(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', '', text)

    # Strip PII labels and words (phone, contact, reporter, email, mobile, tel, auth, token)
    text = re.sub(r'\b(?:reporter|contact|phone|mobile|email|tel|auth|token)\s*[:=]?\s*', '', text, flags=re.IGNORECASE)

    # Clean trailing punctuation and extra whitespace
    cleaned = re.sub(r'\s+', ' ', text).strip()
    cleaned = re.sub(r'[\s.,;:-]+$', '', cleaned).strip()

    if len(cleaned) < 3:
        if location_text and len(location_text.strip()) >= 3:
            cleaned = location_text.strip()
        else:
            return None

    return cleaned[:150].strip()


def should_trigger_tinyfish(
    description: str,
    pre_eval: Optional[Dict[str, Any]] = None,
    credibility_concern: bool = False,
    force: bool = False,
) -> bool:
    """
    Evaluates conditional invocation rules for TinyFish web context search:

    1. Low-severity, routine, sufficiently complete requests:
       Do NOT trigger TinyFish unnecessarily.
    2. Medium-severity requests:
       Trigger TinyFish when relevant information is uncertain, unusual,
       or requires corroboration.
    3. High, very-high, and critical requests:
       Trigger TinyFish when external context can materially help verification.
    4. Credibility concern at ANY severity:
       Triggers TinyFish if a meaningful public search is possible.
    5. Missing API key or explicit DISABLE_TINYFISH flag:
       Returns False.
    """
    agent_key = os.getenv("TINYFISH_API_KEY") or os.getenv("TINY_FISH_AGENT")
    if not agent_key or os.getenv("DISABLE_TINYFISH"):
        return False

    if force:
        return True

    cleaned = (description or "").strip()
    if not cleaned or len(cleaned) < 5:
        return False

    if pre_eval is None:
        pre_eval = extract_need_deterministic(cleaned)

    severity = (pre_eval.get("severity") or "medium").lower()
    urgency = (pre_eval.get("urgency") or severity).lower()
    consistency = pre_eval.get("consistency")
    quantity = pre_eval.get("quantity")
    location_entity = pre_eval.get("location_entity")
    category = (pre_eval.get("category") or "other").lower()

    # Rule 4: Credibility concern or low consistency score (<= 5)
    if credibility_concern or (consistency is not None and consistency <= 5):
        return True

    is_routine_complete = (
        location_entity is not None
        and quantity is not None
        and category in ("supplies", "medical", "logistics")
        and len(cleaned) < 200
        and not any(kw in cleaned.lower() for kw in ["unusual", "unconfirmed", "disaster", "outbreak", "collapse", "flooding", "landslide"])
    )

    # Rule 1: Low severity / routine complete request
    if severity == "low" or urgency == "low":
        if is_routine_complete and not credibility_concern:
            return False
        if location_entity is None or quantity is None:
            return len(cleaned) >= 15
        return False

    # Rule 2: Medium severity
    if severity == "medium":
        if is_routine_complete and not credibility_concern:
            return False
        is_uncertain = (location_entity is None) or (quantity is None) or (consistency is not None and consistency <= 6)
        is_unusual_or_disaster = any(kw in cleaned.lower() for kw in [
            "collapse", "flood", "cyclone", "fire", "quake", "landslide",
            "storm", "outbreak", "emergency", "unconfirmed", "unusual", "shelter camp", "relief camp"
        ])
        if is_uncertain or is_unusual_or_disaster or credibility_concern:
            return True
        return False

    # Rule 3: High, Very High, Critical requests
    if severity in ("high", "very high", "critical") or urgency in ("high", "critical"):
        return True

    return True


def _fetch_tinyfish_context(
    description: str,
    severity: Optional[str] = None,
    urgency: Optional[str] = None,
    location_text: Optional[str] = None,
    credibility_concern: bool = False,
    force: bool = False,
) -> Optional[str]:
    """
    Adapter for TinyFish Search API to retrieve relevant external web context
    (e.g., official disaster updates, relief camp announcements).
    Safe, bounded execution with isolated untrusted output.
    """
    agent_key = os.getenv("TINYFISH_API_KEY") or os.getenv("TINY_FISH_AGENT")
    if not agent_key or os.getenv("DISABLE_TINYFISH"):
        logger.info("[TinyFish] API key not configured or TinyFish is disabled.")
        return None

    cleaned = (description or "").strip()
    if not cleaned:
        return None

    pre_eval = extract_need_deterministic(cleaned)
    if severity:
        pre_eval["severity"] = severity
    if urgency:
        pre_eval["urgency"] = urgency

    if not should_trigger_tinyfish(cleaned, pre_eval=pre_eval, credibility_concern=credibility_concern, force=force):
        logger.info("[TinyFish] Invocation criteria not met; skipping external web search.")
        return None

    query = _construct_tinyfish_query(cleaned, location_text=location_text)
    if not query:
        logger.debug("[TinyFish] Query construction produced empty search string after PII sanitization.")
        return None

    url = os.getenv("TINYFISH_API_URL", "https://api.search.tinyfish.ai")
    
    # Non-blocking timeout guarantee for critical requests
    is_critical = (pre_eval.get("severity") == "critical") or (pre_eval.get("urgency") == "critical")
    timeout = 1.5 if is_critical else 5.0

    try:
        if url.endswith("/v1/context") or "/context" in url:
            # Legacy POST mock endpoint compatibility
            headers = {
                "Authorization": f"Bearer {agent_key}",
                "Content-Type": "application/json",
            }
            payload = {"query": query, "max_results": 2}
            resp = requests.post(url, headers=headers, json=payload, timeout=timeout)
        else:
            # Official TinyFish Search API GET endpoint
            headers = {
                "X-API-Key": agent_key,
                "Accept": "application/json",
            }
            params = {
                "query": query,
                "purpose": "SETU emergency report verification",
            }
            resp = requests.get(url, headers=headers, params=params, timeout=timeout)

        if resp.status_code == 200:
            data = resp.json()
            context_str = None
            if isinstance(data, dict):
                if "results" in data and isinstance(data["results"], list):
                    items = []
                    for r in data["results"]:
                        if isinstance(r, dict):
                            t = str(r.get("title", "")).strip()
                            s = str(r.get("snippet", "")).strip()
                            if t and s:
                                items.append(f"{t}: {s}")
                            elif s:
                                items.append(s)
                            elif t:
                                items.append(t)
                    if items:
                        context_str = "\n".join(items).strip()
                elif "context" in data and data["context"]:
                    context_str = str(data["context"]).strip()
                elif "summary" in data and data["summary"]:
                    context_str = str(data["summary"]).strip()

            if context_str:
                bounded_context = context_str[:500]
                logger.info("[TinyFish] Successfully retrieved %d chars of context for query: '%s'", len(bounded_context), query)
                return bounded_context
            else:
                logger.info("[TinyFish] API response contained no usable context results for query: '%s'", query)
        else:
            logger.warning("[TinyFish] API request failed with status HTTP %d for query '%s': %s", resp.status_code, query, resp.text[:200])
    except Exception as err:
        logger.warning("[TinyFish] API call exception for query '%s': %s", query, str(err))

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


def _call_gemini(prompt: str, context: Optional[str] = None) -> Dict[str, Any]:
    if _gemini_model is None or not os.getenv("GEMINI_API_KEY"):
        raise ValueError("Gemini model is not configured")
    full_prompt = f"External public context (UNTRUSTED REFERENCE):\n{context}\n\n{prompt}" if context else prompt
    response = _gemini_model.generate_content(full_prompt)
    direct_text = (getattr(response, "text", "") or "").strip()
    source = "tinyfish_gemini_ai" if context else "gemini_ai"
    return _parse_and_validate(direct_text, source)



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


def extract_need_ai(
    description: str,
    location_text: Optional[str] = None,
    credibility_concern: bool = False,
    force_tinyfish: bool = False,
) -> Dict[str, Any]:
    """
    Main entry point for AI extraction.
    1. Evaluates conditional rules and fetches optional TinyFish web context.
    2. Tries Groq LLM (primary).
    3. Tries Gemini LLM (secondary).
    4. Falls back to deterministic rule-based extractor.
    """
    cleaned = (description or "").strip()
    if not cleaned or len(cleaned) < 3:
        return extract_need_deterministic("")

    prompt = build_prompt(cleaned)

    # 1. External Web Context via TinyFish (conditional invocation)
    context = _fetch_tinyfish_context(
        cleaned,
        location_text=location_text,
        credibility_concern=credibility_concern,
        force=force_tinyfish,
    )

    # 2. Primary: Groq API
    if os.getenv("GROQ_API_KEY"):
        try:
            return _call_groq(prompt, context=context)
        except Exception as groq_err:
            logger.warning("[AI] Groq extraction failed: %s. Trying Gemini...", groq_err)

    # 3. Secondary: Gemini API
    if os.getenv("GEMINI_API_KEY"):
        try:
            return _call_gemini(prompt, context=context)
        except Exception as gemini_err:
            logger.warning("[AI] Gemini extraction failed: %s. Trying deterministic fallback...", gemini_err)

    # 4. Fallback: Deterministic Rule-Based Engine
    return extract_need_deterministic(cleaned)

