import json
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List

from database.postgres_client import get_db_cursor
from database.verification import CorroborationCandidate, compute_text_hash, normalize_phone


def save_need(data: dict) -> str:
    """Stores need into Supabase PostgreSQL, persisting full Phase 2 trust metadata."""
    doc_id = data.get("id") or uuid.uuid4().hex

    data.setdefault("status", "open")

    timestamp = data.get("timestamp")
    if timestamp:
        if isinstance(timestamp, str):
            try:
                timestamp = datetime.fromisoformat(timestamp)
            except ValueError:
                timestamp = datetime.now(timezone.utc)
        elif not isinstance(timestamp, datetime):
            timestamp = datetime.now(timezone.utc)
    else:
        timestamp = datetime.now(timezone.utc)

    data["timestamp"] = timestamp

    req_qty = data.get("required_quantity")
    if req_qty is not None and not isinstance(req_qty, bool):
        try:
            req_qty = int(req_qty)
            if req_qty <= 0:
                req_qty = None
        except (TypeError, ValueError):
            req_qty = None
    else:
        req_qty = None

    ful_qty = data.get("fulfilled_quantity")
    if ful_qty is not None and not isinstance(ful_qty, bool):
        try:
            ful_qty = int(ful_qty)
        except (TypeError, ValueError):
            ful_qty = 0
    else:
        ful_qty = 0

    reasons_val = data.get("reasons") or data.get("trust_reasons") or []
    reasons_json = json.dumps(reasons_val)

    with get_db_cursor(commit=True) as cur:
        # Standard insert with backward compatibility for pre-migration schemas
        try:
            cur.execute("SAVEPOINT save_need_sp")
            cur.execute(
                """
                INSERT INTO needs_reports (
                    id, reporter_name, reporter_phone, location_text, description, lat, lng,
                    severity, category, status, timestamp, updated_at, trust_score,
                    summary_en, summary_local, disaster_type, help_needed,
                    resource_type, required_quantity, fulfilled_quantity, unit, urgency,
                    trust_tier, dispatch_action, priority, engine_version, text_hash, trust_reasons, flag
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    doc_id, data.get("reporter_name"), data.get("reporter_phone"), data.get("location_text"),
                    data.get("description"), data.get("lat"), data.get("lng"), data.get("severity"),
                    data.get("category"), data["status"], data["timestamp"], data.get("updated_at"),
                    data.get("trust_score"), data.get("summary_en"), data.get("summary_local"),
                    data.get("disaster_type"), data.get("help_needed"),
                    data.get("resource_type", "food"), req_qty,
                    ful_qty, data.get("unit", "units"), data.get("urgency", "medium"),
                    data.get("trust_tier", "unscored"), data.get("dispatch_action", "human_review"),
                    data.get("priority", "MEDIUM"), data.get("engine_version", "2.0.0"),
                    data.get("text_hash"), reasons_json, data.get("flag", "unverified")
                )
            )
            cur.execute("RELEASE SAVEPOINT save_need_sp")
        except Exception:
            try:
                cur.execute("ROLLBACK TO SAVEPOINT save_need_sp")
            except Exception:
                pass
            # Fallback for baseline schemas without migration 002
            cur.execute(
                """
                INSERT INTO needs_reports (
                    id, reporter_name, reporter_phone, location_text, description, lat, lng,
                    severity, category, status, timestamp, updated_at, trust_score,
                    summary_en, summary_local, disaster_type, help_needed,
                    resource_type, required_quantity, fulfilled_quantity, unit, urgency
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    doc_id, data.get("reporter_name"), data.get("reporter_phone"), data.get("location_text"),
                    data.get("description"), data.get("lat"), data.get("lng"), data.get("severity"),
                    data.get("category"), data["status"], data["timestamp"], data.get("updated_at"),
                    data.get("trust_score"), data.get("summary_en"), data.get("summary_local"),
                    data.get("disaster_type"), data.get("help_needed"),
                    data.get("resource_type", "food"), req_qty,
                    ful_qty, data.get("unit", "units"), data.get("urgency", "medium")
                )
            )

    print(f"[OK] Successfully saved need with ID: {doc_id}")
    return doc_id


def update_need_status(doc_id: str, new_status: str):
    """
    Updates the status of a need (e.g., from 'open' to 'assigned' or 'resolved').
    """
    with get_db_cursor(commit=True) as cur:
        cur.execute(
            """
            UPDATE needs_reports SET
                status = %s,
                updated_at = %s
            WHERE id = %s
            """,
            (new_status, datetime.now(timezone.utc), str(doc_id))
        )
    print(f"[INFO] Need {doc_id} status updated to {new_status}")


