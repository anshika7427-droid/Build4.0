from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Request
from backend.models import NGOInput, NGOInventoryInput
from database.ngos_db import save_ngo, get_ngo, get_all_ngos, get_ngo_by_email
from database.inventory_db import add_or_update_inventory, get_ngo_inventory, validate_resource_unit
from backend.auth import verify_token, optional_verify_token
from database.geocoding import get_coordinates
from database.needs_db import get_need_by_id
from database.postgres_client import get_db_cursor

router = APIRouter(prefix="/ngo", tags=["NGO"])


@router.post("/{ngo_id}/inventory")
def set_ngo_inventory_endpoint(ngo_id: str, data: NGOInventoryInput, token: dict = Depends(verify_token)):
    """Set or update NGO inventory stock capacity. Requires auth and ownership check."""
    role = token.get("role")
    uid = str(token.get("uid") or "")

    if role == "ngo":
        if uid != str(ngo_id):
            raise HTTPException(status_code=403, detail="Access denied: cannot modify another NGO's inventory")
    elif role not in ["system", "admin", "coordinator"]:
        raise HTTPException(status_code=403, detail="Access denied: insufficient permissions to modify NGO inventory")

    is_valid_unit, unit_err = validate_resource_unit(data.resource_type, data.unit)
    if not is_valid_unit:
        raise HTTPException(status_code=400, detail=unit_err)

    if data.total_quantity < 0:
        raise HTTPException(status_code=400, detail="total_quantity must be non-negative")

    try:
        inv_id = add_or_update_inventory(ngo_id, data.resource_type, data.total_quantity, data.unit)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error updating inventory: {str(e)}")

    return {
        "status": "success",
        "inventory_id": inv_id,
        "ngo_id": ngo_id,
        "resource_type": data.resource_type,
        "total_quantity": data.total_quantity,
        "unit": data.unit
    }


@router.get("/{ngo_id}/inventory")
def get_ngo_inventory_endpoint(ngo_id: str, token: dict = Depends(verify_token)):
    """Retrieve inventory for an NGO. Requires auth and ownership check."""
    role = token.get("role")
    uid = str(token.get("uid") or "")

    if role == "ngo":
        if uid != str(ngo_id):
            raise HTTPException(status_code=403, detail="Access denied: cannot view another NGO's inventory")
    elif role not in ["system", "admin", "coordinator"]:
        raise HTTPException(status_code=403, detail="Access denied: insufficient permissions to view NGO inventory")

    items = get_ngo_inventory(ngo_id)
    return {"ngo_id": ngo_id, "inventory": items}


@router.get("/list")
def list_ngos():
    """Public endpoint — returns all registered NGOs."""
    try:
        ngos = get_all_ngos()
        safe_fields = ["id", "ngo_name", "owner_name", "description", "type", "location", "email",
                       "phone", "verified", "registered_at", "region"]
        sanitized = []
        for ngo in ngos:
            ngo_name = ngo.get("ngo_name")
            owner_name = ngo.get("owner_name")
            
            if not ngo_name:
                ngo_name = "Helping Hands Foundation"
                owner_name = ngo.get("name", "Admin")
                try:
                    with get_db_cursor(commit=True) as cur:
                        cur.execute(
                            "UPDATE ngos SET ngo_name = %s, owner_name = %s WHERE id = %s",
                            (ngo_name, owner_name, ngo["id"])
                        )
                except Exception as e:
                    print(f"⚠️ Could not backfill NGO {ngo['id']}: {e}")
            
            sanitized_ngo = {k: v for k, v in ngo.items() if k in safe_fields}
            sanitized_ngo["ngo_name"] = ngo_name
            sanitized_ngo["owner_name"] = owner_name
            sanitized_ngo.setdefault("verified", False)
            sanitized_ngo.setdefault("email", ngo.get("email", ""))
            sanitized_ngo.setdefault("description", ngo.get("description", ""))
            sanitized.append(sanitized_ngo)

        return {"ok": True, "data": sanitized}
    except Exception as e:
        print(f"❌ list_ngos error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/register")
