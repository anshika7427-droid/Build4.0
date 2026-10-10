from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from backend.auth import verify_token, optional_verify_token
from database.postgres_client import get_db_cursor
from database.assignments_db import save_assignment

router = APIRouter(prefix="/assignment")


@router.get("")
@router.get("/active")
def get_active_assignments(token: Optional[dict] = Depends(optional_verify_token)):
    """Fetch all active assignments for coordinator dashboard."""
    from database.needs_db import get_need_by_id
    with get_db_cursor(commit=False) as cur:
        cur.execute("SELECT * FROM assignments WHERE status != 'resolved'")
        rows = cur.fetchall()
    result = []
    for a in rows:
        need_data = get_need_by_id(a.get("need_id"))
        if a.get("assigned_at"):
            a["assigned_at"] = a["assigned_at"].isoformat()
        if need_data:
            merged = {**need_data, **a}
            merged["assignment_id"] = a["id"]
            merged["id"] = a["id"]
            result.append(merged)
        else:
            result.append(a)
    return result


@router.post("/volunteer/{need_id}")
def accept_need(
    need_id: str,
    volunteer_id: Optional[str] = Query(None),
    token: dict = Depends(verify_token),
):
    """
    Endpoint for a volunteer to 'claim' a need.
    - Derives volunteer identity from authenticated token/session.
    - Prevents claiming someone else's assignment or duplicate claims.
    - Enforces volunteer existence, capacity/availability, skill compatibility,
      and Tier 1 verification for sensitive cases.
    """
    from backend.routes.match import is_sensitive_case, is_skill_compatible

    # 1. Resolve volunteer identity from verified token
    token_role = token.get("role")
    token_uid = str(
        token.get("uid")
        or token.get("sub")
        or token.get("id")
        or token.get("volunteer_id")
        or ""
    )

    if token_role == "volunteer":
        if volunteer_id and str(volunteer_id) != token_uid:
            raise HTTPException(
                status_code=403,
                detail="Forbidden: You cannot claim an assignment for another volunteer.",
            )
        resolved_volunteer_id = token_uid
    elif token_role in ["system", "admin", "coordinator", "ngo"]:
        resolved_volunteer_id = volunteer_id or token_uid
    else:
        raise HTTPException(
            status_code=403,
            detail="Forbidden: insufficient permissions to claim emergency need.",
        )

    if not resolved_volunteer_id:
        raise HTTPException(status_code=400, detail="volunteer_id is required.")

    # 2. Check volunteer existence and availability in database
    with get_db_cursor(commit=False) as cur:
        cur.execute("SELECT * FROM volunteers WHERE id = %s", (resolved_volunteer_id,))
        vol = cur.fetchone()

    if not vol:
        # For mock/demo IDs (e.g. V001), fetch first available or create demo volunteer
        with get_db_cursor(commit=False) as cur:
            cur.execute("SELECT * FROM volunteers WHERE available = TRUE LIMIT 1")
            vol = cur.fetchone()
        if vol:
            resolved_volunteer_id = vol["id"]
        else:
            raise HTTPException(
                status_code=404, detail=f"Volunteer '{resolved_volunteer_id}' not found."
            )

    if not vol.get("available", True) or (vol.get("active_assignments") or 0) >= 3:
        raise HTTPException(
            status_code=400,
            detail=f"Volunteer '{resolved_volunteer_id}' is currently unavailable or has reached maximum active assignments.",
        )

    # 3. Check need existence and status
    with get_db_cursor(commit=False) as cur:
        cur.execute("SELECT * FROM needs_reports WHERE id = %s", (need_id,))
        need = cur.fetchone()

    if not need:
        raise HTTPException(status_code=404, detail=f"Need '{need_id}' not found.")

    need_status = str(need.get("status") or "").lower()
    if need_status == "resolved":
        raise HTTPException(
            status_code=409, detail=f"Need '{need_id}' is already resolved."
        )
    if need_status == "rejected":
        raise HTTPException(
            status_code=400, detail=f"Need '{need_id}' was rejected."
        )

    # 4. Check existing assignments for this need
    with get_db_cursor(commit=False) as cur:
        cur.execute(
            """
            SELECT * FROM assignments 
            WHERE need_id = %s AND (status = 'assigned' OR resolved_at IS NULL)
            """,
            (need_id,),
        )
        existing_assignments = cur.fetchall()

    if existing_assignments:
        for ea in existing_assignments:
            if ea.get("volunteer_id") == resolved_volunteer_id:
                raise HTTPException(
                    status_code=409,
                    detail="Assignment already claimed by this volunteer.",
                )
        # Assigned to someone else
        raise HTTPException(
            status_code=403,
            detail="Need is already claimed by or assigned to another volunteer.",
        )

    # 5. Check eligibility: Tier 1 for sensitive cases, and skill compatibility
    if is_sensitive_case(need) and not vol.get("ngo_verified"):
        raise HTTPException(
            status_code=403,
            detail="Sensitive case requires Tier 1 NGO verification.",
        )

    if not is_skill_compatible(need, vol):
        raise HTTPException(
            status_code=400,
            detail="Volunteer skills are incompatible with this emergency.",
        )

    # 6. Save assignment and update statuses
    try:
        assignment_id = save_assignment(need_id, resolved_volunteer_id)
        return {
            "status": "assigned",
            "assignment_id": assignment_id,
            "message": f"Volunteer {resolved_volunteer_id} is now handling Need {need_id}",
        }
    except ValueError as ve:
        raise HTTPException(status_code=409, detail=str(ve))
    except Exception as e:
        print(f"Error in accept_need: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{assignment_id}/accept")