def get_open_needs() -> list:
    """
    Fetches all currently unassigned/open needs for the volunteers to see.
    """
    with get_db_cursor(commit=False) as cur:
        cur.execute("SELECT * FROM needs_reports WHERE status = 'open'")
        rows = cur.fetchall()
        for row in rows:
            if row.get("timestamp"):
                row["timestamp"] = row["timestamp"].isoformat()
            if row.get("updated_at"):
                row["updated_at"] = row["updated_at"].isoformat()
        return rows


def get_all_needs() -> list:
    """
    Fetches all needs from PostgreSQL regardless of status.
    """
    with get_db_cursor(commit=False) as cur:
        cur.execute("SELECT * FROM needs_reports")
        rows = cur.fetchall()

    for r in rows:
        if r.get("timestamp"):
            r["timestamp"] = r["timestamp"].isoformat()
        if r.get("updated_at"):
            r["updated_at"] = r["updated_at"].isoformat()

    return rows


def get_need_by_id(doc_id: str) -> dict | None:
    """Fetches a single need by its ID."""
    with get_db_cursor(commit=False) as cur:
        cur.execute("SELECT * FROM needs_reports WHERE id = %s", (str(doc_id),))
        row = cur.fetchone()

    if row:
        if row.get("timestamp"):
            row["timestamp"] = row["timestamp"].isoformat()
        if row.get("updated_at"):
            row["updated_at"] = row["updated_at"].isoformat()
        return row
    return None


def check_corroboration(lat: float, lng: float, category: str) -> int:
    """
    Legacy corroboration helper: checks count of nearby reports sharing the same category.
    """
    try:
        two_hours_ago = datetime.now(timezone.utc) - timedelta(hours=2)

        with get_db_cursor(commit=False) as cur:
            cur.execute(
                """
                SELECT lat, lng, timestamp FROM needs_reports
                WHERE category = %s AND timestamp >= %s
                """,
                (category, two_hours_ago)
            )
            rows = cur.fetchall()

        count = 0
        for r in rows:
            doc_lat = r.get("lat")
            doc_lng = r.get("lng")
            if (
                doc_lat is not None
                and doc_lng is not None
                and lat is not None
                and lng is not None
            ):
                if abs(float(doc_lat) - float(lat)) <= 0.05 and abs(float(doc_lng) - float(lng)) <= 0.05:
                    count += 1
            else:
                count += 1

        return count

    except Exception as e:
        print(f"[Corroboration] Query failed: {e}. Defaulting to 0.")
        return 0


def check_duplicate_and_rate_limit(
    reporter_phone: str,
    text: str,
    reference_time: Optional[datetime] = None,
) -> dict:
    """
    Checks for identical normalized text hashes and rate limiting (>3 reports per hour)
    from the given reporter phone.
    """
    ref_time = reference_time or datetime.now(timezone.utc)
    if ref_time.tzinfo is None:
        ref_time = ref_time.replace(tzinfo=timezone.utc)
    one_hour_ago = ref_time - timedelta(hours=1)

    norm_phone = normalize_phone(reporter_phone) or str(reporter_phone or "").strip()
    text_hash = compute_text_hash(text)

    is_identical_text = False
    recent_count = 0

    try:
        with get_db_cursor(commit=False) as cur:
            # Check for identical text hash or duplicate description
            cur.execute(
                """
                SELECT COUNT(*) as cnt FROM needs_reports
                WHERE text_hash = %s OR (text_hash IS NULL AND LOWER(TRIM(description)) = LOWER(TRIM(%s)))
                """,
                (text_hash, text)
            )
            row = cur.fetchone()
            if row:
                is_identical_text = (row.get("cnt") or row.get("count") or 0) > 0

            # Check rate limit: reports within previous hour from same phone
            cur.execute(
                """
                SELECT COUNT(*) as cnt FROM needs_reports
                WHERE (reporter_phone = %s OR reporter_phone = %s)
                  AND timestamp >= %s AND timestamp <= %s
                """,
                (norm_phone, str(reporter_phone), one_hour_ago, ref_time)
            )
            row_cnt = cur.fetchone()
            if row_cnt:
                recent_count = row_cnt.get("cnt") or row_cnt.get("count") or 0
    except Exception as e:
        print(f"[Duplicate/RateLimit] Query failed: {e}")
        return {
            "text_hash": text_hash,
            "is_identical_text": False,
            "recent_reports_count_one_hour": 1,
            "error": str(e),
        }

    return {
        "text_hash": text_hash,
        "is_identical_text": is_identical_text,
        "recent_reports_count_one_hour": recent_count,
    }


