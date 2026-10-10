from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from backend.auth import verify_token, optional_verify_token

from database.needs_db import get_open_needs, get_all_needs
from database.volunteers_db import get_available_volunteers, get_all_volunteers
from database.ngos_db import get_all_ngos
from database.postgres_client import get_db_cursor

router = APIRouter(prefix="/dashboard")


@router.get("/reports")
def get_reports_endpoint(token: dict = Depends(verify_token)):
    """
    Returns all disaster needs reports joined with assigned volunteer metadata,
    specifically serializing volunteer_lat and volunteer_lng for the map UI.
    Requires valid authentication. Masks sensitive data for non-privileged callers.
    """
    docs = get_all_needs()
    reports = []

    # 1. Fetch assignments for open needs
    try:
        with get_db_cursor(commit=False) as cur:
            cur.execute("""
                SELECT need_id, volunteer_id
                FROM assignments
                WHERE resolved_at IS NULL
            """)
            assignment_rows = cur.fetchall()

            need_to_vols = {}
            all_vol_ids = set()
            for row in assignment_rows:
                n_id = row.get("need_id")
                v_id = row.get("volunteer_id")
                if n_id and v_id:
                    need_to_vols.setdefault(n_id, []).append(v_id)
                    all_vol_ids.add(v_id)

            # 2. Fetch metadata for all assigned volunteers
            vol_dict = {}
            if all_vol_ids:
                cur.execute(
                    "SELECT id, name, phone, lat, lng FROM volunteers WHERE id = ANY(%s)",
                    (list(all_vol_ids),)
                )
                for v_row in cur.fetchall():
                    vol_dict[v_row["id"]] = v_row
    except Exception as e:
        print(f"⚠️ Failed to load assignment metadata in dashboard: {e}")
        need_to_vols = {}
        vol_dict = {}
    
    is_privileged = False
    if isinstance(token, dict) and token.get("role") in ["system", "admin", "coordinator", "ngo"]:
        is_privileged = True

    # 3. Attach volunteer coordinates and assignment details to each report
    for r in docs:
        r_id = r.get("id")
        assigned_vols = []
        is_assigned = False
        if r_id in need_to_vols:
            for v_id in need_to_vols[r_id]:
                if v_id in vol_dict:
                    assigned_vols.append(dict(vol_dict[v_id]))
                else:
                    assigned_vols.append({
                        "id": v_id,
                        "name": "Unknown Volunteer",
                        "phone": None,
                        "lat": None,
                        "lng": None
                    })
            if assigned_vols:
                is_assigned = True

        current_status = str(r.get("status") or "").lower()
        if current_status not in ["resolved", "rejected"]:
            r["status"] = "assigned" if is_assigned else "open"
        
        r["assigned"] = is_assigned
        
        # Populate top-level fields required by frontend map.html
        if assigned_vols:
            primary_vol = assigned_vols[0]
            r["volunteer_id"] = primary_vol.get("id")
            r["volunteer_name"] = primary_vol.get("name")
            r["volunteer_phone"] = primary_vol.get("phone") if is_privileged else None
            r["volunteer_lat"] = primary_vol.get("lat") if is_privileged else None
            r["volunteer_lng"] = primary_vol.get("lng") if is_privileged else None
        else:
            r["volunteer_id"] = None
            r["volunteer_name"] = None
            r["volunteer_phone"] = None
            r["volunteer_lat"] = None
            r["volunteer_lng"] = None

        if not is_privileged:
            r["reporter_phone"] = None
            sanitized_assigned = []
            for av in assigned_vols:
                av_copy = dict(av)
                av_copy["phone"] = None
                av_copy["lat"] = None
                av_copy["lng"] = None
                sanitized_assigned.append(av_copy)
            r["assigned_volunteers"] = sanitized_assigned
        else:
            r["assigned_volunteers"] = assigned_vols
        
        reports.append(r)
        
    return reports


@router.get("")
def dashboard(token: dict = Depends(verify_token)):
    """
    Returns high-level dashboard metrics.
    Requires valid authentication.
    """
    needs = get_open_needs()
    vols = get_available_volunteers()
    all_vols = get_all_volunteers()
    all_ngos = get_all_ngos()

    total_needs = len(needs)
    total_volunteers = len(all_vols)
    total_ngos = len(all_ngos)

    critical = sum(1 for n in needs if str(n.get("severity", "")).lower() == "critical")
    high = sum(1 for n in needs if str(n.get("severity", "")).lower() == "high")
    medium = sum(1 for n in needs if str(n.get("severity", "")).lower() == "medium")
    low = sum(1 for n in needs if str(n.get("severity", "")).lower() == "low")

    flagged = sum(1 for n in needs if n.get("trust_score", 100) < 50)
    unmatched = sum(1 for n in needs if n.get("status") == "open")

    recent_need = needs[-1] if needs else None

    verified_pros = [v for v in all_vols if v.get("ngo_verified")]

    active_assignments_count = 0
    try:
        with get_db_cursor(commit=False) as cur:
            cur.execute("SELECT COUNT(*) as cnt FROM assignments WHERE resolved_at IS NULL")
            res = cur.fetchone()
            if res:
                active_assignments_count = res.get("cnt", 0)
    except Exception as e:
        print(f"⚠️ Could not fetch active assignments count: {e}")

    return {
        "total_needs": total_needs,
        "total_volunteers": total_volunteers,
        "total_ngos": total_ngos,
        "critical_cases": critical,
        "high_priority_cases": high,
        "medium_priority_cases": medium,
        "low_priority_cases": low,
        "flagged_cases": flagged,
        "unmatched_cases": unmatched,
        "recent_need": recent_need,
        "reports": needs,
        "summary": {
            "open_needs": total_needs,
            "available_volunteers": len(vols),
            "total_volunteers": total_volunteers,
            "total_ngos": total_ngos,
            "verified_professionals": len(verified_pros),
            "active_assignments": active_assignments_count
        }
    }