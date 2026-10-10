import io
import sys
import os
import re
import json
import csv
from html import unescape
from getpass import getpass
from typing import Optional, Dict, Any, List, Tuple

# Force UTF-8 stdout/stderr on Windows to prevent UnicodeEncodeError with emojis
if sys.platform == "win32" and type(sys.stdout).__name__ == "TextIOWrapper":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
if sys.platform == "win32" and type(sys.stderr).__name__ == "TextIOWrapper":
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

import requests
from dotenv import load_dotenv

# Load configuration from config/.env and root .env
load_dotenv(dotenv_path="config/.env")
load_dotenv(dotenv_path=".env")

# ================= CONFIGURATION & URL RESOLUTION =================
DEFAULT_BASE_URL = "http://127.0.0.1:8000"

def normalize_url(url: str) -> str:
    """
    Normalizes a base URL:
    - Strips leading/trailing whitespace
    - Strips all trailing slashes
    - Adds http:// scheme if missing
    """
    cleaned = (url or "").strip()
    if not cleaned:
        return DEFAULT_BASE_URL
    cleaned = cleaned.rstrip("/")
    if not (cleaned.startswith("http://") or cleaned.startswith("https://")):
        cleaned = f"http://{cleaned}"
    return cleaned

def resolve_api_url() -> Tuple[str, str]:
    """
    Resolves the effective API base URL using strict precedence:
    1. SETU_API_URL (explicit CLI override)
    2. SETU_API_BASE_URL (standard API base URL)
    3. SETU_BASE_URL (backend base URL)
    4. DEFAULT_BASE_URL (http://127.0.0.1:8000)

    Returns:
        (normalized_url: str, source_description: str)
    """
    for var in ("SETU_API_URL", "SETU_API_BASE_URL", "SETU_BASE_URL"):
        val = os.getenv(var)
        if val and val.strip():
            return normalize_url(val), var

    return DEFAULT_BASE_URL, f"default ({DEFAULT_BASE_URL})"

BASE_URL, URL_SOURCE = resolve_api_url()

INITIAL_SECRET_TOKEN = os.getenv("SECRET_TOKEN", "")

# Active session state
session_state = {
    "token": INITIAL_SECRET_TOKEN,
    "role": "system" if INITIAL_SECRET_TOKEN else "unauthenticated",
    "user_email": "system@setu.local" if INITIAL_SECRET_TOKEN else None,
    "user_id": "system" if INITIAL_SECRET_TOKEN else None,
    "is_jwt": False,
    "last_need_id": None,
    "last_ngo_id": None,
    "last_assignment_id": None,
}

REQUEST_TIMEOUT = 12

