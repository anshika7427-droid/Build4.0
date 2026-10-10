from typing import Optional
import traceback
from fastapi import APIRouter, Depends, HTTPException
from backend.auth import verify_token, optional_verify_token                    # ✅ Centralised auth
from database.volunteers_db import (
    save_volunteer, get_available_volunteers, get_all_volunteers, hash_password,
    update_volunteer_status, get_volunteer
)
from database.ngos_db import get_ngo
from backend.models import VolunteerInput, VolunteerStatusInput
from database.geocoding import get_coordinates

router = APIRouter()


@router.post("/volunteer")
def create_volunteer(data: VolunteerInput, token: dict = Depends(verify_token)):  # ✅ Auth guard
    try:
        volunteer_dict = data.model_dump() if hasattr(data, "model_dump") else data.dict()

        # 🔒 SECURITY: Hash the password; never store plaintext
        raw_password = volunteer_dict.pop("password")
        volunteer_dict["password_hash"] = hash_password(raw_password)

        # 🔒 SECURITY: Strip privileged tiered fields — only an authenticated NGO may set these.
        # A volunteer registering themselves must not be able to self-promote their tier.
        if isinstance(token, dict):
            role = token.get("role")
            uid = token.get("uid")
            if role == "ngo":
                # Force volunteer's NGO ID to be the authenticated NGO's ID
                volunteer_dict["ngo_id"] = uid
                # Verify if the NGO itself is verified in PostgreSQL
                ngo = get_ngo(uid)
                volunteer_dict["ngo_verified"] = bool(ngo and ngo.get("verified"))
            elif role == "system":
                # For system/tests, preserve the submitted NGO ID if verified
                ngo_id = volunteer_dict.get("ngo_id")
                if ngo_id:
                    ngo = get_ngo(ngo_id)
                    volunteer_dict["ngo_verified"] = bool(ngo and ngo.get("verified"))
                else:
                    volunteer_dict["ngo_verified"] = False
            else:
                # Regular volunteer cannot self-verify or self-associate
                volunteer_dict.pop("ngo_id", None)
                volunteer_dict["ngo_verified"] = False
        else:
            volunteer_dict.pop("ngo_id", None)
            volunteer_dict["ngo_verified"] = False

        volunteer_dict.pop("credential_tags", None)

        # Geocoding and location handling is now centralized in save_volunteer()
        print("📥 Incoming Volunteer Data:", volunteer_dict)

        doc_id = save_volunteer(volunteer_dict)

        return {
            "message": "volunteer added",
            "status": "registered",
            "volunteer_id": doc_id,
            "id": doc_id,
            "total_volunteers": len(get_available_volunteers())
        }

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        print(f"❌ Route Error: {e}")
        return {"error": str(e)}


@router.patch("/volunteer/status")
def update_own_status(data: VolunteerStatusInput, token: dict = Depends(verify_token)):
    """
    Lets an authenticated volunteer set their own on-duty/off-duty availability.
    Identity is derived solely from the token (uid) — a volunteer can never
    pass another volunteer's id, so this can't be used to change someone else's status.
    """
    if not isinstance(token, dict) or token.get("role") != "volunteer":
        raise HTTPException(
            status_code=403,
            detail="Only an authenticated volunteer can update their own duty status",
        )

    volunteer_id = token.get("uid")
    if not volunteer_id:
        raise HTTPException(status_code=401, detail="Invalid session")

    update_volunteer_status(volunteer_id, data.available)
    return {"id": volunteer_id, "available": data.available}


@router.patch("/volunteer/{volunteer_id}/availability")
@router.patch("/volunteers/{volunteer_id}/availability")
def update_volunteer_availability_endpoint(
    volunteer_id: str,
    data: VolunteerStatusInput,
    token: Optional[dict] = Depends(optional_verify_token)
):
    """
    Update a volunteer's on-duty/off-duty availability.
    """
    vol = get_volunteer(volunteer_id)
    if not vol:
        raise HTTPException(status_code=404, detail=f"Volunteer '{volunteer_id}' not found.")

    update_volunteer_status(volunteer_id, data.available)
    return {"id": volunteer_id, "available": data.available, "message": f"Status updated to {'available' if data.available else 'off-duty'}."}


@router.get("/volunteers")
def list_volunteers(token: Optional[dict] = Depends(optional_verify_token)):
    """Public endpoint — returns all registered volunteers."""
    try:
        volunteers = get_all_volunteers()
        # Strip sensitive fields before sending to frontend
        safe_fields = ["id", "name", "skills", "available", "location",
                       "active_assignments", "ngo_id", "registered_at",
                       "ngo_verified", "credential_tags", "lat", "lng", "vehicle"]
        sanitized = [
            {k: v for k, v in vol.items() if k in safe_fields}
            for vol in volunteers
        ]
        return sanitized
    except Exception as e:
        print(f"❌ list_volunteers error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/volunteer/{volunteer_id}")
@router.get("/volunteers/{volunteer_id}")
def get_single_volunteer(volunteer_id: str):
    """Retrieve details of a single volunteer."""
    vol = get_volunteer(volunteer_id)
    if not vol:
        raise HTTPException(status_code=404, detail=f"Volunteer '{volunteer_id}' not found.")
    safe_fields = ["id", "name", "skills", "available", "location",
                   "active_assignments", "ngo_id", "registered_at",
                   "ngo_verified", "credential_tags", "lat", "lng", "phone", "email", "vehicle"]
    return {k: v for k, v in vol.items() if k in safe_fields}


@router.get("/volunteers/{volunteer_id}/assignments")
def get_vol_assignments_alias(
    volunteer_id: str,
    token: Optional[dict] = Depends(optional_verify_token)
):
    """Alias for volunteer assignments feed."""
    from database.needs_db import get_need_by_id
    from database.assignments_db import get_assignments_by_volunteer_id

    assignments = get_assignments_by_volunteer_id(volunteer_id)
    result = []
    for a in assignments:
        need_data = get_need_by_id(a.get("need_id"))
        if need_data:
            merged = {**need_data, **a}
            merged["assignment_id"] = a["id"]
            merged["id"] = a["id"]
            result.append(merged)
        else:
            result.append(a)
    return result


