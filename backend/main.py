import sys
import io
import os
import traceback

# Force UTF-8 stdout/stderr on Windows to prevent UnicodeEncodeError with emojis
if sys.platform == "win32" and type(sys.stdout).__name__ == "TextIOWrapper":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
if sys.platform == "win32" and type(sys.stderr).__name__ == "TextIOWrapper":
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

from typing import List, Dict, Optional
import jwt
from fastapi import (
    FastAPI, Request, BackgroundTasks, WebSocket, WebSocketDisconnect, Query, status, Depends, HTTPException
)
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from dotenv import load_dotenv
from backend.auth import JWT_SECRET, JWT_ALGORITHM, SECRET_TOKEN, verify_token, optional_verify_token
from backend.config import settings

# Routers
from backend.routes.need import router as need_router, process_and_save_need
from backend.models import NeedInput
from backend.routes.volunteer import router as volunteer_router
from backend.routes.volunteer_auth import router as volunteer_auth_router
from backend.routes.match import router as match_router
from backend.routes.dashboard import router as dashboard_router
from backend.routes.assignment import router as assignment_router
from backend.routes.ngo import router as ngo_router
from backend.routes.stats import router as stats_router

# Helpers
from database.volunteers_db import save_volunteer
from database.geocoding import get_coordinates
from database.ngos_db import get_ngo

load_dotenv(dotenv_path="config/.env")


# 🔌 WebSocket Manager
class WebSocketManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast_json(self, data: dict):
        stale_connections = []
        for connection in self.active_connections:
            try:
                await connection.send_json(data)
            except Exception:
                stale_connections.append(connection)
        for stale in stale_connections:
            self.disconnect(stale)


manager = WebSocketManager()
app = FastAPI()

# 🔒 Rate limiter
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# 🔥 CORS Configuration
cors_origins = (
    settings.allowed_origins
    if isinstance(settings.allowed_origins, list) and settings.allowed_origins
    else ["http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:3000", "http://127.0.0.1:5173"]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# 🔌 WebSocket endpoint (uses canonical verify_token from auth.py)
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: Optional[str] = Query(None)):
    user = None
    if token:
        try:
            creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
            user = verify_token(creds)
        except HTTPException:
            user = None
        except Exception:
            user = None

    if not user:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Unauthorized")
        return

    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)


# 🏠 Health Checks
from fastapi.responses import FileResponse


@app.get("/")
def home(request: Request):
    if "text/html" in request.headers.get("accept", ""):
        if os.path.exists("frontendnew/landing.html"):
            return FileResponse("frontendnew/landing.html")
    return {"message": "Setu Backend Active", "env": "Cloud Run"}


@app.get("/health")
def health():
    db_url = os.getenv("SUPABASE_DB_URL")
    if not db_url:
        return {"status": "ok", "database": "unconfigured"}
    try:
        from database.postgres_client import get_db_cursor
        with get_db_cursor(commit=False, dict_cursor=False) as cur:
            cur.execute("SELECT 1")
        return {"status": "ok", "database": "connected"}
    except Exception as e:
        return {"status": "degraded", "database": "disconnected", "error": str(e)}


@app.get("/config/public")
def public_config():
    google_maps_api_key = (
        os.getenv("GOOGLE_MAPS_KEY", "").strip()
        or os.getenv("GOOGLE_MAPS_API_KEY", "").strip()
    )
    return {
        "google_maps_api_key": google_maps_api_key or None,
        "primary_geocoder": "openstreetmap" if not google_maps_api_key else "googlemaps"
    }


# 🔗 NEED WEBHOOK
@app.post("/webhook")
@limiter.limit("5/minute")
async def webhook(request: Request, payload: Dict, background_tasks: BackgroundTasks):
    try:
        print(f"📥 RAW Need Webhook payload: {payload}", flush=True)
        
        def safe_float(val):
            try:
                if val is None or str(val).strip() == "":
                    return 0.0
                return float(val)
            except (ValueError, TypeError):
                return 0.0

        loc_val = (
            payload.get("location_text")
            or payload.get("location")
            or payload.get("address")
            or payload.get("help_needed")
            or "Unknown Location"
        )
        full_desc = f"Report: {payload.get('description', '')} | Details: {payload.get('location') or payload.get('location_text') or payload.get('address') or ''} | Help: {payload.get('help_needed', '')}"

        mapped_data = {
            "reporter_name": payload.get("reporter_name") or payload.get("name") or "Unknown",
            "reporter_phone": payload.get("reporter_phone") or payload.get("phone") or "0000000000",
            "description": full_desc,
            "location_text": loc_val,
            "lat": safe_float(payload.get("lat") or payload.get("Latitude") or payload.get("latitude")),
            "lng": safe_float(payload.get("lng") or payload.get("Longitude") or payload.get("longitude")),
            "disaster_type": payload.get("disaster_type", "Not Specified"),
            "help_needed": payload.get("help_needed", "Not Specified"),
        }
        need_input = NeedInput(**mapped_data)
        print("🚀 Routing to AI Engine...", flush=True)
        result = process_and_save_need(need_input, background_tasks)
        return {"message": "Webhook processed", "data": result}

    except Exception as e:
        traceback.print_exc()
        return {"error": str(e)}


