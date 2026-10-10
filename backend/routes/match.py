from fastapi import APIRouter, Depends, HTTPException
from backend.auth import verify_token
from database.needs_db import get_open_needs, get_need_by_id
from database.volunteers_db import get_available_volunteers
from database.assignments_db import save_assignment
from database.inventory_db import allocate_ngos_for_need, release_allocations_for_need
import math

router = APIRouter(prefix="/match")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
SEVERITY_WEIGHT = {
    "critical": 1000,
    "very high": 500,
    "high": 200,
    "medium": 80,
    "low": 20,
}
SEVERITY_ORDER = {"critical": 0, "very high": 1, "high": 2, "medium": 3, "low": 4}

_SENSITIVE_CATEGORIES = {"medical", "rescue"}
_SENSITIVE_KEYWORDS = {
    "medical", "doctor", "nurse", "ambulance", "bleeding", "injury", "injuries",
    "hospital", "trapped", "collapse", "building collapse", "drowning",
    "evacuation", "fire", "earthquake", "landslide", "tsunami", "cyclone",
    "rescue", "cpr", "unconscious", "casualty", "casualties", "first-aid", "first aid"
}

SKILL_MAP = {
    "medical": {
        "medical", "first-aid", "first aid", "doctor", "nurse", "paramedic",
        "cpr", "health", "medic", "healthcare", "emt", "clinical", "triage"
    },
    "rescue": {
        "rescue", "search and rescue", "search & rescue", "sar", "evacuation",
        "swimming", "lifeguard", "firefighting", "disaster response", "extrication"
    },
    "supplies": {
        "supplies", "food", "cooking", "ration", "distribution", "relief supplies",
        "relief", "provisions", "water", "blankets", "tents", "hygiene", "pack"
    },
    "food": {
        "supplies", "food", "cooking", "ration", "distribution", "relief supplies",
        "relief", "provisions", "water", "pack"
    },
    "logistics": {
        "logistics", "driving", "driver", "transport", "transportation",
        "vehicle", "delivery", "warehouse", "loading", "truck", "van", "dispatch"
    },
    "shelter": {
        "shelter", "construction", "carpentry", "housing", "tent setup", "logistics", "supplies"
    },
}

MAX_DISPATCH_KM = 50.0
AVAILABILITY_PENALTY = 30