# ================= ANSI STYLES =================
class C:
    RED = '\033[91m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    MAGENTA = '\033[95m'
    BOLD = '\033[1m'
    DIM = '\033[2m'
    END = '\033[0m'

def red(t): return f"{C.RED}{t}{C.END}"
def green(t): return f"{C.GREEN}{t}{C.END}"
def yellow(t): return f"{C.YELLOW}{t}{C.END}"
def cyan(t): return f"{C.CYAN}{t}{C.END}"
def magenta(t): return f"{C.MAGENTA}{t}{C.END}"
def bold(t): return f"{C.BOLD}{t}{C.END}"
def dim(t): return f"{C.DIM}{t}{C.END}"

# ================= SAFE PROMPT HELPERS =================
def safe_input(prompt_text: str) -> str:
    """Read input safely, catching KeyboardInterrupt / EOF."""
    try:
        val = input(prompt_text)
        return val.strip()
    except (KeyboardInterrupt, EOFError):
        print("\n\n" + yellow("👋 Operation cancelled."))
        raise KeyboardInterrupt

def prompt_str(prompt_text: str, default: Optional[str] = None) -> str:
    suffix = f" [{dim(default)}]: " if default else ": "
    val = safe_input(prompt_text + suffix)
    return val if val else (default or "")

def prompt_int(prompt_text: str, default: Optional[int] = None) -> Optional[int]:
    while True:
        suffix = f" [{dim(str(default))}]: " if default is not None else ": "
        raw = safe_input(prompt_text + suffix)
        if not raw and default is not None:
            return default
        if not raw and default is None:
            return None
        try:
            return int(raw)
        except ValueError:
            print(red("❌ Please enter a valid integer."))

def prompt_float(prompt_text: str, default: Optional[float] = None) -> Optional[float]:
    while True:
        suffix = f" [{dim(str(default))}]: " if default is not None else ": "
        raw = safe_input(prompt_text + suffix)
        if not raw and default is not None:
            return default
        if not raw and default is None:
            return None
        try:
            return float(raw)
        except ValueError:
            print(red("❌ Please enter a valid number."))

def clear_screen():
    os.system('cls' if os.name == 'nt' else 'clear')

def pause():
    try:
        input("\n" + dim("Press Enter to continue..."))
    except (KeyboardInterrupt, EOFError):
        print()

def print_section(title: str):
    print("\n" + bold(cyan("=" * 68)))
    print(bold(cyan(f" 🌐 {title.upper()}")))
    print(bold(cyan("=" * 68)) + "\n")

# ================= HTTP CLIENT & ERROR HANDLING =================
def _get_headers(auth: bool = True) -> Dict[str, str]:
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if auth and session_state["token"]:
        headers["Authorization"] = f"Bearer {session_state['token']}"
    return headers

def parse_error_response(res: requests.Response) -> str:
    """
    Extract a clean, human-readable error from HTTP response.
    Never prints raw HTML documents to the terminal.
    """
    content_type = res.headers.get("content-type", "").lower()
    server = res.headers.get("server", "")
    server_info = f" [{server}]" if server else ""
    status = res.status_code
    reason = res.reason or "Error"

    # 1. JSON error format
    if "application/json" in content_type:
        try:
            data = res.json()
            if isinstance(data, dict):
                detail = data.get("detail") or data.get("error") or data.get("message")
                if detail:
                    return str(detail)
            return json.dumps(data)
        except Exception:
            pass

    # 2. HTML Error Page (Cloud Run, Google Frontend, Nginx, Cloudflare, etc.)
    text = (res.text or "").strip()
    if "text/html" in content_type or text.startswith("<html") or text.startswith("<!doctype") or "<body" in text.lower():
        title_m = re.search(r"<title>(.*?)</title>", text, re.IGNORECASE | re.DOTALL)
        title = unescape(title_m.group(1).strip()) if title_m else ""

        headings = []
        for m in re.finditer(r"<h[12][^>]*>(.*?)</h[12]>", text, re.IGNORECASE | re.DOTALL):
            h_text = re.sub(r"<[^>]+>", " ", m.group(1))
            h_clean = " ".join(unescape(h_text).split())
            if h_clean and h_clean not in headings:
                headings.append(h_clean)

        msg_parts = []
        if title:
            msg_parts.append(title)
        for h in headings:
            if h.lower() != title.lower() and h not in msg_parts:
                msg_parts.append(h)

        if msg_parts:
            detail = " — ".join(msg_parts)
            return f"HTTP {status}{server_info}: {detail}"
        return f"HTTP {status}{server_info}: Server returned an HTML error page ({reason})."

    # 3. Plain text
    if text:
        cleaned = " ".join(text.split()[:30])
        return f"HTTP {status}: {cleaned}"

    return f"HTTP {status} {reason}"

def safe_request(method: str, path: str, payload: Optional[dict] = None, auth: bool = True) -> Dict[str, Any]:
    """Execute HTTP request with strict error handling and clean error formatting."""
    url = f"{BASE_URL}{path}"
    headers = _get_headers(auth=auth)

    try:
        if method.upper() == "GET":
            res = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT)
        elif method.upper() == "POST":
            res = requests.post(url, json=payload, headers=headers, timeout=REQUEST_TIMEOUT)
        elif method.upper() == "PATCH":
            res = requests.patch(url, json=payload, headers=headers, timeout=REQUEST_TIMEOUT)
        elif method.upper() == "DELETE":
            res = requests.delete(url, headers=headers, timeout=REQUEST_TIMEOUT)
        else:
            return {"ok": False, "status_code": 0, "error": f"Unsupported method: {method}", "data": None}

        # Parse body
        try:
            data = res.json()
        except Exception:
            data = {"message": res.text} if res.text else {}

        if 200 <= res.status_code < 300:
            return {"ok": True, "status_code": res.status_code, "data": data, "error": None}
        else:
            error_msg = parse_error_response(res)
            return {"ok": False, "status_code": res.status_code, "error": error_msg, "data": data}

    except requests.exceptions.ConnectionError:
        return {
            "ok": False,
            "status_code": 0,
            "error": f"Cannot connect to SETU backend at {BASE_URL}. Is the server running?",
            "data": None
        }
    except requests.exceptions.Timeout:
        return {
            "ok": False,
            "status_code": 0,
            "error": f"Request to {path} timed out after {REQUEST_TIMEOUT}s.",
            "data": None
        }
    except Exception as e:
        return {
            "ok": False,
            "status_code": 0,
            "error": f"Network error: {str(e)}",
            "data": None
        }

def check_backend_status() -> Dict[str, Any]:
    """Quick check of backend health and connectivity using effective BASE_URL."""
    res = safe_request("GET", "/health", auth=False)
    if res["ok"] and isinstance(res["data"], dict):
        return {
            "online": True,
            "database": res["data"].get("database", "unknown"),
            "status": res["data"].get("status", "ok"),
            "error": None
        }
    return {
        "online": False,
        "database": "unreachable",
        "status": "offline",
        "error": res.get("error") or "Server is unreachable"
    }

# ================= WORKFLOW ACTIONS =================

