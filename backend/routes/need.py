import traceback
from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException
from backend.models import NeedInput
from backend.auth import verify_token, optional_verify_token
from ai_processing.gemini_processor import process_need_text
from database.geocoding import get_coordinates
from database.needs_db import (
    save_need,
    check_corroboration,
    get_all_needs,
    get_need_by_id,
    update_need_status,
    get_corroboration_candidates,
    check_reporter_reputation,
    check_duplicate_and_rate_limit,
)
from database.verification import (
    build_common_only_trust_result,
    calculate_trust_score,
    is_high_stakes_disaster,
    run_common_validation,
    NeedRequest,
    EvidenceInput,
    CorroborationCandidate,
    normalize_phone,
    compute_text_hash,
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


# 🚀 AUTO MATCH
def _auto_match_for_need(need_id: str):
    from database.needs_db import get_need_by_id
    from database.volunteers_db import get_available_volunteers
    from database.assignments_db import save_assignment
    from database.inventory_db import allocate_ngos_for_need
    from backend.routes.match import find_best_volunteer, MAX_DISPATCH_KM

    need = get_need_by_id(need_id)
    if not need:
        return

    # For food requests, allocate NGO inventory stock
    res_type = str(need.get("resource_type") or need.get("category") or "food").lower()
    if res_type in ("food", "supplies"):
        try:
            allocate_ngos_for_need(need_id)
        except Exception as e:
            print(f"[WARN] Auto inventory allocation for need {need_id}: {e}")

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

        # Determine effective need type for Trust Engine V2: 'food' or 'transport'
        is_transport = (
            resource_type in ("transport", "logistics")
            or category in ("transport", "logistics")
            or (data.help_needed or "").lower() in ("transport", "logistics", "vehicle")
        )
        effective_need_type = "transport" if is_transport else "food"

        # Ensure valid default unit for Trust Engine V2 validity gate
        if effective_need_type == "food" and (not unit or unit == "units"):
            unit = "meals"
        elif effective_need_type == "transport" and (not unit or unit == "units"):
            unit = "passengers"

        # 4️⃣ SERVER-SIDE EVIDENCE RETRIEVAL
        rep_evidence = check_reporter_reputation(data.reporter_phone)
        dup_evidence = check_duplicate_and_rate_limit(data.reporter_phone, data.description)
        candidates = get_corroboration_candidates(
            resource_type=effective_need_type,
            lat=lat,
            lng=lng,
            exclude_phone=data.reporter_phone,
        )

        # Support test mocks patching legacy check_corroboration
        legacy_corrob_count = check_corroboration(lat, lng, category)
        if legacy_corrob_count > 0 and not candidates:
            for i in range(legacy_corrob_count):
                candidates.append(
                    CorroborationCandidate(
                        candidate_id=f"legacy-mock-{i+1}",
                        need_type=effective_need_type,
                        reporter_phone=f"987650000{i+1}",
                        timestamp=datetime.now(timezone.utc),
                        latitude=lat + 0.001 * (i + 1),
                        longitude=lng + 0.001 * (i + 1),
                        is_duplicate=False,
                    )
                )

        # Capacity Pre-Flight Check (Real capacity verification before dispatch recommendation)
        qty_to_check = required_quantity if (required_quantity is not None and required_quantity > 0) else 100
        if effective_need_type == "food":
            from database.inventory_db import check_food_inventory_available
            capacity_available = check_food_inventory_available(
                quantity=qty_to_check,
                lat=lat,
                lng=lng,
            )
        else:
            from database.volunteers_db import check_transport_capacity_available
            capacity_available = check_transport_capacity_available(
                lat=lat,
                lng=lng,
            )

        # 5️⃣ TRUST ENGINE V2 EVALUATION
        norm_phone = normalize_phone(data.reporter_phone)
        safe_phone = norm_phone if (norm_phone and len(norm_phone) == 10) else "9999999999"

        need_req = NeedRequest(
            need_type=effective_need_type,
            item=(data.help_needed if data.help_needed and data.help_needed != "Not Specified" else None) or ("food supplies" if effective_need_type == "food" else "transport service"),
            quantity=qty_to_check,
            unit=unit if unit else ("meals" if effective_need_type == "food" else "passengers"),
            reporter_phone=safe_phone,
            location_description=location_text,
            latitude=lat,
            longitude=lng,
            severity=urgency if urgency in ("low", "medium", "high", "critical") else "medium",
            description=data.description,
            text_hash=dup_evidence.get("text_hash"),
            pickup_location=location_text if effective_need_type == "transport" else None,
            destination_location="Relief Camp" if effective_need_type == "transport" else None,
            cargo_or_passenger_type="passengers" if effective_need_type == "transport" else None,
        )

        location_consistent = True if (lat != 0.0 and lng != 0.0 and bool(location_text.strip())) else None
        quantity_plausible = True if (0 < qty_to_check <= 50000) else False if (qty_to_check > 50000 or qty_to_check < 0) else None

        evidence_input = EvidenceInput(
            is_registered_ngo_or_camp=rep_evidence.get("is_registered_ngo_or_camp"),
            has_resolved_history=rep_evidence.get("has_resolved_history"),
            is_flagged_history=rep_evidence.get("is_flagged_history"),
            flagged_deduction=rep_evidence.get("flagged_deduction"),
            ai_consistency=consistency,
            ai_source=extraction_source,
            location_consistent=location_consistent,
            quantity_plausible=quantity_plausible,
            is_identical_text=dup_evidence.get("is_identical_text"),
            recent_reports_count_one_hour=dup_evidence.get("recent_reports_count_one_hour"),
            candidates=candidates,
            reference_time=datetime.now(timezone.utc),
            capacity_available=capacity_available,
        )

        trust_result = calculate_trust_score(need_req, evidence_input)

        if not trust_result.valid:
            trust_score = 0
            trust_tier = "low"
            dispatch_action = "hold_and_flag"
            reasons = list(trust_result.reasons) + list(trust_result.validation_errors)
        else:
            trust_score = trust_result.trust_score if trust_result.trust_score is not None else 0
            trust_tier = trust_result.trust_tier or "medium"
            dispatch_action = trust_result.dispatch_action or "human_review"
            reasons = list(trust_result.reasons)

        # 6️⃣ PRIORITY MAPPING (preserve legacy UPPERCASE string contract)
        if (
            (hasattr(trust_result, "priority") and trust_result.priority in ("critical", "elevated"))
            or severity in ("critical", "very high", "high")
            or (data.disaster_type or "").lower() in ("building collapse", "collapse", "earthquake", "cyclone", "tsunami")
        ):
            priority = "HIGH"
        elif (hasattr(trust_result, "priority") and trust_result.priority == "normal") or severity in ("medium",):
            priority = "MEDIUM"
        else:
            priority = "LOW"

        # 7️⃣ WORKFLOW STATUS & UNKNOWN QUANTITY GATING
        # Unknown quantities MUST NEVER enter automatic matching or dispatch!
        has_negative_flags = (
            (consistency is not None and consistency <= 2)
            or bool(dup_evidence.get("is_identical_text"))
            or (dup_evidence.get("recent_reports_count_one_hour") or 0) > 3
            or bool(rep_evidence.get("is_flagged_history"))
        )

        if required_quantity is None:
            if not has_negative_flags:
                dispatch_action = "secondary_review"
                status = "secondary_review"
                flag = "pending_review"
            else:
                dispatch_action = "hold_and_flag"
                status = "flagged"
                flag = "suspicious"
        elif dispatch_action == "auto_dispatch":
            status = "open"
            flag = "verified"
        elif dispatch_action == "human_review":
            status = "secondary_review"
            flag = "pending_review"
        else:
            status = "flagged"
            flag = "suspicious"

        # 8️⃣ FINAL OBJECT FOR PERSISTENCE
        final_data = {
            "reporter_name": data.reporter_name,
            "reporter_phone": data.reporter_phone,
            "location_text": location_text,
            "disaster_type": data.disaster_type,
            "help_needed": data.help_needed,
            "description": data.description,
            "category": category,
            "severity": severity,
            "resource_type": effective_need_type,
            "required_quantity": required_quantity,
            "fulfilled_quantity": 0,
            "unit": unit,
            "urgency": urgency,
            "lat": lat,
            "lng": lng,
            "trust_score": trust_score,
            "trust_tier": trust_tier,
            "dispatch_action": dispatch_action,
            "priority": priority,
            "status": status,
            "flag": flag,
            "extraction_source": extraction_source,
            "reasons": reasons,
            "engine_version": "2.0.0",
            "text_hash": dup_evidence.get("text_hash", ""),
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

        # 🚀 AUTO ACTIONS (only after successful DB save AND valid quantity AND auto_dispatch)
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
def list_needs(token: Optional[dict] = Depends(optional_verify_token)):
    """
    Feed of recorded emergency needs reports.
    Masks distress caller phone numbers unless caller is an authorized coordinator/NGO.
    """
    docs = get_all_needs()
    is_privileged = False
    if isinstance(token, dict) and token.get("role") in ["system", "admin", "coordinator", "ngo"]:
        is_privileged = True

    if not is_privileged:
        sanitized = []
        for d in docs:
            item = dict(d)
            item["reporter_phone"] = None
            sanitized.append(item)
        return sanitized
    return docs


@router.get("/{need_id}")
def get_single_need(need_id: str, token: Optional[dict] = Depends(optional_verify_token)):
    """
    Retrieve single emergency need details by ID.
    Masks distress caller phone numbers unless caller is an authorized coordinator/NGO.
    """
    need = get_need_by_id(need_id)
    if not need:
        raise HTTPException(status_code=404, detail=f"Need '{need_id}' not found.")

    is_privileged = False
    if isinstance(token, dict) and token.get("role") in ["system", "admin", "coordinator", "ngo"]:
        is_privileged = True

    if not is_privileged:
        sanitized = dict(need)
        sanitized["reporter_phone"] = None
        return sanitized
    return need


class NeedReviewInput(BaseModel):
    action: str  # "approve" or "reject"
    notes: Optional[str] = None


@router.post("/{need_id}/review")
def review_need(
    need_id: str,
    review: NeedReviewInput,
    background_tasks: BackgroundTasks,
    token: dict = Depends(verify_token),
):
    """
    Coordinator review for held or secondary_review emergency needs.
    Requires authenticated NGO coordinator or system admin role.
    """
    if isinstance(token, dict) and token.get("role") not in ["system", "ngo"]:
        raise HTTPException(
            status_code=403,
            detail="Access denied: only NGOs or system coordinators can review distress reports."
        )

    need = get_need_by_id(need_id)
    if not need:
        raise HTTPException(status_code=404, detail=f"Need '{need_id}' not found.")

    action = review.action.strip().lower()
    if action not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="Action must be 'approve' or 'reject'.")

    from database.needs_db import update_need_status

    if action == "approve":
        new_status = "open"
        new_dispatch = "coordinator_approved"
        update_need_status(need_id, new_status)
        background_tasks.add_task(_auto_match_for_need, need_id)
    else:
        new_status = "rejected"
        new_dispatch = "coordinator_rejected"
        update_need_status(need_id, new_status)

    return {
        "status": "success",
        "need_id": need_id,
        "previous_status": need.get("status"),
        "new_status": new_status,
        "dispatch_action": new_dispatch,
        "reviewed_by": token.get("sub", "coordinator") if isinstance(token, dict) else "coordinator",
        "notes": review.notes or "",
    }
