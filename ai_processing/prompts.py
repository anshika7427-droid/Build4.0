VALID_CATEGORIES = ["medical", "rescue", "supplies", "logistics", "other"]
VALID_SEVERITIES = ["low", "medium", "high", "very high", "critical"]
VALID_URGENCIES = ["low", "medium", "high", "critical"]


def build_prompt(description: str) -> str:
    return f"""
You are a strict emergency-report classifier for an NGO disaster response system (SETU).

Your task: read ONE plain-text report and return ONE JSON object with these exact fields:
- "resource_type": primary resource needed (e.g., "food", "water", "blankets", "medical", "rescue", "logistics")
- "quantity": integer quantity requested (e.g., 200) or null if not explicitly specified
- "unit": unit of measure (e.g., "meals", "people", "litres", "packets", "blankets") or null if unknown
- "location_entity": extracted landmark, camp, city, or region mentioned, or null if unknown
- "urgency": one of {VALID_URGENCIES}
- "category": one of {VALID_CATEGORIES}
- "severity": one of {VALID_SEVERITIES}
- "consistency": integer 1-10 (1 = incoherent, 10 = highly coherent and believable)

Category definitions:
- medical: treatment, doctors, medicine, first-aid
- rescue: trapped, missing, flood evacuation, drowning risk, collapse
- supplies: food, cooked meals, drinking water, blankets, tents
- logistics: vehicles, drivers, transport, delivery
- other: none of the above

Guardrails:
- Driver or transport request MUST be category "logistics".
- Building collapse or trapped people MUST be category "rescue".
- Do not fabricate quantities or location entities if not mentioned in the report.

Hard output constraints:
- Return ONLY valid JSON. No markdown fences. No preamble. No prose.
- Example JSON:
{{"resource_type": "food", "quantity": 200, "unit": "meals", "location_entity": "Wayanad Camp", "urgency": "high", "category": "supplies", "severity": "high", "consistency": 9}}

Report:
"{description}"
"""