def action_emergency_report():
    """Submit emergency distress report with AI classification & trust triage."""
    print_section("1. Emergency SOS Report (AI Extraction & Trust Scoring)")
    print(dim("Submit plain-text distress from citizens or relief camps."))
    print(dim("Example: '200 people at flood relief camp in Wayanad need cooked meals urgently'\n"))

    default_text = "200 people at flood relief camp in Wayanad need cooked meals urgently"
    text = prompt_str("Distress Description", default=default_text)
    if not text:
        print(red("❌ Description is required."))
        pause()
        return

    location = prompt_str("Location / Landmark", default="Wayanad")
    phone = prompt_str("Reporter Phone (10 digits)", default="9876543210")
    reporter = prompt_str("Reporter Name", default="Disaster Ground Coordinator")

    payload = {
        "description": text,
        "location_text": location,
        "reporter_name": reporter,
        "reporter_phone": phone,
        "lat": 11.6854,
        "lng": 76.1320,
    }

    print("\n⏳ " + cyan("Routing to SETU AI Engine & Groq/Gemini Pipeline..."))
    res = safe_request("POST", "/need/report", payload, auth=False)

    if not res["ok"]:
        print(red(f"❌ Submission Failed (HTTP {res['status_code']}): {res['error']}"))
        pause()
        return

    data = res["data"]
    need_id = data.get("id") or data.get("need_id")
    session_state["last_need_id"] = need_id

    print("\n" + green(bold("✅ EMERGENCY REPORT SUCCESSFULLY INGESTED & PERSISTED!")))
    print(f"  • {bold('Need ID:')}          {cyan(str(need_id))}")
    print(f"  • {bold('Extracted Resource:')} {data.get('resource_type', 'N/A')}")
    print(f"  • {bold('Required Quantity:')}  {data.get('required_quantity', 'N/A')} {data.get('unit', 'units')}")
    print(f"  • {bold('Urgency / Severity:')} {data.get('urgency', 'medium').upper()} / {data.get('severity', 'medium').upper()}")
    print(f"  • {bold('Location:')}          {data.get('location_text', 'N/A')} ({data.get('lat')}, {data.get('lng')})")
    print(f"  • {bold('AI Extraction Source:')} {green(data.get('extraction_source', 'N/A'))}")
    print(f"  • {bold('Trust Score:')}       {data.get('trust_score', 'N/A')} / 100")
    print(f"  • {bold('Triage Action:')}     {yellow(data.get('dispatch_action', 'N/A'))} (Status: {data.get('status', 'N/A')})")

    if data.get("reasons"):
        print(f"  • {dim('Trust Reasons:')}     {', '.join(data.get('reasons'))}")

    print(f"\n💡 {dim('Next Step: Use Option 2 to allocate NGO inventory and dispatch a volunteer.')}")
    pause()

def action_coordinate_need():
    """Run Target Demo: Multi-NGO inventory allocation & volunteer dispatch."""
    print_section("2. Coordinate Need: Multi-NGO Allocation & Volunteer Dispatch")
    print(dim("Executes target demonstration: allocates inventory across multiple NGOs"))
    print(dim("(e.g., 200 meals = 120 from NGO A + 80 from NGO B) and assigns verified volunteer.\n"))

    need_id = prompt_str("Need ID to Coordinate", default=session_state["last_need_id"])
    if not need_id:
        print(red("❌ Need ID is required."))
        pause()
        return

    print("\n⏳ " + cyan("Computing optimal NGO allocations & Haversine volunteer scoring..."))
    res = safe_request("POST", f"/match/coordinate/{need_id}", auth=True)

    if not res["ok"]:
        print(red(f"❌ Coordination Failed (HTTP {res['status_code']}): {res['error']}"))
        pause()
        return

    data = res["data"]
    print("\n" + green(bold("✅ NEED COORDINATION COMPLETED!")))
    print(f"  • {bold('Coordination Status:')}  {green(data.get('status', 'coordinated'))}")
    print(f"  • {bold('Required Quantity:')}    {data.get('required_quantity', 0)}")
    print(f"  • {bold('Fulfilled Quantity:')}   {green(str(data.get('fulfilled_quantity', 0)))}")
    print(f"  • {bold('Remaining Shortfall:')}  {data.get('remaining_shortfall', 0)}")
    print(f"  • {bold('Updated Need Status:')}  {data.get('need_status', 'assigned')}")

    allocations = data.get("ngo_allocations", [])
    if allocations:
        print(yellow(bold("\n📦 NGO Stock Allocations Breakdown:")))
        for a in allocations:
            ngo_name = a.get("ngo_name") or a.get("ngo_id", "Unknown NGO")
            qty = a.get("allocated_quantity", 0)
            res_type = a.get("resource_type", "supplies")
            print(f"   • {green(str(ngo_name))}: {bold(str(qty))} {res_type} (Reserved in database)")
    else:
        print(yellow("   (No NGO inventory matched or stock was insufficient)"))

    vol = data.get("assigned_volunteer")
    if vol and vol.get("volunteer_id"):
        asgn_id = vol.get("assignment_id")
        if asgn_id:
            session_state["last_assignment_id"] = asgn_id
        print(cyan(bold("\n🚚 Assigned Last-Mile Volunteer:")))
        print(f"   • {bold('Name:')}           {vol.get('name', 'Volunteer')}")
        print(f"   • {bold('Volunteer ID:')}   {vol.get('volunteer_id')}")
        print(f"   • {bold('Tier-1 Verified:')}{green('Yes') if vol.get('ngo_verified') else yellow('Community Tier-2')}")
        print(f"   • {bold('Assignment ID:')}  {cyan(str(asgn_id))}")
        print(f"\n💡 {dim('Next Step: Use Option 4 to resolve this assignment when delivery is completed.')}")
    else:
        print(yellow("\n⚠️ No volunteer assigned (None available or nearby within 50km)."))

    pause()

