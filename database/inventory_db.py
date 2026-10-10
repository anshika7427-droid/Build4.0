import uuid
import math
from datetime import datetime, timezone
from database.postgres_client import get_db_cursor

def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = (math.sin(dphi / 2) ** 2
         + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

# Explicit justified mapping for emergency relief resources
COMPATIBLE_RESOURCE_CATEGORIES = {
    "food": {"food", "meals", "cooked meals", "dry rations", "rations", "food packets", "groceries"},
    "meals": {"food", "meals", "cooked meals", "dry rations", "rations", "food packets"},
    "supplies": {"food", "meals", "cooked meals", "dry rations", "water", "shelter"},
    "water": {"water", "drinking water", "clean water", "water cans", "purification kits"},
    "medical": {"medical", "medicine", "medicines", "first aid", "first aid kits", "trauma kits", "pharma"},
    "rescue": {"rescue", "boats", "boat", "rescue boat", "life jackets", "life vests", "ropes"},
    "shelter": {"shelter", "tarpaulins", "blankets", "tents", "tarps", "mats"},
}

def add_or_update_inventory(ngo_id: str, resource_type: str, total_quantity: int, unit: str = "units") -> str:
    """
    Adds or updates an inventory item for an NGO.
    Concurrency hardened:
    - Validates non-negative quantity.
    - Locks existing inventory row (FOR UPDATE) to prevent race conditions during allocation.
    - Enforces total_quantity >= reserved_quantity to preserve active allocations and prevent negative available stock.
    - Uses ON CONFLICT to handle concurrent first-insert races safely.
    """
    if total_quantity < 0:
        raise ValueError("total_quantity must be non-negative")
    resource_type = resource_type.strip().lower()
    doc_id = uuid.uuid4().hex

    with get_db_cursor(commit=True) as cur:
        # Check and lock if row already exists for this NGO
        cur.execute(
            """
            SELECT id, total_quantity, reserved_quantity
            FROM ngo_inventory
            WHERE ngo_id = %s AND LOWER(resource_type) = %s
            FOR UPDATE
            """,
            (ngo_id, resource_type)
        )
        row = cur.fetchone()
        if row:
            inv_id = row["id"]
            reserved = row.get("reserved_quantity") or 0
            if total_quantity < reserved:
                raise ValueError(
                    f"Cannot set total_quantity ({total_quantity}) lower than currently reserved stock ({reserved})"
                )
            avail = max(0, total_quantity - reserved)
            cur.execute("""
                UPDATE ngo_inventory
                SET total_quantity = %s,
                    available_quantity = %s,
                    unit = %s,
                    updated_at = NOW()
                WHERE id = %s
            """, (total_quantity, avail, unit, inv_id))
            return inv_id
        else:
            # Handle first-insert race safely using ON CONFLICT (ngo_id, resource_type)
            cur.execute("""
                INSERT INTO ngo_inventory (
                    id, ngo_id, resource_type, total_quantity, reserved_quantity, available_quantity, unit, updated_at
                )
                VALUES (%s, %s, %s, %s, 0, %s, %s, NOW())
                ON CONFLICT (ngo_id, resource_type)
                DO UPDATE SET
                    total_quantity = CASE
                        WHEN EXCLUDED.total_quantity >= ngo_inventory.reserved_quantity
                        THEN EXCLUDED.total_quantity
                        ELSE ngo_inventory.total_quantity
                    END,
                    available_quantity = CASE
                        WHEN EXCLUDED.total_quantity >= ngo_inventory.reserved_quantity
                        THEN EXCLUDED.total_quantity - ngo_inventory.reserved_quantity
                        ELSE ngo_inventory.available_quantity
                    END,
                    unit = EXCLUDED.unit,
                    updated_at = NOW()
                RETURNING id, reserved_quantity, total_quantity;
            """, (doc_id, ngo_id, resource_type, total_quantity, total_quantity, unit))
            res = cur.fetchone()
            if res and total_quantity < (res.get("reserved_quantity") or 0):
                raise ValueError(
                    f"Cannot set total_quantity ({total_quantity}) lower than currently reserved stock ({res.get('reserved_quantity')})"
                )
            return res["id"] if res else doc_id

def get_ngo_inventory(ngo_id: str) -> list:
    """Fetches all inventory records for an NGO."""
    with get_db_cursor(commit=False) as cur:
        cur.execute("SELECT * FROM ngo_inventory WHERE ngo_id = %s", (ngo_id,))
        return cur.fetchall()

def allocate_ngos_for_need(need_id: str) -> dict:
    """
    Allocates available NGO stock against a need's required quantity.
    Supports partial fulfillment across multiple NGOs (e.g., 200 meals = 120 + 80).
    Uses row-level locking (FOR UPDATE) to prevent over-allocation and race conditions.
    Uses explicit category mapping instead of wildcard fallback.
    """
    with get_db_cursor(commit=True) as cur:
        # 1. Lock the need record
        cur.execute("SELECT * FROM needs_reports WHERE id = %s FOR UPDATE", (need_id,))
        need = cur.fetchone()
        if not need:
            raise ValueError(f"Need '{need_id}' not found")

        req_qty = need.get("required_quantity")
        if req_qty is None or req_qty <= 0:
            return {
                "need_id": need_id,
                "status": "unspecified_quantity",
                "required_quantity": None,
                "fulfilled_quantity": 0,
                "remaining_shortfall": None,
                "allocations": [],
                "message": "Cannot allocate inventory for unspecified quantity"
            }

        fulfilled_qty = need.get("fulfilled_quantity") or 0
        remaining_qty = req_qty - fulfilled_qty
        resource_type = (need.get("resource_type") or need.get("category") or "food").strip().lower()

        if remaining_qty <= 0:
            return {
                "need_id": need_id,
                "status": "already_fulfilled",
                "required_quantity": req_qty,
                "fulfilled_quantity": fulfilled_qty,
                "remaining_shortfall": 0,
                "allocations": []
            }

        # 2. Lock matching inventories
        cur.execute("""
            SELECT i.id AS inventory_id, i.ngo_id, i.resource_type, i.total_quantity, i.reserved_quantity,
                   (i.total_quantity - i.reserved_quantity) AS available_stock,
                   n.ngo_name, n.lat, n.lng, n.radius, n.verified
            FROM ngo_inventory i
            JOIN ngos n ON i.ngo_id = n.id
            WHERE LOWER(i.resource_type) = %s AND (i.total_quantity - i.reserved_quantity) > 0
            FOR UPDATE OF i
        """, (resource_type,))
        candidates = cur.fetchall()

        if not candidates:
            # Explicit category mapping fallback instead of wildcard matching all rows
            compatible_terms = COMPATIBLE_RESOURCE_CATEGORIES.get(resource_type)
            if not compatible_terms:
                for cat_key, terms in COMPATIBLE_RESOURCE_CATEGORIES.items():
                    if cat_key in resource_type or any(t in resource_type for t in terms):
                        compatible_terms = terms
                        break
            if compatible_terms:
                cur.execute("""
                    SELECT i.id AS inventory_id, i.ngo_id, i.resource_type, i.total_quantity, i.reserved_quantity,
                           (i.total_quantity - i.reserved_quantity) AS available_stock,
                           n.ngo_name, n.lat, n.lng, n.radius, n.verified
                    FROM ngo_inventory i
                    JOIN ngos n ON i.ngo_id = n.id
                    WHERE LOWER(i.resource_type) = ANY(%s) AND (i.total_quantity - i.reserved_quantity) > 0
                    FOR UPDATE OF i
                """, (list(compatible_terms),))
                candidates = cur.fetchall()
            else:
                candidates = []

        # 3. Rank candidates by proximity to need (if coords available) and available stock
        n_lat = float(need.get("lat") or 0.0)
        n_lng = float(need.get("lng") or 0.0)

        def rank_key(cand):
            c_lat = float(cand.get("lat") or 0.0)
            c_lng = float(cand.get("lng") or 0.0)
            dist = _haversine_km(n_lat, n_lng, c_lat, c_lng) if (n_lat and n_lng and c_lat and c_lng) else 0.0
            # Higher verified, lower distance, higher available stock
            return (-int(bool(cand.get("verified"))), dist, -cand["available_stock"])

        candidates.sort(key=rank_key)

        allocations = []
        for cand in candidates:
            avail = cand["available_stock"]
            if avail <= 0 or remaining_qty <= 0:
                continue

            alloc_qty = min(avail, remaining_qty)
            alloc_id = uuid.uuid4().hex

            # Insert allocation record
            cur.execute("""
                INSERT INTO ngo_allocations (id, need_id, ngo_id, resource_type, allocated_quantity, status, created_at)
                VALUES (%s, %s, %s, %s, %s, 'allocated', NOW())
            """, (alloc_id, need_id, cand["ngo_id"], cand["resource_type"], alloc_qty))

            # Atomically reserve inventory
            new_reserved = cand["reserved_quantity"] + alloc_qty
            new_avail = cand["total_quantity"] - new_reserved
            cur.execute("""
                UPDATE ngo_inventory
                SET reserved_quantity = %s,
                    available_quantity = %s,
                    updated_at = NOW()
                WHERE id = %s
            """, (new_reserved, new_avail, cand["inventory_id"]))

            allocations.append({
                "allocation_id": alloc_id,
                "ngo_id": cand["ngo_id"],
                "ngo_name": cand["ngo_name"],
                "resource_type": cand["resource_type"],
                "allocated_quantity": alloc_qty
            })

            fulfilled_qty += alloc_qty
            remaining_qty -= alloc_qty

            if remaining_qty <= 0:
                break

        # 4. Update need status
        new_status = "matched" if remaining_qty == 0 else ("partially_matched" if fulfilled_qty > 0 else need.get("status", "open"))
        cur.execute("""
            UPDATE needs_reports
            SET fulfilled_quantity = %s,
                required_quantity = %s,
                status = %s,
                updated_at = NOW()
            WHERE id = %s
        """, (fulfilled_qty, req_qty, new_status, need_id))

        return {
            "need_id": need_id,
            "resource_type": resource_type,
            "required_quantity": req_qty,
            "fulfilled_quantity": fulfilled_qty,
            "remaining_shortfall": max(0, remaining_qty),
            "status": new_status,
            "allocations": allocations
        }

def release_allocations_for_need(need_id: str) -> bool:
    """Compensating transaction: releases reserved inventory if assignment fails."""
    with get_db_cursor(commit=True) as cur:
        cur.execute("SELECT * FROM ngo_allocations WHERE need_id = %s AND status = 'allocated'", (need_id,))
        allocs = cur.fetchall()
        for a in allocs:
            # Lock inventory row before updating
            cur.execute("""
                SELECT id, total_quantity, reserved_quantity
                FROM ngo_inventory
                WHERE ngo_id = %s AND LOWER(resource_type) = LOWER(%s)
                FOR UPDATE
            """, (a["ngo_id"], a["resource_type"]))
            inv_row = cur.fetchone()
            if inv_row:
                new_reserved = max(0, inv_row["reserved_quantity"] - a["allocated_quantity"])
                new_avail = max(0, inv_row["total_quantity"] - new_reserved)
                cur.execute("""
                    UPDATE ngo_inventory
                    SET reserved_quantity = %s,
                        available_quantity = %s,
                        updated_at = NOW()
                    WHERE id = %s
                """, (new_reserved, new_avail, inv_row["id"]))
            cur.execute("UPDATE ngo_allocations SET status = 'cancelled' WHERE id = %s", (a["id"],))
        cur.execute("UPDATE needs_reports SET fulfilled_quantity = 0, status = 'open' WHERE id = %s", (need_id,))
    return True