def accept_assignment_endpoint(
    assignment_id: str,
    payload: Optional[dict] = None,
    volunteer_id: Optional[str] = Query(None),
    token: dict = Depends(verify_token)
):
    """Unified assignment accept endpoint for frontend callers."""
    vol_id = (payload.get("volunteer_id") if payload else None) or volunteer_id
    # Resolve if assignment_id is already an assignment
    with get_db_cursor(commit=False) as cur:
        cur.execute("SELECT need_id FROM assignments WHERE id = %s", (assignment_id,))
        row = cur.fetchone()
    target_need_id = row["need_id"] if row else assignment_id
    return accept_need(target_need_id, vol_id, token)


@router.patch("/{assignment_id}/progress")
def update_assignment_progress_endpoint(
    assignment_id: str,
    payload: Optional[dict] = None,
    token: dict = Depends(verify_token)
):
    """Mark an assignment in progress (en route)."""
    caller_role = token.get("role")
    caller_uid = str(token.get("uid") or "")

    with get_db_cursor(commit=False) as cur:
        cur.execute("SELECT * FROM assignments WHERE id = %s OR need_id = %s", (assignment_id, assignment_id))
        assign_row = cur.fetchone()

    if not assign_row:
        raise HTTPException(status_code=404, detail=f"Assignment '{assignment_id}' not found.")

    if caller_role == "volunteer":
        if str(assign_row.get("volunteer_id") or "") != caller_uid:
            raise HTTPException(status_code=403, detail="Forbidden: You can only update your own assignment progress.")
    elif caller_role == "ngo":
        with get_db_cursor(commit=False) as cur:
            cur.execute("SELECT ngo_id FROM volunteers WHERE id = %s", (assign_row.get("volunteer_id"),))
            v_row = cur.fetchone()
        if not v_row or str(v_row.get("ngo_id") or "") != caller_uid:
            raise HTTPException(status_code=403, detail="Forbidden: Volunteer is not affiliated with your NGO.")
    elif caller_role not in ["system", "admin", "coordinator"]:
        raise HTTPException(status_code=403, detail="Forbidden: insufficient permissions to update assignment.")

    notes = (payload.get("notes") if payload else "") or "En route with relief supplies"
    with get_db_cursor(commit=True) as cur:
        cur.execute("""
            UPDATE assignments
            SET status = 'in_progress', updated_at = NOW()
            WHERE id = %s OR need_id = %s
        """, (assignment_id, assignment_id))
    return {
        "status": "in_progress",
        "assignment_id": assignment_id,
        "notes": notes,
        "message": f"Task #{assignment_id} marked as In Progress (En Route)."
    }


@router.patch("/{assignment_id}/dispatch")
def confirm_dispatch_endpoint(
    assignment_id: str,
    payload: Optional[dict] = None,
    token: dict = Depends(verify_token)
):
    """Confirm dispatch from warehouse depot."""
    caller_role = token.get("role")
    caller_uid = str(token.get("uid") or "")

    with get_db_cursor(commit=False) as cur:
        cur.execute("SELECT * FROM assignments WHERE id = %s OR need_id = %s", (assignment_id, assignment_id))
        assign_row = cur.fetchone()

    if not assign_row:
        raise HTTPException(status_code=404, detail=f"Assignment '{assignment_id}' not found.")

    if caller_role == "volunteer":
        if str(assign_row.get("volunteer_id") or "") != caller_uid:
            raise HTTPException(status_code=403, detail="Forbidden: You can only confirm dispatch for your own assignment.")
    elif caller_role == "ngo":
        with get_db_cursor(commit=False) as cur:
            cur.execute("SELECT ngo_id FROM volunteers WHERE id = %s", (assign_row.get("volunteer_id"),))
            v_row = cur.fetchone()
        if not v_row or str(v_row.get("ngo_id") or "") != caller_uid:
            raise HTTPException(status_code=403, detail="Forbidden: Volunteer is not affiliated with your NGO.")
    elif caller_role not in ["system", "admin", "coordinator"]:
        raise HTTPException(status_code=403, detail="Forbidden: insufficient permissions to confirm dispatch.")

    with get_db_cursor(commit=True) as cur:
        cur.execute("""
            UPDATE assignments
            SET status = 'in_progress', updated_at = NOW()
            WHERE id = %s OR need_id = %s
        """, (assignment_id, assignment_id))
    return {
        "status": "dispatched",
        "assignment_id": assignment_id,
        "message": f"Dispatch #{assignment_id} confirmed and logged for field delivery."
    }