# 🔗 VOLUNTEER WEBHOOK
@app.post("/volunteer_webhook")
@limiter.limit("5/minute")
async def webhook_ngo_register_alias(request: Request, payload: Dict, background_tasks: BackgroundTasks):
    try:
        mapped_volunteer = {
            "name": payload.get("volunteer_name", "Unknown"),
            "email": payload.get("email", "no-email@setu.com"),
            "phone": payload.get("phone", "0000000000"),
            "skills": (
                [skill.strip().lower() for skill in payload.get("skills", "").split(",")]
                if payload.get("skills")
                else []
            ),
            "location": payload.get("location", ""),
            "ngo_id": payload.get("ngo_id", None),
            "available": True,
            "active_assignments": 0,
            "ngo_verified": False
        }

        print(f"📥 Incoming Volunteer: {mapped_volunteer['email']}", flush=True)

        doc_id = save_volunteer(mapped_volunteer)

        broadcast_volunteer = {
            "name": mapped_volunteer.get("name", "Volunteer"),
            "skills": mapped_volunteer.get("skills", []),
            "location": mapped_volunteer.get("location", ""),
            "available": mapped_volunteer.get("available", True),
            "ngo_verified": mapped_volunteer.get("ngo_verified", False)
        }
        await manager.broadcast_json({
            "type": "NEW_VOLUNTEER",
            "data": broadcast_volunteer
        })

        return {"message": "Volunteer registered", "id": doc_id, "volunteer_id": doc_id, "status": "registered"}

    except Exception as e:
        traceback.print_exc()
        return {"error": str(e)}


# 📦 Include all specialized routers
app.include_router(need_router)
app.include_router(volunteer_router)
app.include_router(volunteer_auth_router, prefix="/auth")
app.include_router(match_router)
app.include_router(dashboard_router)
app.include_router(assignment_router)
app.include_router(ngo_router)
app.include_router(stats_router)


# 🌐 Plural REST Aliases (with auth enforcement matching primary routes)
@app.get("/needs")
def list_needs_alias(token: Optional[dict] = Depends(optional_verify_token)):
    from backend.routes.need import list_needs
    return list_needs(token=token)


@app.get("/needs/{need_id}")
def get_single_need_alias(need_id: str, token: Optional[dict] = Depends(optional_verify_token)):
    from backend.routes.need import get_single_need
    return get_single_need(need_id, token=token)


@app.post("/needs")
def report_need_alias(data: NeedInput, background_tasks: BackgroundTasks, token: dict = Depends(verify_token)):
    from backend.routes.need import process_and_save_need
    return process_and_save_need(data, background_tasks)


@app.get("/ngos")
def list_ngos_alias():
    from backend.routes.ngo import list_ngos
    res = list_ngos()
    return res.get("data", []) if isinstance(res, dict) and "data" in res else res


@app.get("/ngos/{ngo_id}")
def get_ngo_alias(ngo_id: str, token: Optional[dict] = Depends(optional_verify_token)):
    from backend.routes.ngo import get_ngo_details
    return get_ngo_details(ngo_id, token)


@app.get("/ngos/{ngo_id}/inventory")
def get_ngo_inventory_alias(ngo_id: str, token: dict = Depends(verify_token)):
    from backend.routes.ngo import get_ngo_inventory_endpoint
    return get_ngo_inventory_endpoint(ngo_id, token)


@app.post("/ngos/{ngo_id}/inventory")
@app.patch("/ngos/{ngo_id}/inventory")
def set_ngo_inventory_alias(ngo_id: str, payload: dict, token: dict = Depends(verify_token)):
    from backend.routes.ngo import set_ngo_inventory_endpoint
    from backend.models import NGOInventoryInput
    res_type = payload.get("resource_type") or payload.get("need_type") or "food"
    qty = payload.get("total_quantity") if "total_quantity" in payload else payload.get("quantity", 0)
    unit = payload.get("unit") or "units"
    return set_ngo_inventory_endpoint(ngo_id, NGOInventoryInput(resource_type=res_type, total_quantity=int(qty), unit=unit), token=token)


@app.get("/ngos/{ngo_id}/dispatches")
def get_ngo_dispatches_alias(ngo_id: str, token: dict = Depends(verify_token)):
    from backend.routes.ngo import get_ngo_dispatches
    return get_ngo_dispatches(ngo_id, token=token)


@app.get("/ngos/{ngo_id}/needs")
def get_ngo_needs_alias(ngo_id: str, token: dict = Depends(verify_token)):
    from backend.routes.ngo import get_ngo_needs
    return get_ngo_needs(ngo_id, token=token)


@app.get("/assignments")
@app.get("/assignments/active")
def get_assignments_alias(token: dict = Depends(verify_token)):
    from backend.routes.assignment import get_active_assignments
    return get_active_assignments(token=token)


@app.post("/assignments/{assignment_id}/accept")
def accept_assignment_alias(assignment_id: str, payload: Optional[dict] = None, token: dict = Depends(verify_token)):
    from backend.routes.assignment import accept_assignment_endpoint
    return accept_assignment_endpoint(assignment_id, payload, token=token)


@app.patch("/assignments/{assignment_id}/progress")
def update_assignment_progress_alias(assignment_id: str, payload: Optional[dict] = None, token: dict = Depends(verify_token)):
    from backend.routes.assignment import update_assignment_progress_endpoint
    return update_assignment_progress_endpoint(assignment_id, payload, token=token)


@app.patch("/assignments/{assignment_id}/dispatch")
def confirm_dispatch_alias(assignment_id: str, payload: Optional[dict] = None, token: dict = Depends(verify_token)):
    from backend.routes.assignment import confirm_dispatch_endpoint
    return confirm_dispatch_endpoint(assignment_id, payload, token=token)


@app.patch("/assignments/{assignment_id}/resolve")
def resolve_assignment_alias(assignment_id: str, token: dict = Depends(verify_token)):
    from backend.routes.assignment import resolve
    return resolve(assignment_id, token=token)


from fastapi.staticfiles import StaticFiles
if os.path.isdir("frontendnew"):
    app.mount("/", StaticFiles(directory="frontendnew", html=True), name="static")