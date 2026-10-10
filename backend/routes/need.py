import traceback
from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException
from backend.models import NeedInput
from backend.auth import verify_token
from ai_processing.gemini_processor import process_need_text
from database.geocoding import get_coordinates
from database.needs_db import save_need, check_corroboration, get_all_needs, get_need_by_id
from database.verification import (
    build_common_only_trust_result,
    calculate_trust_score,
    is_high_stakes_disaster,
    run_common_validation,
)
from notifications.gmail_alert import send_alert

router = APIRouter(prefix="/need")

needs_storage = []


# 🧠 NEW: Secondary AI Review
def secondary_review(description: str):
    """Second-pass AI validation for mid-confidence reports."""
    result = process_need_text(description)

    # Slight boost if consistent
    cons = result.get("consistency")
    adjustment = 5 if (cons is not None and cons > 6) else -5

    return {
        "adjustment": adjustment,
        "reason": f"Secondary AI consistency: {cons}"
    }


# 🚀 AUTO MATCH (unchanged)
def _auto_match_for_need(need_id: str):
    from database.needs_db import get_need_by_id
    from database.volunteers_db import get_available_volunteers
    from database.assignments_db import save_assignment
    from backend.routes.match import find_best_volunteer, MAX_DISPATCH_KM

    need = get_need_by_id(need_id)
    if not need:
        return

    volunteers = get_available_volunteers()
    best = find_best_volunteer(need, volunteers)

    if not best:
        return

    if best.get("_distance_km", 999) <= MAX_DISPATCH_KM:
        save_assignment(need_id, best["id"])