def action_manage_inventory():
    """View and update NGO stock capacity."""
    print_section("3. NGO Stock & Inventory Management")

    default_ngo = session_state.get("last_ngo_id")
    available_ngos = []

    # If no NGO stored in session, fetch registered NGOs to guide the user
    if not default_ngo:
        list_res = safe_request("GET", "/ngos", auth=False)
        if list_res["ok"] and isinstance(list_res["data"], list) and list_res["data"]:
            available_ngos = list_res["data"]
            print(bold("Registered NGOs in system:"))
            for idx, ngo in enumerate(available_ngos[:5], 1):
                print(f"  [{idx}] {ngo.get('ngo_name', 'NGO')} (ID: {cyan(ngo.get('id', ''))})")
            default_ngo = available_ngos[0].get("id")
            print()

    ngo_id_input = prompt_str("NGO ID or List Number [1-N]", default=default_ngo)
    if not ngo_id_input:
        print(red("❌ NGO ID is required."))
        pause()
        return

    # Map number index to NGO ID if user selected from the printed list
    if available_ngos and ngo_id_input.isdigit():
        idx = int(ngo_id_input)
        if 1 <= idx <= len(available_ngos):
            ngo_id = available_ngos[idx - 1].get("id")
            print(f"👉 Selected NGO: {bold(available_ngos[idx - 1].get('ngo_name', ''))} ({cyan(ngo_id)})")
        else:
            ngo_id = ngo_id_input
    else:
        ngo_id = ngo_id_input

    print("\nFetching current inventory for NGO:", cyan(ngo_id))
    res = safe_request("GET", f"/ngos/{ngo_id}/inventory", auth=True)
    if not res["ok"]:
        print(red(f"❌ Could not load inventory: {res['error']}"))
        if res.get("status_code") == 404:
            print(yellow(f"NGO '{ngo_id}' does not exist in the database. Use Option 5 to onboard a new NGO."))
            pause()
            return
    else:
        session_state["last_ngo_id"] = ngo_id
        inv = res["data"].get("inventory", [])
        if inv:
            print(bold("\nCurrent Warehouse Stock:"))
            print(f"{'Resource':<15} {'Total':<10} {'Reserved':<10} {'Available':<10} {'Unit':<10}")
            print("-" * 55)
            for item in inv:
                print(f"{item.get('resource_type', ''):<15} {item.get('total_quantity', 0):<10} {item.get('reserved_quantity', 0):<10} {green(str(item.get('available_quantity', 0))):<10} {item.get('unit', 'units'):<10}")
        else:
            print(yellow("No inventory records found for this NGO."))

    print("\n" + bold("Update Stock Capacity:"))
    print("1. Update Food / Meals")
    print("2. Update Clean Water")
    print("3. Update Medical Supplies")
    print("4. Update Shelter Kits")
    print("5. Custom Resource")
    print("0. Cancel")

    ch = prompt_str("Select choice", default="1")
    res_map = {"1": "food", "2": "water", "3": "medical", "4": "shelter"}
    default_units = {
        "food": "meals",
        "meals": "meals",
        "water": "liters",
        "medical": "kits",
        "shelter": "kits"
    }

    if ch == "0":
        return
    res_type = res_map.get(ch) or prompt_str("Enter resource name (e.g. food)")
    if not res_type:
        return

    qty = prompt_int(f"Total {res_type} quantity to set", default=250)
    if qty is None:
        return

    unit_default = default_units.get(res_type.strip().lower(), "units")
    unit = prompt_str(f"Unit for {res_type} (e.g. {unit_default})", default=unit_default)

    payload = {"resource_type": res_type, "total_quantity": qty, "unit": unit}
    up_res = safe_request("POST", f"/ngos/{ngo_id}/inventory", payload, auth=True)

    if up_res["ok"]:
        session_state["last_ngo_id"] = ngo_id
        print(green(f"\n✅ Inventory for '{res_type}' updated successfully to {qty} {unit}!"))

        # Immediate read-back verification
        readback = safe_request("GET", f"/ngos/{ngo_id}/inventory", auth=True)
        if readback["ok"]:
            inv = readback["data"].get("inventory", [])
            print(bold("\nVerified Warehouse Stock (Read-back):"))
            print(f"{'Resource':<15} {'Total':<10} {'Reserved':<10} {'Available':<10} {'Unit':<10}")
            print("-" * 55)
            for item in inv:
                print(f"{item.get('resource_type', ''):<15} {item.get('total_quantity', 0):<10} {item.get('reserved_quantity', 0):<10} {green(str(item.get('available_quantity', 0))):<10} {item.get('unit', 'units'):<10}")
    else:
        print(red(f"❌ Inventory Update Failed: {up_res['error']}"))

    pause()