async def register_ngo(request: Request):
    """Webhook/Forms endpoint for NGO registration"""
    try:
        try:
            raw_data = await request.json()
        except Exception:
            form_data = await request.form()
            raw_data = dict(form_data)
            
        print(f"📥 RAW NGO Registration payload: {raw_data}", flush=True)

        data = NGOInput(**raw_data)
        
        if data.email:
            clean_email = data.email.strip().lower()
            existing = get_ngo_by_email(clean_email)
            if existing:
                raise HTTPException(
                    status_code=400,
                    detail="An NGO with this email already exists. Please log in instead."
                )

        coords = get_coordinates(data.location) if data.location else None
        ngo_dict = data.model_dump() if hasattr(data, "model_dump") else data.dict()
        if coords:
            ngo_dict["lat"] = coords.get("lat", ngo_dict.get("lat", 0.0))
            ngo_dict["lng"] = coords.get("lng", ngo_dict.get("lng", 0.0))
            
        if ngo_dict.get("email"):
            ngo_dict["email"] = ngo_dict["email"].strip().lower()

        ngo_dict.pop("verified", None)
        doc_id = save_ngo(ngo_dict)
        return {"message": "NGO registered successfully", "id": doc_id}
    except HTTPException:
        raise
    except Exception as e:
        print("❌ NGO Registration Error:", e, flush=True)
        return {"error": str(e), "message": "Failed but intercepted"}


@router.get("/{ngo_id}")
def get_ngo_details(ngo_id: str, token: Optional[dict] = Depends(optional_verify_token)):
    """Retrieve details of an NGO."""
    ngo = get_ngo(ngo_id)
    if not ngo:
        raise HTTPException(status_code=404, detail="NGO not found")
    return ngo


@router.get("/{ngo_id}/dashboard")
def get_ngo_dashboard(ngo_id: str, token: dict = Depends(verify_token)):
    ngo = get_ngo(ngo_id)
    
    role = token.get("role")
    uid = str(token.get("uid") or "")

    if role == "ngo" and uid != str(ngo_id):
        raise HTTPException(status_code=403, detail="Access denied: cannot view another NGO's dashboard")
    elif role == "volunteer":
        with get_db_cursor(commit=False) as cur:
            cur.execute("SELECT ngo_id FROM volunteers WHERE id = %s", (uid,))
            row = cur.fetchone()
        if not row or str(row.get("ngo_id") or "") != str(ngo_id):
            raise HTTPException(status_code=403, detail="Access denied: not affiliated with this NGO")
    elif role not in ["system", "admin", "ngo", "volunteer", "coordinator"]:
        raise HTTPException(status_code=403, detail="Access denied: unauthorized role")

    if not ngo:
        raise HTTPException(status_code=404, detail="NGO not found")

    with get_db_cursor(commit=False) as cur:
        cur.execute("SELECT * FROM volunteers WHERE ngo_id = %s", (ngo_id,))
        volunteer_rows = cur.fetchall()

    managed_volunteers = []
    for v_row in volunteer_rows:
        volunteer = dict(v_row)
        if volunteer.get("registered_at"):
            volunteer["registered_at"] = volunteer["registered_at"].isoformat()
        if volunteer.get("updated_at"):
            volunteer["updated_at"] = volunteer["updated_at"].isoformat()

        volunteer.setdefault(
            "role", "+".join(volunteer.get("skills", [])) or "Volunteer"
        )
        volunteer.setdefault(
            "status", "On Call" if volunteer.get("available", True) else "Deployed"
        )
        volunteer.setdefault("zone", volunteer.get("location") or "Assigned region")
        volunteer.setdefault("skills", volunteer.get("skills") or [])
        managed_volunteers.append(volunteer)

    with get_db_cursor(commit=False) as cur:
        cur.execute("""
            SELECT DISTINCT a.*
            FROM assignments a
            JOIN volunteers v ON a.volunteer_id = v.id
            WHERE a.resolved_at IS NULL AND v.ngo_id = %s
        """, (ngo_id,))
        assignment_rows = cur.fetchall()

    active_assignments = []
    for a_row in assignment_rows:
        assignment = dict(a_row)
        if assignment.get("assigned_at"):
            assignment["assigned_at"] = assignment["assigned_at"].isoformat()

        need = get_need_by_id(assignment.get("need_id")) or {}
        volunteer = None
        volunteer_id = assignment.get("volunteer_id")
        if volunteer_id:
            with get_db_cursor(commit=False) as cur:
                cur.execute("SELECT * FROM volunteers WHERE id = %s", (str(volunteer_id),))
                vol_row = cur.fetchone()
            if vol_row:
                volunteer = dict(vol_row)

        active_assignments.append(
            {
                "id": assignment["id"],
                "title": need.get("summary_en")
                or need.get("description")
                or f"Need {assignment.get('need_id')}",
                "location": need.get("location_text")
                or need.get("category")
                or "Unknown",
                "lead": volunteer.get("name") if volunteer else "Unassigned",
                "priority": need.get("priority", "Low"),
                "status": need.get("status", "open"),
                "eta": "TBD",
            }
        )

    verified_professionals = sum(
        1
        for volunteer in managed_volunteers
        if volunteer.get("ngo_verified") or volunteer.get("ngo_id")
    )

    return {
        "ngo": ngo,
        "stats": {
            "active_assignments": len(active_assignments),
            "managed_volunteers": len(managed_volunteers),
            "verified_professionals": verified_professionals,
        },
        "active_assignments": active_assignments,
        "managed_volunteers": managed_volunteers,
    }


