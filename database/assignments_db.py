from database.postgres_client import get_db_cursor
from datetime import datetime, timezone
import uuid

# These helpers ensure the statuses are synced across collections
from database.needs_db import update_need_status
from database.volunteers_db import update_volunteer_status

def save_assignment(need_id: str, volunteer_id: str) -> str:
    """
    Creates a new assignment and atomically updates both
    the volunteer and the need status in a single database transaction.
    """
    doc_id = uuid.uuid4().hex
    assigned_at = datetime.now(timezone.utc)

    with get_db_cursor(commit=True) as cur:
        # 1. Fetch volunteer and lock row
        cur.execute(
            "SELECT id, name, phone, active_assignments, available FROM volunteers WHERE id = %s FOR UPDATE",
            (volunteer_id,)
        )
        vol_data = cur.fetchone()
        if not vol_data:
            raise ValueError(f"Volunteer '{volunteer_id}' not found")

        if vol_data.get("active_assignments", 0) >= 3:
            raise ValueError(f"Volunteer '{volunteer_id}' has reached maximum active assignments")

        # 2. Fetch need and lock row
        cur.execute(
            "SELECT id, description, location_text, status FROM needs_reports WHERE id = %s FOR UPDATE",
            (need_id,)
        )
        need_data = cur.fetchone()
        if not need_data:
            raise ValueError(f"Need '{need_id}' not found")

        # Prevent duplicate active assignment if need is already resolved or rejected
        if need_data.get("status") in ("resolved", "rejected"):
            raise ValueError(f"Need '{need_id}' is already {need_data['status']}")

        # Prevent duplicate assignment of the same volunteer to this need
        cur.execute(
            "SELECT id FROM assignments WHERE need_id = %s AND volunteer_id = %s AND status = 'assigned'",
            (need_id, volunteer_id)
        )
        if cur.fetchone():
            raise ValueError(f"Volunteer '{volunteer_id}' is already assigned to Need '{need_id}'")

        # 3. Create the assignment record
        cur.execute(
            """
            INSERT INTO assignments (
                id, need_id, need_description, need_location, volunteer_id, 
                volunteer_name, volunteer_phone, assigned_at, status, resolved_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                doc_id, need_id, need_data.get("description", ""), need_data.get("location_text", ""),
                volunteer_id, vol_data.get("name", ""), vol_data.get("phone", ""),
                assigned_at, "assigned", None
            )
        )

        # 4. Update need status to assigned
        cur.execute(
            """
            UPDATE needs_reports SET 
                status = 'assigned',
                updated_at = %s
            WHERE id = %s
            """,
            (assigned_at, need_id)
        )

        # 5. Atomically update volunteer active_assignments counter & availability
        cur.execute(
            """
            UPDATE volunteers SET 
                active_assignments = active_assignments + 1,
                available = CASE WHEN active_assignments + 1 >= 3 THEN FALSE ELSE TRUE END,
                updated_at = %s
            WHERE id = %s
            """,
            (assigned_at, volunteer_id)
        )

    print(f"[INFO] Assignment {doc_id} created: Volunteer {volunteer_id} -> Need {need_id}")
    return doc_id


def resolve_assignment(doc_id: str, need_id: str, volunteer_id: str) -> bool:
    """
    Marks the job as done, resolves the need, and frees up the volunteer.
    Hardened for idempotency and concurrency:
    - Atomically locks assignment row (FOR UPDATE)
    - Validates existence and verifies supplied need_id and volunteer_id match
    - If already resolved, returns True without decrementing capacity again (idempotent)
    - If active, transitions assignment to resolved, resolves need, and decrements volunteer count
    - Missing or mismatched records fail atomically without partial updates
    """
    resolved_at = datetime.now(timezone.utc)

    with get_db_cursor(commit=True) as cur:
        # 1. Fetch and lock the assignment row
        cur.execute(
            """
            SELECT id, need_id, volunteer_id, status, resolved_at
            FROM assignments
            WHERE id = %s
            FOR UPDATE
            """,
            (doc_id,)
        )
        assignment = cur.fetchone()
        if not assignment:
            raise ValueError(f"Assignment '{doc_id}' not found")

        # 2. Strict ID matching validation: prevent corrupting or decrementing the wrong need/volunteer
        stored_need_id = str(assignment.get("need_id") or "")
        stored_volunteer_id = str(assignment.get("volunteer_id") or "")

        if stored_need_id != str(need_id):
            raise ValueError(
                f"Mismatched need_id for assignment '{doc_id}': expected '{stored_need_id}', got '{need_id}'"
            )
        if stored_volunteer_id != str(volunteer_id):
            raise ValueError(
                f"Mismatched volunteer_id for assignment '{doc_id}': expected '{stored_volunteer_id}', got '{volunteer_id}'"
            )

        # 3. Idempotency check: if already resolved, do not decrement volunteer capacity again
        if assignment.get("status") == "resolved" or assignment.get("resolved_at") is not None:
            print(f"[INFO] Assignment {doc_id} is already resolved. Idempotent call; skipping capacity decrement.")
            return True

        # 4. Lock need and volunteer rows to guarantee atomic state transition
        cur.execute("SELECT id, status FROM needs_reports WHERE id = %s FOR UPDATE", (need_id,))
        cur.execute("SELECT id, active_assignments FROM volunteers WHERE id = %s FOR UPDATE", (volunteer_id,))

        # 5. Update assignment status
        cur.execute(
            """
            UPDATE assignments SET 
                status = 'resolved',
                resolved_at = %s
            WHERE id = %s
            """,
            (resolved_at, doc_id)
        )

        # 6. Update need status
        cur.execute(
            """
            UPDATE needs_reports SET 
                status = 'resolved',
                updated_at = %s
            WHERE id = %s
            """,
            (resolved_at, need_id)
        )

        # 7. Atomically decrement volunteer active_assignments counter & restore availability
        cur.execute(
            """
            UPDATE volunteers SET 
                active_assignments = GREATEST(0, active_assignments - 1),
                available = TRUE,
                updated_at = %s
            WHERE id = %s
            """,
            (resolved_at, volunteer_id)
        )

    print(f"[OK] Assignment {doc_id} resolved! Volunteer is free again.")
    return True


def get_assignments_by_volunteer_id(volunteer_id: str):
    """Fetch assignments associated with a volunteer"""
    with get_db_cursor(commit=False) as cur:
        cur.execute("SELECT * FROM assignments WHERE volunteer_id = %s", (volunteer_id,))
        rows = cur.fetchall()
        for row in rows:
            if row.get("assigned_at") and hasattr(row["assigned_at"], "isoformat"):
                row["assigned_at"] = row["assigned_at"].isoformat()
            if row.get("resolved_at") and hasattr(row["resolved_at"], "isoformat"):
                row["resolved_at"] = row["resolved_at"].isoformat()
        return rows


def get_assignment_by_id(assignment_id: str) -> dict | None:
    """Fetch assignment by its ID"""
    with get_db_cursor(commit=False) as cur:
        cur.execute("SELECT * FROM assignments WHERE id = %s", (assignment_id,))
        row = cur.fetchone()
    if row:
        if row.get("assigned_at") and hasattr(row["assigned_at"], "isoformat"):
            row["assigned_at"] = row["assigned_at"].isoformat()
        if row.get("resolved_at") and hasattr(row["resolved_at"], "isoformat"):
            row["resolved_at"] = row["resolved_at"].isoformat()
        return row
    return None