def check_reporter_reputation(
    reporter_phone: str,
    reporter_id: Optional[str] = None,
) -> dict:
    """
    Checks reporter reputation: registered NGO/camp status, resolved reports history,
    and flagged history.
    """
    norm_phone = normalize_phone(reporter_phone) or str(reporter_phone or "").strip()

    is_registered_ngo = False
    has_resolved_history = False
    is_flagged_history = False

    try:
        with get_db_cursor(commit=False) as cur:
            # Check if associated with verified NGO
            cur.execute(
                """
                SELECT verified FROM ngos
                WHERE (phone = %s OR phone = %s)
                """,
                (norm_phone, str(reporter_phone))
            )
            ngo_row = cur.fetchone()
            if ngo_row and ngo_row.get("verified") is True:
                is_registered_ngo = True

            # Check coordinator-confirmed resolved history in needs_reports
            cur.execute(
                """
                SELECT COUNT(*) as cnt FROM needs_reports
                WHERE (reporter_phone = %s OR reporter_phone = %s)
                  AND status = 'resolved'
                """,
                (norm_phone, str(reporter_phone))
            )
            res_row = cur.fetchone()
            if res_row and (res_row.get("cnt") or res_row.get("count") or 0) > 0:
                has_resolved_history = True

            # Check flagged history in needs_reports
            cur.execute(
                """
                SELECT COUNT(*) as cnt FROM needs_reports
                WHERE (reporter_phone = %s OR reporter_phone = %s)
                  AND (status = 'rejected' OR flag = 'suspicious')
                """,
                (norm_phone, str(reporter_phone))
            )
            flag_row = cur.fetchone()
            if flag_row and (flag_row.get("cnt") or flag_row.get("count") or 0) > 0:
                is_flagged_history = True
    except Exception as e:
        print(f"[ReporterReputation] Query failed: {e}")

    return {
        "is_registered_ngo_or_camp": is_registered_ngo,
        "has_resolved_history": has_resolved_history,
        "is_flagged_history": is_flagged_history,
        "flagged_deduction": 15 if is_flagged_history else 0,
    }


def get_corroboration_candidates(
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    category: Optional[str] = None,
    exclude_need_id: Optional[str] = None,
    exclude_phone: Optional[str] = None,
    reference_time: Optional[datetime] = None,
    *,
    resource_type: Optional[str] = None,
    **kwargs,
) -> List[CorroborationCandidate]:
    """
    Retrieves corroboration candidates within 3 hours matching the category/resource_type.
    Returns list of CorroborationCandidate objects.
    """
    ref_time = reference_time or datetime.now(timezone.utc)
    if ref_time.tzinfo is None:
        ref_time = ref_time.replace(tzinfo=timezone.utc)
    three_hours_ago = ref_time - timedelta(hours=3)

    norm_ex_phone = normalize_phone(exclude_phone) if exclude_phone else None
    cat_norm = str(resource_type or category or kwargs.get("need_type") or "").strip().lower()

    candidates: List[CorroborationCandidate] = []
    try:
        with get_db_cursor(commit=False) as cur:
            cur.execute(
                """
                SELECT id, category, resource_type, reporter_phone, timestamp, lat, lng, flag
                FROM needs_reports
                WHERE timestamp >= %s AND timestamp <= %s
                  AND (LOWER(category) = %s OR LOWER(resource_type) = %s)
                """,
                (three_hours_ago, ref_time, cat_norm, cat_norm)
            )
            rows = cur.fetchall()

            for r in rows:
                c_id = str(r.get("id") or "")
                if exclude_need_id and c_id == str(exclude_need_id):
                    continue

                r_phone = str(r.get("reporter_phone") or "")
                if norm_ex_phone and normalize_phone(r_phone) == norm_ex_phone:
                    continue

                c_lat = r.get("lat")
                c_lng = r.get("lng")
                c_time = r.get("timestamp")
                if isinstance(c_time, str):
                    try:
                        c_time = datetime.fromisoformat(c_time)
                    except ValueError:
                        c_time = ref_time
                elif not isinstance(c_time, datetime):
                    c_time = ref_time

                cand = CorroborationCandidate(
                    candidate_id=c_id,
                    need_type=r.get("resource_type") or r.get("category") or cat_norm,
                    reporter_phone=r_phone,
                    timestamp=c_time,
                    latitude=float(c_lat) if c_lat is not None else None,
                    longitude=float(c_lng) if c_lng is not None else None,
                    is_duplicate=(r.get("flag") == "duplicate"),
                )
                candidates.append(cand)
    except Exception as e:
        print(f"[CorroborationCandidates] Query failed: {e}")

    return candidates