# 🧠 CORE FUNCTION
def process_and_save_need(data: NeedInput, background_tasks: BackgroundTasks):
    try:
        # 1️⃣ BASIC VALIDATION
        if not data.description or len(data.description.strip()) < 10:
            raise HTTPException(status_code=400, detail="Description too short")

        # Validate explicit user quantity if provided
        if data.required_quantity is not None:
            if isinstance(data.required_quantity, bool) or data.required_quantity <= 0:
                raise HTTPException(
                    status_code=400,
                    detail="required_quantity must be a positive integer (> 0)"
                )
            required_quantity = data.required_quantity
        else:
            required_quantity = None

        # 2️⃣ AI CLASSIFICATION & EXTRACTION
        ai_result = process_need_text(data.description)
        if ai_result.get("error") == "empty input":
            raise HTTPException(status_code=400, detail="Description too short")

        category = ai_result["category"]
        CATEGORY_NORMALIZATION = {
            "collapse": "rescue",
            "building collapse": "rescue",
            "earthquake": "rescue",
            "flood": "logistics",
            "water shortage": "logistics",
            "medical emergency": "medical",
            "fire": "rescue",
        }

        category = CATEGORY_NORMALIZATION.get(category.lower(), category.lower())
        severity = ai_result["severity"]
        consistency = ai_result["consistency"]

        # If user didn't specify quantity, check AI extraction
        if required_quantity is None:
            ai_qty = ai_result.get("quantity")
            if ai_qty is not None and isinstance(ai_qty, int) and not isinstance(ai_qty, bool) and ai_qty > 0:
                required_quantity = ai_qty

        resource_type = (data.resource_type or ai_result.get("resource_type") or category or "food").strip().lower()
        unit = (data.unit if data.unit and data.unit != "units" else None) or ai_result.get("unit") or "units"
        urgency = (data.urgency or ai_result.get("urgency") or severity or "medium").strip().lower()
        extraction_source = ai_result.get("extraction_source", "deterministic_fallback")

        # 3️⃣ GEOLOCATION & LOCATION SAFETY
        lat = data.lat
        lng = data.lng

        location_text = (data.location_text or "").strip()
        if (not location_text or location_text.lower() == "unknown location") and ai_result.get("location_entity"):
            location_text = ai_result["location_entity"]

        # Geocode only if exact coords aren't provided
        if (lat == 0.0 and lng == 0.0) and location_text and location_text.lower() != "unknown location":
            coords = get_coordinates(location_text)
            
            # Fallback: if form was mapped backwards, real address might be in description under "Help:"
            if (not coords or (coords.get("lat") == 0.0 and coords.get("lng") == 0.0)) and "Help: " in data.description:
                fallback_loc = data.description.split("Help: ")[-1].strip()
                if fallback_loc and fallback_loc != "Not Specified":
                    coords = get_coordinates(fallback_loc)

            if coords:
                lat = coords.get("lat", 0.0)
                lng = coords.get("lng", 0.0)

        # Coordinate Validation (lat in [-90, 90], lng in [-180, 180], finite, not (0.0, 0.0))
        def _is_valid_coordinates(la, ln):
            if not isinstance(la, (int, float)) or not isinstance(ln, (int, float)):
                return False
            if isinstance(la, bool) or isinstance(ln, bool):
                return False
            import math
            if not (math.isfinite(la) and math.isfinite(ln)):
                return False
            if not (-90.0 <= la <= 90.0 and -180.0 <= ln <= 180.0):
                return False
            if la == 0.0 and ln == 0.0:
                return False
            return True

        if not _is_valid_coordinates(lat, lng):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid or unresolvable location: '{location_text or 'unspecified'}'"
            )

        if not location_text or location_text.lower() == "unknown location":
            location_text = f"{lat}, {lng}"

        payload = data.model_dump() if hasattr(data, "model_dump") else data.dict()

        verification_payload = payload | {
            "lat": lat,
            "lng": lng,
            "category": category,
            "location_text": location_text,
        }

        # 4️⃣ COMMON VALIDATION & TRUST SCORING
        common_validation = run_common_validation(verification_payload)

        if not common_validation["passed"]:
            trust_result = build_common_only_trust_result(
                common_validation,
                category,
                data.disaster_type,
            )
        else:
            corroboration = check_corroboration(lat, lng, category)

            trust_result = calculate_trust_score(
                verification_payload,
                consistency,
                corroboration,
                category,
                common_validation.get("base_score", 0),
            )

        trust_score = trust_result["score"]
        if len(data.description.split()) > 8:
            trust_score += 10

        trust_score = min(trust_score, 100)

        # 5️⃣ TIERED TRIAGE SYSTEM
        # Unknown quantities MUST NEVER enter automatic matching or dispatch!
        if required_quantity is None:
            dispatch_action = "secondary_review"
            status = "secondary_review"
        elif trust_score <= 30:
            dispatch_action = "rejected"
            status = "rejected"
        elif 31 <= trust_score <= 75:
            review = secondary_review(data.description)
            trust_score += review["adjustment"]
            trust_score = max(0, min(trust_score, 100))
            dispatch_action = "secondary_review"
            status = "secondary_review"
        else:
            dispatch_action = "auto_dispatch"
            status = "open"

        # 6️⃣ PRIORITY
        if severity in ["critical", "very high"]:
            priority = "HIGH"
        elif severity in ["high", "medium"]:
            priority = "MEDIUM"
        else:
            priority = "LOW"

        # 7️⃣ FINAL OBJECT FOR PERSISTENCE
        final_data = {
            "reporter_name": data.reporter_name,
            "reporter_phone": data.reporter_phone,
            "location_text": location_text,
            "disaster_type": data.disaster_type,
            "help_needed": data.help_needed,
            "description": data.description,
            "category": category,
            "severity": severity,
            "resource_type": resource_type,
            "required_quantity": required_quantity,
            "fulfilled_quantity": 0,
            "unit": unit,
            "urgency": urgency,
            "lat": lat,
            "lng": lng,
            "trust_score": trust_score,
            "dispatch_action": dispatch_action,
            "priority": priority,
            "status": status,
            "flag": "verified" if trust_score > 50 else "suspicious",
            "extraction_source": extraction_source,
            "reasons": trust_result.get("reasons", []),
        }

        # 💾 SAVE WITH TRANSACTION/EXCEPTION SAFETY
        try:
            doc_id = save_need(final_data)
        except HTTPException:
            raise
        except Exception as db_err:
            traceback.print_exc()
            raise HTTPException(
                status_code=500,
                detail="Database persistence failed"
            )

        if not doc_id:
            raise HTTPException(
                status_code=500,
                detail="Database persistence failed — no record ID returned"
            )

        final_data["id"] = doc_id
        final_data["need_id"] = doc_id
        needs_storage.append(final_data)

        # 🚀 AUTO ACTIONS (only after successful DB save AND valid quantity)
        if dispatch_action == "auto_dispatch" and required_quantity is not None:
            background_tasks.add_task(_auto_match_for_need, doc_id)
            background_tasks.add_task(send_alert, final_data)

        return final_data

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail="An unexpected server error occurred"
        )


@router.post("/report")
def report_need_public(
    data: NeedInput,
    background_tasks: BackgroundTasks,
):
    """
    Public emergency reporting endpoint.
    Allows citizens and the web app to submit distress calls without logging in.
    """
    return process_and_save_need(data, background_tasks)


@router.post("")
def create_need(
    data: NeedInput,
    background_tasks: BackgroundTasks,
    token: dict = Depends(verify_token),
):
    return process_and_save_need(data, background_tasks)


@router.get("")
def list_needs():
    """
    Public feed of all recorded emergency needs reports.
    """
    return get_all_needs()


@router.get("/{need_id}")
def get_single_need(need_id: str):
    """
    Retrieve single emergency need details by ID.
    """
    need = get_need_by_id(need_id)
    if not need:
        raise HTTPException(status_code=404, detail=f"Need '{need_id}' not found.")
    return need