def _require_ngo_or_system_role(token: dict):
    if not isinstance(token, dict):
        raise HTTPException(status_code=401, detail="Invalid authentication token format.")
    role = token.get("role")
    if role not in ["system", "ngo", "admin", "coordinator"]:
        raise HTTPException(
            status_code=403,
            detail="Access denied: only NGOs or system administrators can perform matching or allocation operations"
        )


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi    = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = (math.sin(dphi / 2) ** 2
         + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def is_sensitive_case(need: dict) -> bool:
    raw_category = str(need.get("category") or "").strip().lower()
    raw_help = str(need.get("help_needed") or "").strip().lower()
    raw_disaster = str(need.get("disaster_type") or "").strip().lower()
    raw_desc = str(need.get("description") or "").strip().lower()

    if raw_category in _SENSITIVE_CATEGORIES or raw_help in _SENSITIVE_CATEGORIES:
        return True

    combined_text = f"{raw_category} {raw_help} {raw_disaster} {raw_desc}"
    if any(keyword in combined_text for keyword in _SENSITIVE_KEYWORDS):
        return True

    unspecified_values = {"", "not specified", "unknown", "none", "null", "undefined", "n/a", "other"}
    category_specified = raw_category not in unspecified_values
    help_specified = raw_help not in unspecified_values

    if not category_specified and not help_specified:
        return True

    return False


def get_canonical_category(need: dict) -> str:
    cat = str(need.get("category") or "").strip().lower()
    if cat in SKILL_MAP:
        return cat
    
    help_needed = str(need.get("help_needed") or "").strip().lower()
    if help_needed in SKILL_MAP:
        return help_needed

    disaster = str(need.get("disaster_type") or "").strip().lower()
    if disaster in SKILL_MAP:
        return disaster

    combined = f"{cat} {help_needed} {disaster}".lower()
    for canonical, synonyms in SKILL_MAP.items():
        if any(syn in combined for syn in synonyms):
            return canonical

    return cat or "other"


def is_skill_compatible(need: dict, volunteer: dict) -> bool:
    raw_skills = volunteer.get("skills") or []
    if isinstance(raw_skills, str):
        raw_skills = [raw_skills]

    v_skills = [s.strip().lower() for s in raw_skills if s and isinstance(s, str)]
    if not v_skills:
        return False

    sensitive = is_sensitive_case(need)
    if ("all" in v_skills or "general" in v_skills) and not sensitive:
        return True

    canonical_cat = get_canonical_category(need)
    if canonical_cat in SKILL_MAP:
        required_tags = SKILL_MAP[canonical_cat]
        for s in v_skills:
            if s in required_tags:
                return True
            if any(tag in s or s in tag for tag in required_tags):
                return True
        return False

    need_fields = [
        str(need.get("category") or "").lower(),
        str(need.get("help_needed") or "").lower(),
        str(need.get("disaster_type") or "").lower(),
    ]
    for s in v_skills:
        if any(s in f or f in s for f in need_fields if f and f != "not specified"):
            return True

    return False


def _compute_score(need: dict, volunteer: dict) -> tuple[float, float]:
    severity = str(need.get("severity") or "medium").lower()
    weight   = SEVERITY_WEIGHT.get(severity, 80)

    n_lat = float(need.get("lat") or 0.0)
    n_lng = float(need.get("lng") or 0.0)
    v_lat = float(volunteer.get("lat") or 0.0)
    v_lng = float(volunteer.get("lng") or 0.0)

    dist_km     = _haversine_km(n_lat, n_lng, v_lat, v_lng)
    tier_bonus  = 50 if volunteer.get("ngo_verified") else 0
    penalty     = AVAILABILITY_PENALTY if not volunteer.get("available", True) else 0

    score = (weight / (dist_km + 1)) + tier_bonus - penalty
    return score, dist_km


def find_best_volunteer(need: dict, all_volunteers: list) -> dict | None:
    available = [
        v for v in all_volunteers
        if v.get("available", True) and (v.get("active_assignments") or 0) < 3
    ]
    if not available:
        return None

    skilled = [v for v in available if is_skill_compatible(need, v)]
    if not skilled:
        return None

    sensitive = is_sensitive_case(need)
    if sensitive:
        tier1_pool = [v for v in skilled if v.get("ngo_verified") is True]
        if not tier1_pool:
            return None
        pool = tier1_pool
    else:
        pool = skilled

    scored = []
    for v in pool:
        score, dist_km = _compute_score(need, v)
        if dist_km <= MAX_DISPATCH_KM:
            scored.append((score, dist_km, v))

    scored.sort(key=lambda x: x[0], reverse=True)
    if not scored:
        return None

    best_score, best_dist, best_vol = scored[0]
    result = dict(best_vol)
    result["_score"]       = best_score
    result["_distance_km"] = best_dist
    return result


@router.get("")
def match_needs(token: dict = Depends(verify_token)):
    """Runs global priority matching pass. Requires NGO or System role."""
    _require_ngo_or_system_role(token)
            
    open_needs = get_open_needs()

    open_needs.sort(
        key=lambda n: SEVERITY_ORDER.get(str(n.get("severity", "low")).lower(), 4)
    )

    all_volunteers = get_available_volunteers()
    assigned_volunteer_ids: set[str] = set()
    matches = []

    for need in open_needs:
        trust = need.get("trust_score", 100)
        severity = (need.get("severity") or "low").lower()

        if severity in ["critical", "very high"]:
            pass
        elif trust < 50:
            continue

        need_id = need.get("id")
        need_category = str(need.get("category") or need.get("help_needed") or "").lower()
        sensitive = is_sensitive_case(need)

        available_pool = [
            v for v in all_volunteers
            if v.get("id") not in assigned_volunteer_ids
            and v.get("available", True)
            and (v.get("active_assignments") or 0) < 3
        ]

        skilled_pool = [v for v in available_pool if is_skill_compatible(need, v)]

        if sensitive:
            tier1_pool = [v for v in skilled_pool if v.get("ngo_verified") is True]
            if not tier1_pool:
                matches.append({
                    "need_id": need_id,
                    "severity": severity,
                    "category": need_category or "sensitive",
                    "status": "Manual Escalation Required",
                    "assigned_volunteer": "Unassigned",
                    "volunteer_tier": "None",
                    "reason": "Sensitive category requires Tier 1 NGO verification."
                })
                continue
            candidate_pool = tier1_pool
        else:
            if not skilled_pool:
                matches.append({
                    "need_id": need_id,
                    "severity": severity,
                    "category": need_category or "general",
                    "status": "pending",
                    "assigned_volunteer": "Unassigned",
                    "volunteer_tier": "None",
                    "reason": "No volunteers found with required skills."
                })
                continue
            candidate_pool = skilled_pool

        MAX_VOLUNTEERS_PER_NEED = 3
        scored = []

        for v in candidate_pool:
            score, dist_km = _compute_score(need, v)
            if dist_km <= MAX_DISPATCH_KM:
                scored.append((score, dist_km, v))

        scored.sort(key=lambda x: x[0], reverse=True)
        selected = scored[:MAX_VOLUNTEERS_PER_NEED]

        if not selected:
            matches.append({
                "need_id": need_id,
                "severity": severity,
                "category": need_category,
                "status": "pending",
                "assigned_volunteer": "Unassigned",
                "volunteer_tier": "None",
                "reason": "No suitable volunteers found within dispatch radius."
            })
            continue

        assigned_list = []
        for score, dist_km, vol in selected:
            save_assignment(need_id, vol.get("id"))
            assigned_volunteer_ids.add(vol.get("id"))

            assigned_list.append({
                "volunteer_id": vol.get("id"),
                "name": vol.get("name"),
                "distance_km": round(dist_km, 2),
                "score": round(score, 2),
            })

        first_vol = selected[0][2]
        tier_label = "Tier 1 (NGO-Verified)" if first_vol.get("ngo_verified") else "Tier 2 (Community)"

        matches.append({
            "need_id": need_id,
            "severity": severity,
            "category": need_category,
            "assigned_volunteer": assigned_list[0]["name"] if assigned_list else "Unassigned",
            "volunteer_tier": tier_label,
            "assigned_volunteers": assigned_list,
            "status": "assigned",
            "count": len(assigned_list)
        })

    return {
        "total_matches_made":    sum(1 for m in matches if m["status"] == "assigned"),
        "total_needs_processed": len(matches),
        "matches":               matches,
    }


@router.get("/debug/{need_id}")
def debug_match(need_id: str, token: dict = Depends(verify_token)):
    """Returns match debug breakdown for a specific need. Requires NGO or System role."""
    _require_ngo_or_system_role(token)

    need = get_need_by_id(need_id)
    if not need:
        raise HTTPException(status_code=404, detail=f"Need '{need_id}' not found.")

    all_volunteers = get_available_volunteers()
    sensitive = is_sensitive_case(need)
    breakdown = []

    for v in all_volunteers:
        score, dist_km = _compute_score(need, v)
        tier_bonus = 50 if v.get("ngo_verified") else 0
        penalty    = AVAILABILITY_PENALTY if not v.get("available", True) else 0
        severity   = (need.get("severity") or "medium").lower()
        weight     = SEVERITY_WEIGHT.get(severity, 80)
        skilled    = is_skill_compatible(need, v)
        tier_ok    = (not sensitive) or bool(v.get("ngo_verified"))

        breakdown.append({
            "volunteer_id":         v.get("id"),
            "volunteer_name":       v.get("name"),
            "ngo_verified":         v.get("ngo_verified", False),
            "skills":               v.get("skills", []),
            "skill_match":          skilled,
            "tier_eligible":        tier_ok,
            "distance_km":          round(dist_km, 2),
            "within_radius":        dist_km <= MAX_DISPATCH_KM,
            "severity_weight":      weight,
            "tier_bonus":           tier_bonus,
            "availability_penalty": penalty,
            "score":                round(score, 2),
        })

    breakdown.sort(key=lambda x: x["score"], reverse=True)

    return {
        "need_id":               need_id,
        "need_category":         need.get("category"),
        "is_sensitive":          sensitive,
        "need_severity":         need.get("severity"),
        "need_location":         need.get("location_text"),
        "volunteers_evaluated":  len(breakdown),
        "best_volunteer":        breakdown[0] if breakdown else None,
        "all_scores":            breakdown,
    }


@router.post("/allocate/{need_id}")
def allocate_need_ngos(need_id: str, token: dict = Depends(verify_token)):
    """
    Allocates available NGO inventory capacity for an emergency need.
    Supports multi-NGO partial fulfillment (e.g., 200 meals = 120 + 80).
    Requires NGO, coordinator, or system role.
    """
    _require_ngo_or_system_role(token)
    try:
        result = allocate_ngos_for_need(need_id)
        return {"status": "success", "data": result}
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/coordinate/{need_id}")
def coordinate_need(need_id: str, token: dict = Depends(verify_token)):
    """
    Target Demonstration Flow:
    1. Allocate NGO inventory against the required quantity (e.g. 200 meals = 120 + 80).
    2. Match and assign an eligible verified volunteer for last-mile delivery.
    Requires NGO, coordinator, or system role.
    """
    _require_ngo_or_system_role(token)

    need = get_need_by_id(need_id)
    if not need:
        raise HTTPException(status_code=404, detail=f"Need '{need_id}' not found")

    try:
        allocation_result = allocate_ngos_for_need(need_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"NGO inventory allocation failed: {e}")

    all_volunteers = get_available_volunteers()
    best_volunteer = find_best_volunteer(need, all_volunteers)

    assignment_id = None
    if best_volunteer:
        try:
            assignment_id = save_assignment(need_id, best_volunteer["id"])
        except Exception as e:
            print(f"[WARN] Volunteer assignment failed: {e}")
            assignment_id = None

    return {
        "status": "coordinated",
        "need_id": need_id,
        "ngo_allocations": allocation_result.get("allocations", []),
        "fulfilled_quantity": allocation_result.get("fulfilled_quantity", 0),
        "required_quantity": allocation_result.get("required_quantity", 0),
        "remaining_shortfall": allocation_result.get("remaining_shortfall", 0),
        "assigned_volunteer": {
            "volunteer_id": best_volunteer.get("id"),
            "name": best_volunteer.get("name"),
            "ngo_verified": best_volunteer.get("ngo_verified"),
            "assignment_id": assignment_id
        } if best_volunteer else None,
        "need_status": "assigned" if assignment_id else allocation_result.get("status", "matched")
    }