def action_resolve_assignment():
    """Resolve an assignment and restore volunteer capacity."""
    print_section("4. Resolve Assignment (Delivery Handover & Case Closure)")

    asgn_id = prompt_str("Assignment ID to Resolve", default=session_state["last_assignment_id"])
    if not asgn_id:
        print(red("❌ Assignment ID is required."))
        pause()
        return

    notes = prompt_str("Resolution / Handover Notes", default="Relief supplies successfully delivered on site.")

    print("\n⏳ " + cyan("Closing assignment and updating volunteer availability..."))
    res = safe_request("PATCH", f"/assignments/{asgn_id}/resolve", {"notes": notes}, auth=True)

    if res["ok"]:
        print(green(bold("\n✅ ASSIGNMENT SUCCESSFULLY RESOLVED!")))
        print(f"  • {bold('Assignment ID:')} {asgn_id}")
        print(f"  • {bold('Status:')}        {green('resolved')}")
        print(f"  • {bold('Result:')}        {res['data'].get('message', 'Case closed.')}")
        print(f"  • {bold('Capacity:')}      Volunteer active assignments decremented; capacity restored.")
    else:
        print(red(f"❌ Resolution Failed (HTTP {res['status_code']}): {res['error']}"))

    pause()

def action_register_ngo():
    """Register a new relief organization."""
    print_section("5. Onboard New Relief NGO")

    name = prompt_str("NGO Name", default="Wayanad Emergency Relief Hub")
    loc = prompt_str("Headquarters Location", default="Wayanad Central Relief Hub, Meppadi Road")
    email = prompt_str("Contact Email", default=f"ngo_{os.urandom(3).hex()}@setu.org")
    phone = prompt_str("Contact Phone", default="+91 4936 200111")
    radius = prompt_float("Coverage Radius in km", default=50.0)

    payload = {
        "ngo_name": name,
        "name": name,
        "location": loc,
        "email": email,
        "phone": phone,
        "radius": radius or 50.0,
        "lat": 11.6854,
        "lng": 76.1320,
    }

    res = safe_request("POST", "/ngo/register", payload, auth=False)
    if res["ok"]:
        ngo_id = res["data"].get("id") or res["data"].get("ngo_id")
        session_state["last_ngo_id"] = ngo_id
        print(green(bold("\n✅ NGO REGISTERED SUCCESSFULLY!")))
        print(f"  • {bold('NGO ID:')}   {cyan(str(ngo_id))}")
        print(f"  • {bold('Name:')}     {name}")
        print(f"  • {bold('Location:')} {loc}")
        print(f"\n💡 {dim('Next Step: Use Option 3 to stock initial warehouse inventory for this NGO.')}")
    else:
        print(red(f"❌ Registration Failed: {res['error']}"))

    pause()

def action_volunteer_onboarding():
    """Register volunteer and manage availability."""
    print_section("6. Volunteer Management & Availability")
    print("1. Register New Volunteer")
    print("2. Toggle Volunteer On-Duty / Off-Duty Availability")
    print("0. Back")

    ch = prompt_str("Select choice", default="1")
    if ch == "1":
        name = prompt_str("Volunteer Name", default="Rahul Sharma")
        email = prompt_str("Email Address", default=f"vol_{os.urandom(3).hex()}@responder.setu.in")
        pwd = getpass("Password [default: Responder!2026]: ") or "Responder!2026"
        phone = prompt_str("Phone Number", default="+91 98765 43210")
        loc = prompt_str("Base Location", default="Wayanad")
        skills_raw = prompt_str("Skills (comma-separated)", default="food, first_aid, driving, logistics")

        skills = [s.strip().lower() for s in skills_raw.split(",") if s.strip()]
        payload = {
            "name": name,
            "email": email,
            "password": pwd,
            "phone": phone,
            "location": loc,
            "skills": skills,
            "lat": 11.6854,
            "lng": 76.1320
        }

        res = safe_request("POST", "/auth/register", payload, auth=False)
        if res["ok"]:
            vol_id = res["data"].get("volunteer_id") or res["data"].get("id")
            print(green(bold("\n✅ VOLUNTEER REGISTERED!")))
            print(f"  • {bold('Volunteer ID:')} {cyan(str(vol_id))}")
            print(f"  • {bold('Name:')}         {name}")
            print(f"  • {bold('Skills:')}       {', '.join(skills)}")
        else:
            print(red(f"❌ Registration Failed: {res['error']}"))

    elif ch == "2":
        vol_id = prompt_str("Volunteer ID", default=session_state["user_id"])
        if not vol_id or vol_id == "system":
            vol_id = prompt_str("Enter Volunteer ID")
        if not vol_id:
            return
        status_raw = prompt_str("Set duty status (on/off)", default="on").lower()
        avail = True if status_raw in ["on", "true", "1", "available"] else False

        res = safe_request("PATCH", f"/volunteers/{vol_id}/availability", {"available": avail}, auth=True)
        if res["ok"]:
            print(green(f"\n✅ Duty status for volunteer {vol_id} set to: {'ON-DUTY (Available)' if avail else 'OFF-DUTY (Unavailable)'}"))
        else:
            print(red(f"❌ Status update failed: {res['error']}"))

    pause()