@router.get("/{ngo_id}/needs")
def get_ngo_needs(ngo_id: str, token: dict = Depends(verify_token)):
    """Retrieve needs associated with or allocated to this NGO. Requires auth."""
    role = token.get("role")
    uid = str(token.get("uid") or "")

    if role == "ngo" and uid != str(ngo_id):
        raise HTTPException(status_code=403, detail="Access denied: cannot view another NGO's needs")
    elif role not in ["system", "admin", "ngo", "coordinator"]:
        raise HTTPException(status_code=403, detail="Access denied: unauthorized role")

    with get_db_cursor(commit=False) as cur:
        cur.execute("""
            SELECT n.*, a.allocated_quantity, a.status as allocation_status
            FROM needs_reports n
            JOIN ngo_allocations a ON n.id = a.need_id
            WHERE a.ngo_id = %s
        """, (ngo_id,))
        allocated = cur.fetchall()

        if not allocated:
            cur.execute("SELECT DISTINCT LOWER(resource_type) as r_type FROM ngo_inventory WHERE ngo_id = %s", (ngo_id,))
            types = [r["r_type"] for r in cur.fetchall()]
            if types:
                cur.execute("SELECT * FROM needs_reports WHERE LOWER(resource_type) = ANY(%s) OR LOWER(category) = ANY(%s)", (types, types))
                allocated = cur.fetchall()

        for r in allocated:
            if r.get("timestamp"):
                r["timestamp"] = r["timestamp"].isoformat()
            if r.get("updated_at"):
                r["updated_at"] = r["updated_at"].isoformat()
        return allocated


@router.get("/{ngo_id}/dispatches")
def get_ngo_dispatches(ngo_id: str, token: dict = Depends(verify_token)):
    """Retrieve active and historical dispatches for this NGO. Requires auth."""
    role = token.get("role")
    uid = str(token.get("uid") or "")

    if role == "ngo":
        if uid != str(ngo_id):
            raise HTTPException(status_code=403, detail="Access denied: cannot view another NGO's dispatches")
    elif role not in ["system", "admin", "coordinator"]:
        raise HTTPException(status_code=403, detail="Access denied: insufficient permissions to view NGO dispatches")

    with get_db_cursor(commit=False) as cur:
        cur.execute("""
            SELECT a.id, a.need_id, a.ngo_id, a.resource_type, a.allocated_quantity, a.status as dispatch_status, a.created_at,
                   n.description, n.location_text, n.urgency, n.severity,
                   v.id as volunteer_id, v.name as volunteer_name, v.phone as volunteer_phone, v.vehicle
            FROM ngo_allocations a
            JOIN needs_reports n ON a.need_id = n.id
            LEFT JOIN assignments asgn ON n.id = asgn.need_id
            LEFT JOIN volunteers v ON asgn.volunteer_id = v.id
            WHERE a.ngo_id = %s
        """, (ngo_id,))
        rows = cur.fetchall()
        for r in rows:
            if r.get("created_at"):
                r["created_at"] = r["created_at"].isoformat()
        return rows