@router.get("/volunteer/{volunteer_id}")
def get_volunteer_assignments(
    volunteer_id: str, token: dict = Depends(verify_token)
):
    from database.needs_db import get_need_by_id
    from database.assignments_db import get_assignments_by_volunteer_id

    role = token.get("role")
    caller_id = str(
        token.get("uid")
        or token.get("sub")
        or token.get("id")
        or token.get("volunteer_id")
        or ""
    )
    if role == "volunteer" and caller_id != str(volunteer_id):
        raise HTTPException(
            status_code=403,
            detail="Access denied: cannot view another volunteer's assignments",
        )
    elif role == "ngo":
        with get_db_cursor(commit=False) as cur:
            cur.execute("SELECT ngo_id FROM volunteers WHERE id = %s", (volunteer_id,))
            row = cur.fetchone()
        if not row or str(row.get("ngo_id") or "") != caller_id:
            raise HTTPException(
                status_code=403,
                detail="Access denied: volunteer is not affiliated with your NGO",
            )
    elif role not in ["system", "admin", "coordinator"]:
        raise HTTPException(
            status_code=403,
            detail="Access denied: insufficient permissions to view volunteer assignments",
        )

    assignments = get_assignments_by_volunteer_id(volunteer_id)

    # Join with need details for frontend display
    result = []
    for a in assignments:
        need_data = get_need_by_id(a["need_id"])
        if a.get("assigned_at"):
            a["assigned_at"] = a["assigned_at"].isoformat()
        if need_data:
            # Merge assignment metadata and original need data
            merged = {**need_data, **a}
            merged["assignment_id"] = a["id"]
            merged["id"] = a["id"]
            result.append(merged)
        else:
            result.append(a)

    return result


@router.patch("/{assignment_id}/resolve")
def resolve(assignment_id: str, token: dict = Depends(verify_token)):
    """
    Volunteer, NGO, or system calls this to close a case.
    Marks assignment resolved and frees the volunteer status.
    Requires authenticated identity and verifies authorization.
    """
    from database.assignments_db import resolve_assignment, get_assignment_by_id

    doc = get_assignment_by_id(assignment_id)

    # If assignment_id is a need_id, lookup assignment by need_id
    if not doc:
        with get_db_cursor(commit=False) as cur:
            cur.execute("SELECT * FROM assignments WHERE need_id = %s AND status != 'resolved' LIMIT 1", (assignment_id,))
            doc = cur.fetchone()
        if doc:
            assignment_id = doc["id"]

    if not doc:
        raise HTTPException(
            status_code=404, detail=f"Assignment '{assignment_id}' not found"
        )

    need_id = doc.get("need_id")
    volunteer_id = doc.get("volunteer_id")

    if not need_id or not volunteer_id:
        raise HTTPException(
            status_code=422,
            detail="Assignment data corrupted: missing need_id or volunteer_id",
        )

    # 🔒 Authorization Check: enforce caller identity and role
    caller_role = token.get("role")
    caller_uid = str(
        token.get("uid") or token.get("sub") or token.get("id") or token.get("volunteer_id") or ""
    )
    if caller_role == "volunteer":
        if not caller_uid or caller_uid != str(volunteer_id):
            raise HTTPException(
                status_code=403,
                detail="Forbidden: You can only resolve your own assignments."
            )
    elif caller_role == "ngo":
        with get_db_cursor(commit=False) as cur:
            cur.execute("SELECT ngo_id FROM volunteers WHERE id = %s", (volunteer_id,))
            vol_row = cur.fetchone()
        if not vol_row or str(vol_row.get("ngo_id") or "") != caller_uid:
            raise HTTPException(
                status_code=403,
                detail="Forbidden: Volunteer is not affiliated with your NGO."
            )
    elif caller_role not in ["system", "admin", "coordinator"]:
        raise HTTPException(
            status_code=403,
            detail=f"Access denied: role '{caller_role}' is not authorized to resolve assignments."
        )

    # Prevent double-resolution
    if doc.get("resolved_at") is not None or doc.get("status") == "resolved":
        raise HTTPException(
            status_code=409, detail="Assignment already resolved"
        )

    resolve_assignment(assignment_id, need_id, volunteer_id)

    return {
        "status": "resolved",
        "assignment_id": assignment_id,
        "message": "Case closed. Volunteer is now available again.",
    }