def action_view_active_needs():
    """List open and assigned emergency needs."""
    print_section("7. Active Emergency Needs & Triage Feed")

    res = safe_request("GET", "/needs", auth=True)
    if not res["ok"]:
        res = safe_request("GET", "/need", auth=True)

    if not res["ok"]:
        print(red(f"❌ Could not retrieve needs: {res['error']}"))
        pause()
        return

    needs = res["data"]
    if isinstance(needs, dict) and "data" in needs:
        needs = needs["data"]

    if not needs or not isinstance(needs, list):
        print(yellow("No emergency needs currently reported."))
        pause()
        return

    print(bold(f"Active Reports ({len(needs)} total):\n"))
    print(f"{'ID':<12} {'Resource':<10} {'Quantity':<10} {'Status':<18} {'Urgency':<10} {'Location':<20}")
    print("-" * 82)
    for n in needs[:15]:
        n_id = str(n.get("id", ""))[:10]
        res_t = str(n.get("resource_type", n.get("category", "food")))[:10]
        qty = str(n.get("required_quantity", "N/A"))[:10]
        stat = str(n.get("status", "open"))[:18]
        urg = str(n.get("urgency", "medium"))[:10]
        loc = str(n.get("location_text", ""))[:20]
        status_colored = green(stat) if stat == "resolved" else (yellow(stat) if "review" in stat else red(stat))
        print(f"{n_id:<12} {res_t:<10} {qty:<10} {status_colored:<27} {urg:<10} {loc:<20}")

    if len(needs) > 15:
        print(dim(f"... and {len(needs) - 15} more reports."))

    pause()

def action_run_golden_demo():
    """Execute the full 7-step automated MVP workflow demonstration."""
    print_section("8. Run Automated 7-Step Golden-Path Demo")
    print(dim("Runs end-to-end simulation of all 7 SETU capabilities.\n"))

    from demo_runner import run_demo
    try:
        run_demo(base_url=BASE_URL, secret_token=session_state["token"])
    except Exception as e:
        print(red(f"❌ Demo execution error: {e}"))

    pause()

def action_auth_session():
    """Login, inspect session token, or logout."""
    print_section("9. Authentication & Session Manager")
    print(f"Current Identity: {bold(cyan(session_state['role'].upper()))} ({session_state['user_email'] or 'System'})")
    print(f"Active Auth Mode: {'JWT Token' if session_state['is_jwt'] else 'System SECRET_TOKEN'}\n")

    print("1. Login as Volunteer (Password)")
    print("2. Login via Passwordless Email OTP")
    print("3. Reset to System Administrator (SECRET_TOKEN)")
    print("0. Back")

    ch = prompt_str("Select choice", default="1")
    if ch == "1":
        email = prompt_str("Email")
        pwd = getpass("Password: ")
        res = safe_request("POST", "/auth/login", {"email": email, "password": pwd}, auth=False)
        if res["ok"] and "token" in res["data"]:
            session_state["token"] = res["data"]["token"]
            session_state["role"] = "volunteer"
            session_state["user_email"] = email
            session_state["user_id"] = res["data"].get("volunteer_id")
            session_state["is_jwt"] = True
            print(green(bold(f"\n✅ Logged in as Volunteer ({email})!")))
        else:
            print(red(f"❌ Login Failed: {res['error']}"))

    elif ch == "2":
        email = prompt_str("Email address for OTP")
        req_res = safe_request("POST", "/auth/send-otp", {"email": email}, auth=False)
        if not req_res["ok"]:
            print(red(f"❌ Failed to send OTP: {req_res['error']}"))
        else:
            print(green(f"📧 OTP sent to {email}. Check your inbox."))
            otp = prompt_str("Enter 6-digit OTP")
            v_res = safe_request("POST", "/auth/verify-otp", {"email": email, "otp": otp}, auth=False)
            if v_res["ok"] and "token" in v_res["data"]:
                session_state["token"] = v_res["data"]["token"]
                session_state["role"] = v_res["data"].get("role", "volunteer")
                session_state["user_email"] = email
                session_state["user_id"] = v_res["data"].get("volunteer_id") or v_res["data"].get("ngo_id")
                session_state["is_jwt"] = True
                print(green(bold(f"\n✅ Verified and logged in as {session_state['role']}!")))
            else:
                print(red(f"❌ Verification Failed: {v_res['error']}"))

    elif ch == "3":
        session_state["token"] = INITIAL_SECRET_TOKEN
        session_state["role"] = "system" if INITIAL_SECRET_TOKEN else "unauthenticated"
        session_state["user_email"] = "system@setu.local" if INITIAL_SECRET_TOKEN else None
        session_state["user_id"] = "system" if INITIAL_SECRET_TOKEN else None
        session_state["is_jwt"] = False
        print(green("\n✅ Session reset to System Administrator mode."))

    pause()

def action_bulk_upload_volunteers():
    """Upload volunteers from a CSV file."""
    print_section("10. Bulk Volunteer Import (CSV)")
    file_path = prompt_str("CSV file path (e.g. data/volunteers.csv)")
    if not file_path:
        return

    if not os.path.exists(file_path):
        print(red(f"❌ File not found: {file_path}"))
        pause()
        return

    ngo_id = prompt_str("Affiliated NGO ID (optional)", default=session_state["last_ngo_id"])

    try:
        with open(file_path, newline='', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            success = failed = 0
            for row in reader:
                raw_skills = row.get("skills") or row.get("Skills") or ""
                skills_list = [s.strip().lower() for s in raw_skills.split(",") if s.strip()]
                payload = {
                    "name": row.get("name") or row.get("Name") or "Responder",
                    "phone": str(row.get("phone") or row.get("Phone") or "0000000000"),
                    "location": row.get("location") or row.get("Location") or "India",
                    "skills": skills_list or ["general"],
                    "email": row.get("email") or f"vol_{os.urandom(4).hex()}@setu.internal",
                    "password": "BulkUpload!2026",
                    "ngo_id": ngo_id or None,
                    "lat": float(row.get("lat") or 0.0),
                    "lng": float(row.get("lng") or 0.0)
                }
                res = safe_request("POST", "/volunteer", payload, auth=True)
                if res["ok"]:
                    success += 1
                else:
                    failed += 1
                    print(yellow(f"  ⚠️ Skipped {payload['name']}: {res['error']}"))

            print(green(bold(f"\n✅ Import completed: {success} succeeded, {failed} failed.")))
    except Exception as e:
        print(red(f"❌ Error processing CSV: {e}"))

    pause()

def action_health():
    """Display comprehensive diagnostics."""
    print_section("11. System Health & Diagnostics")

    print(f"Target Server: {bold(BASE_URL)} [{dim('Source: ' + URL_SOURCE)}]")
    h_res = safe_request("GET", "/health", auth=False)
    if h_res["ok"]:
        db_stat = h_res["data"].get("database", "unknown")
        db_color = green(db_stat) if db_stat in ["connected", "ok"] else red(db_stat)
        print(f"  • {bold('Backend API Status:')}  {green('ONLINE & REACHABLE')}")
        print(f"  • {bold('Database Connection:')} {db_color}")
    else:
        print(f"  • {bold('Backend API Status:')}  {red('OFFLINE')}: {h_res['error']}")

    c_res = safe_request("GET", "/config/public", auth=False)
    if c_res["ok"]:
        data = c_res["data"]
        print(f"  • {bold('Primary Geocoder:')}   {cyan(data.get('primary_geocoder', 'openstreetmap'))}")
        has_gmaps = "Configured" if data.get("google_maps_api_key") else "Unconfigured (OpenStreetMap Active)"
        print(f"  • {bold('Google Maps Key:')}    {dim(has_gmaps)}")

    s_res = safe_request("GET", "/stats", auth=False)
    if s_res["ok"]:
        stats = s_res["data"]
        print(bold("\nPlatform Metrics:"))
        print(f"  • Total Registered NGOs:       {stats.get('total_ngos', 0)}")
        print(f"  • Verified Volunteers:         {stats.get('verified_volunteers', 0)}")
        print(f"  • Total Emergency Needs:       {stats.get('total_reports', 0)}")
        print(f"  • Resolved Cases:              {stats.get('resolved_reports', 0)}")

    pause()

def action_switch_server():
    """Allows operator to switch active target backend URL interactively."""
    global BASE_URL, URL_SOURCE
    print_section("12. Switch Target Server URL")
    print(f"Current Target Server: {bold(BASE_URL)} [{dim('Source: ' + URL_SOURCE)}]\n")
    print("1. Local Backend Port 8000 (http://127.0.0.1:8000) [Default Local]")
    print("2. Local Backend Port 8080 (http://127.0.0.1:8080)")
    print("3. Cloud Run Service (https://setu-api-949977701091.asia-south1.run.app)")
    print("4. Custom URL")
    print("0. Back")

    ch = prompt_str("Select target server", default="1")
    if ch == "1":
        BASE_URL = "http://127.0.0.1:8000"
        URL_SOURCE = "interactive (127.0.0.1:8000)"
    elif ch == "2":
        BASE_URL = "http://127.0.0.1:8080"
        URL_SOURCE = "interactive (127.0.0.1:8080)"
    elif ch == "3":
        BASE_URL = "https://setu-api-949977701091.asia-south1.run.app"
        URL_SOURCE = "interactive (Cloud Run)"
    elif ch == "4":
        custom = prompt_str("Enter custom base URL (e.g. http://192.168.1.50:8000)")
        if custom:
            BASE_URL = normalize_url(custom)
            URL_SOURCE = "interactive (custom)"
        else:
            return
    elif ch == "0":
        return

    print(green(f"\n✅ Active target server switched to: {BASE_URL}"))
    print("Testing connection...")
    st = check_backend_status()
    if st["online"]:
        print(green(f"  • Connection: ONLINE (Database: {st.get('database')})"))
    else:
        print(red(f"  • Connection: OFFLINE ({st.get('error')})"))
    pause()

# ================= MAIN MENU & LOOP =================

def print_banner(status_info: Dict[str, Any]):
    clear_screen()
    if status_info["online"]:
        online_str = green("ONLINE (DB Connected)") if status_info.get("database") == "connected" else yellow(f"ONLINE (DB {status_info.get('database')})")
    else:
        online_str = red("OFFLINE")
        if status_info.get("error"):
            short_err = status_info["error"].split(" — ")[0]
            online_str += f" {dim('(' + short_err[:45] + ')')}"

    role_str = bold(cyan(session_state["role"].upper()))

    print(bold(cyan("╔══════════════════════════════════════════════════════════════════════╗")))
    print(bold(cyan("║")) + bold("   🌍 SETU — AI Autonomous Emergency Relief Coordination Engine    ") + bold(cyan("║")))
    print(bold(cyan("║")) + dim("   Bharat 4.0 Smart Disaster Management & Multi-NGO Logistics        ") + bold(cyan("║")))
    print(bold(cyan("╚══════════════════════════════════════════════════════════════════════╝")))
    print(f" Target Server: {bold(BASE_URL)} [{dim('Source: ' + URL_SOURCE)}]")
    print(f" Server Status: {online_str}")
    print(f" Session Role:  {role_str} | Identity: {dim(session_state['user_email'] or 'System Master')}")
    if not status_info["online"]:
        print(yellow(f" ⚠️  Target server is currently unreachable or returning errors."))
        print(dim(f"    • To override via env: $env:SETU_API_URL=\"http://127.0.0.1:8000\""))
        print(dim(f"    • Or select Option 12 below to switch target server immediately."))
    print("─" * 70)

def main():
    while True:
        status_info = check_backend_status()
        print_banner(status_info)

        print(bold("CORE EMERGENCY WORKFLOWS:"))
        print(f" {bold('1.')} Ingest Emergency SOS Report {dim('(AI Extraction + Trust Triage)')}")
        print(f" {bold('2.')} Coordinate Need {dim('(Multi-NGO Stock Allocation & Volunteer Dispatch)')}")
        print(f" {bold('3.')} Manage NGO Warehouse Inventory {dim('(View Stock & Capacity)')}")
        print(f" {bold('4.')} Resolve Assignment {dim('(Handover Delivery & Replenish Capacity)')}")
        print()
        print(bold("RELIEF LOGISTICS & PROFILES:"))
        print(f" {bold('5.')} Onboard New Relief NGO {dim('(Registration & Coverage Radius)')}")
        print(f" {bold('6.')} Volunteer Onboarding & Duty Toggle {dim('(Skills, Verification)')}")
        print(f" {bold('7.')} View Active Emergency Needs {dim('(Operational Triage Feed)')}")
        print()
        print(bold("AUTOMATION & DIAGNOSTICS:"))
        print(f" {bold('8.')} Run Automated 7-Step Golden Path Demo {dim('(Full Coordination Loop)')}")
        print(f" {bold('9.')} Session & Authentication Manager {dim('(Volunteer / NGO Login)')}")
        print(f" {bold('10.')} Bulk Import Volunteers from CSV")
        print(f" {bold('11.')} System Health & Platform Diagnostics")
        print(f" {bold('12.')} Switch Target Server URL {dim('(Localhost / Cloud Run / Custom)')}")
        print()
        print(f" {bold('0.')} Exit")
        print("─" * 70)

        try:
            choice = safe_input(bold("Select Option [0-12]: "))
        except KeyboardInterrupt:
            print("\n👋 " + yellow("Exiting SETU CLI. Stay safe!\n"))
            break

        if choice == "1":
            action_emergency_report()
        elif choice == "2":
            action_coordinate_need()
        elif choice == "3":
            action_manage_inventory()
        elif choice == "4":
            action_resolve_assignment()
        elif choice == "5":
            action_register_ngo()
        elif choice == "6":
            action_volunteer_onboarding()
        elif choice == "7":
            action_view_active_needs()
        elif choice == "8":
            action_run_golden_demo()
        elif choice == "9":
            action_auth_session()
        elif choice == "10":
            action_bulk_upload_volunteers()
        elif choice == "11":
            action_health()
        elif choice == "12":
            action_switch_server()
        elif choice in ["0", "exit", "quit", "q"]:
            print("\n👋 " + yellow("Exiting SETU CLI. Stay safe!\n"))
            break
        else:
            if choice:
                print(red("❌ Invalid choice. Please select an option between 0 and 12."))
                pause()

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n👋 " + yellow("Exiting SETU CLI. Stay safe!\n"))
        sys.exit(0)