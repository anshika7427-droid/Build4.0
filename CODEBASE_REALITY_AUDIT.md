# SETU — Comprehensive Codebase Reality Audit

**Audit Date:** October 11, 2026  
**Auditor Mode:** Strictly Read-Only Investigation & Static Architecture Verification  
**Repository Working Tree:** Main branch, clean, non-destructive audit  

---

## 1. Executive Summary

This reality audit investigates the complete SETU repository to establish what code is active, what executes in production and test environments, where duplicated or competing implementations exist, which files are dead or obsolete, and how the system behaves end-to-end.

### High-Level System Assessment
- **Overall Operational State:** The core backend business logic, multi-NGO inventory matching, volunteer coordination, and transactional database hardening are implemented, functional, and verified by passing test suites (22/22 unit and integration tests).
- **Architecture Reality:** The repository contains an active FastAPI backend (`backend/main.py`), a Supabase PostgreSQL persistence layer (`database/`), an AI extraction pipeline (`backend/services/ai.py` with Groq primary and Gemini fallback), and a standalone React 19 single-page application (`frontend/`).
- **Core MVP Readiness:** The target hackathon demonstration (ingest plain-text emergency report $\rightarrow$ extract structured need $\rightarrow$ trust validate $\rightarrow$ multi-NGO inventory allocation $\rightarrow$ volunteer assignment $\rightarrow$ assignment resolution) is fully implemented in the backend and verified via `demo_runner_fixed.py` and `tests/test_mvp_golden_path.py`.
- **Key Architectural Liabilities:**
  1. **8 Zero-Byte Stub Files:** Four empty route files in `backend/routes/` and three empty service files in `backend/services/` create confusion about route locations.
  2. **Route Plurality Aliasing:** `backend/main.py` manually redeclares 16 plural route aliases (`/needs`, `/ngos`, `/assignments`) pointing to singular router implementations, rather than using standard router mounting or URL rewrite conventions.
  3. **Duplicate Root Tooling:** Competing scripts exist at the repository root (`cli.py` vs `setu_cli.py`, `demo_runner.py` vs `demo_runner_fixed.py`, `test.py` vs `full_test.py` vs `backend/test.py`).
  4. **Ghost Directory Reference:** `backend/main.py` attempts to mount a static directory named `frontendnew/`, which does not exist in the repository; the real built frontend resides in `frontend/dist/`.
  5. **Docker Dependency Gap:** `Dockerfile` copies `backend/requirements.txt` which is missing `pydantic-settings` (present only in root `requirements.txt`), causing container builds to fail on import of `backend/config.py`.
  6. **Frontend Decoupling:** The React frontend (`frontend/src/`) is fully built with rich dashboards, but defaults to client-side in-memory mock data (`MOCK_STORAGE_KEY`) until the operator explicitly toggles mock mode off or configures `VITE_API_BASE_URL`.

---

## 2. Entry Points & Architecture Map

### Architecture Flow Diagram

```
                     [ External Ingestion Sources ]
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         │                         │                         │
[ Google Forms (.gs) ]   [ Webhook Calls ]       [ React 19 Frontend ]
 (needs_trigger.gs)       (/webhook, /volunteer)   (Landing/Dashboards)
         │                         │                         │
         └─────────────────────────┼─────────────────────────┘
                                   ▼
                    FastAPI Gateway (backend/main.py)
                    ├─ Port: 8000 (Local) / 8080 (Cloud Run)
                    ├─ CORS Middleware (Settings.allowed_origins)
                    ├─ RateLimiter (SlowAPI: 5/min on webhooks)
                    ├─ Enterprise JWT & System Token Security (auth.py)
                    │
         ┌──────────┴──────────────┬─────────────────────────┐
         ▼                         ▼                         ▼
  Need Routing             Matching Engine           NGO & Volunteer
  (/need, /needs)          (/match)                  (/ngo, /volunteer)
         │                         │                         │
         ├─ AI Extraction          ├─ Haversine Distance     ├─ Bcrypt Password
         │  (Groq -> Gemini)       ├─ Multi-NGO Inventory    │  & OTP Flow
         ├─ Trust Scoring          │  Partial Allocation     ├─ Row-level locking
         │  (Deterministic rules)  ├─ Verification Gates     │  on inventory
         └──────────┬──────────────┴─────────────────────────┘
                    │
                    ▼
       Database Layer (database/postgres_client.py)
       ThreadedConnectionPool (min=2, max=20)
       Supabase PostgreSQL (8 Core Tables)
       ├─ otps
       ├─ ngos
       ├─ ngo_inventory
       ├─ volunteers_auth
       ├─ volunteers
       ├─ needs_reports
       ├─ ngo_allocations
       └─ assignments
```

### Primary Entry Points

| Component | Entry File | Runtime Command | Status & Reality |
| :--- | :--- | :--- | :--- |
| **Backend API** | `backend/main.py` | `uvicorn backend.main:app --host 0.0.0.0 --port 8000` | **Active.** Registers 8 routers, 16 plural aliases, 2 webhooks, 1 WebSocket, and health checks. Requires `ENVIRONMENT=development` or a 32+ character `SECRET_TOKEN`. |
| **Frontend App** | `frontend/src/main.jsx` | `npm run dev` (Vite on `http://localhost:5173`) | **Active.** Renders React 19 app with React Router 7 (`App.jsx`), Tailwind CSS, and Leaflet maps. |
| **Console CLI (Modern)**| `setu_cli.py` | `python setu_cli.py` | **Active & Recommended.** Features ANSI dashboard, bearer auth headers, CSV export, and complete API operations. |
| **Console CLI (Legacy)**| `cli.py` | `python cli.py` | **Deprecated / Defective.** Lacks `Authorization` headers; fails on secured endpoints. |
| **Target MVP Demo** | `demo_runner_fixed.py` | `python demo_runner_fixed.py` | **Active & Canonical.** Successfully runs 7-step golden-path coordination in live HTTP or mock mode. |
| **Target MVP Demo (Old)**| `demo_runner.py`| `python demo_runner.py` | **Obsolete / Defective.** Fails in live mode due to premature `need_id` lookup before report creation. |
| **Docker Container** | `Dockerfile` | `docker build -t setu .` | **Broken at build/run.** Copies `backend/requirements.txt` which lacks `pydantic-settings`. |
| **Database Migrations**| `database/init_schema.py`| `python -m database.init_schema` | **Active.** Applies `database/schema.sql` and idempotent `ALTER TABLE` statements. |

### Static File Mount Analysis
In `backend/main.py` lines 126–127 and lines 349–350:
```python
if "text/html" in request.headers.get("accept", ""):
    if os.path.exists("frontendnew/landing.html"):
        return FileResponse("frontendnew/landing.html")
...
if os.path.isdir("frontendnew"):
    app.mount("/", StaticFiles(directory="frontendnew", html=True), name="static")
```
**Static Reality:** `frontendnew` does not exist in the repository. The production built bundle exists in `frontend/dist/`. This block is completely dead in the current repository state.

---

## 3. Categorized File Inventory

The repository contains **101 non-ignored files** (excluding `.git`, `venv`, `node_modules`, and `__pycache__`).

| Category | File Path | Size | Status | Architectural Purpose & Assessment |
| :--- | :--- | :--- | :--- | :--- |
| **Backend Core** | `backend/main.py` | 13,527 B | **Active** | Application root, route registration, middleware, WebSocket, REST aliases. |
| **Backend Core** | `backend/auth.py` | 9,104 B | **Active** | Enterprise JWT generation/verification, constant-time token validation, strict secret entropy enforcement. |
| **Backend Core** | `backend/config.py` | 2,696 B | **Active** | Pydantic `BaseSettings` schema reading environment variables with alias fallbacks. |
| **Backend Core** | `backend/models.py` | 2,764 B | **Active** | Pydantic request and response schemas (`NeedInput`, `VolunteerInput`, `NGOInventoryInput`, etc.). |
| **Backend Core** | `backend/email_utils.py`| 1,563 B | **Active** | SMTP helper for sending OTP verification emails via Gmail. |
| **Backend Routes**| `backend/routes/assignment.py` | 15,600 B | **Active** | Singular assignment routes: fetch, claim, accept, progress, dispatch, resolve. |
| **Backend Routes**| `backend/routes/assignments.py`| 0 B | **Dead / Stub** | Empty zero-byte file; superseded by `assignment.py` and aliases in `main.py`. |
| **Backend Routes**| `backend/routes/dashboard.py` | 6,636 B | **Active** | Admin/coordinator overview routes (`/dashboard`, `/dashboard/reports`). |
| **Backend Routes**| `backend/routes/match.py` | 16,756 B | **Active** | Volunteer heuristic matching (`/match`), multi-NGO inventory allocation (`/match/allocate`), and end-to-end coordination (`/match/coordinate`). |
| **Backend Routes**| `backend/routes/need.py` | 12,486 B | **Active** | Public reporting (`/need/report`), authenticated need persistence (`/need`), trust triage. |
| **Backend Routes**| `backend/routes/needs.py` | 0 B | **Dead / Stub** | Empty zero-byte file; superseded by `need.py` and aliases in `main.py`. |
| **Backend Routes**| `backend/routes/ngo.py` | 12,905 B | **Active** | NGO profile registration, inventory management, dispatch history. |
| **Backend Routes**| `backend/routes/ngos.py` | 0 B | **Dead / Stub** | Empty zero-byte file; superseded by `ngo.py` and aliases in `main.py`. |
| **Backend Routes**| `backend/routes/stats.py` | 180 B | **Active** | Public community metrics endpoint (`/stats`). |
| **Backend Routes**| `backend/routes/volunteer.py` | 9,194 B | **Active** | Operational volunteer CRUD, availability toggle (`/volunteer/status`). |
| **Backend Routes**| `backend/routes/volunteers.py`| 0 B | **Dead / Stub** | Empty zero-byte file; superseded by `volunteer.py` and aliases in `main.py`. |
| **Backend Routes**| `backend/routes/volunteer_auth.py`| 8,681 B | **Active** | Volunteer password registration/login, OTP request and verification. |
| **Backend Services**| `backend/services/ai.py` | 14,112 B | **Active** | Canonical AI extraction engine (Groq llama-3.3-70b $\rightarrow$ Gemini 2.0 Flash $\rightarrow$ regex fallback). |
| **Backend Services**| `backend/services/geocoding.py`| 0 B | **Dead / Stub** | Empty zero-byte file; implementation lives in `database/geocoding.py`. |
| **Backend Services**| `backend/services/match.py` | 0 B | **Dead / Stub** | Empty zero-byte file; implementation lives in `backend/routes/match.py`. |
| **Backend Services**| `backend/services/trust.py` | 0 B | **Dead / Stub** | Empty zero-byte file; implementation lives in `database/verification.py`. |
| **AI Subsystem** | `ai_processing/gemini_processor.py` | 808 B | **Active Wrapper** | Backward compatibility shim delegating to `backend/services/ai.py`. |
| **AI Subsystem** | `ai_processing/prompts.py` | 1,906 B | **Active** | AI prompt templates, schema specifications, and category/urgency enum definitions. |
| **Database** | `database/postgres_client.py` | 6,019 B | **Active** | Threaded PostgreSQL pool manager, connection pooling, and resilient context manager. |
| **Database** | `database/schema.sql` | 5,088 B | **Active Source** | Definitive 8-table DDL schema with constraints, foreign keys, and indexes. |
| **Database** | `database/schema.md` | 4,066 B | **Documentation**| Schema architecture documentation and table relationship descriptions. |
| **Database** | `database/init_schema.py` | 1,706 B | **Active** | Automation script applying `schema.sql` and column additions to Supabase. |
| **Database** | `database/reset_db.py` | 816 B | **Utility** | Developer utility to drop and recreate all tables in PostgreSQL. |
| **Database** | `database/assignments_db.py` | 8,349 B | **Active** | Atomic assignment creation, row-locking assignment resolution, capacity updates. |
| **Database** | `database/inventory_db.py` | 12,973 B | **Active** | Concurrency-hardened inventory stock management and multi-NGO partial allocation. |
| **Database** | `database/needs_db.py` | 6,082 B | **Active** | Emergency need CRUD, geospatial corroboration query, status updates. |
| **Database** | `database/ngos_db.py` | 6,959 B | **Active** | NGO profile CRUD, manual verification flag, platform statistics queries. |
| **Database** | `database/volunteers_db.py` | 10,764 B | **Active** | Volunteer profiles, password hashing with bcrypt, availability management. |
| **Database** | `database/otp_db.py` | 2,869 B | **Active** | OTP storage and single-use verification logic in PostgreSQL. |
| **Database** | `database/geocoding.py` | 2,761 B | **Active** | Geocoding service utilizing OpenStreetMap Nominatim and Google Maps API. |
| **Database** | `database/verification.py` | 12,318 B | **Active** | Trust score calculation, coordinate validation, spam pattern detection. |
| **Database** | `database/ingest.py` | 1,671 B | **Utility** | Seed script for populating professional volunteer and NGO data. |
| **Notifications** | `notifications/gmail_alert.py`| 1,829 B | **Active** | SMTP dispatcher sending urgent HTML email alerts for high-severity needs. |
| **Automation** | `automation/needs_trigger.gs` | 1,544 B | **External Script**| Google Apps Script for forwarding Google Form emergency submissions to `/webhook`. |
| **Automation** | `automation/ngo_trigger.gs` | 1,440 B | **External Script**| Google Apps Script for forwarding NGO registration submissions to `/ngo/register`. |
| **Automation** | `automation/volunteer_trigger.gs`| 1,747 B | **External Script**| Google Apps Script for forwarding volunteer registration to `/volunteer_webhook`. |
| **Frontend Source** | `frontend/src/App.jsx` | 1,113 B | **Active** | React Router definitions (Landing, Dashboard, NgoDashboard, VolunteerDashboard). |
| **Frontend Source** | `frontend/src/main.jsx` | 250 B | **Active** | Vite React application entry point mounting `App` into `#root`. |
| **Frontend Source** | `frontend/src/index.css` | 902 B | **Active** | Tailwind directives and global typography styles. |
| **Frontend Source** | `frontend/src/services/api.js` | 42,647 B | **Active** | Unified API client supporting 23 methods with auto-fallback between live and local mock DB. |
| **Frontend Source** | `frontend/src/pages/LandingPage.jsx` | 70,973 B | **Active** | Public landing page, SOS submission drawer, community metrics visualizer. |
| **Frontend Source** | `frontend/src/pages/DashboardPage.jsx`| 68,147 B | **Active** | Operational coordinator command dashboard with interactive Leaflet map. |
| **Frontend Source** | `frontend/src/pages/NgoDashboardPage.jsx`| 52,023 B | **Active** | NGO capacity dashboard, inventory stock adjustment, dispatch tracking. |
| **Frontend Source** | `frontend/src/pages/VolunteerDashboardPage.jsx`| 37,461 B | **Active** | Volunteer dashboard, on-duty toggle, assignment tracking and resolution. |
| **Frontend Source** | `frontend/src/components/SetuLogo.jsx`| 4,043 B | **Active** | SVG logo component used across navigation bars. |
| **Root Utilities** | `setu_cli.py` | 10,429 B | **Active Tool** | Robust command-line client with authentication, menus, and CSV export. |
| **Root Utilities** | `cli.py` | 8,536 B | **Deprecated** | Legacy unauthenticated CLI tool. |
| **Root Utilities** | `demo_runner_fixed.py` | 14,400 B | **Active Tool** | Canonical 7-step MVP demonstration script. |
| **Root Utilities** | `demo_runner.py` | 13,461 B | **Deprecated** | Predecessor demonstration script containing live-mode bug. |
| **Root Utilities** | `check_db.py` | 581 B | **Active Tool** | Diagnostic script querying table row counts in Supabase. |
| **Root Tests** | `test.py` | 11,415 B | **Legacy Test** | Live server integration test requiring running backend. |
| **Root Tests** | `full_test.py` | 3,699 B | **Legacy Test** | End-to-end integration test requiring live server and database. |

---

## 4. Comprehensive Route Matrix

All routes registered in the application, their HTTP methods, handler functions, authentication requirements, and frontend callers:

| HTTP Method | Route Path | Handler Function | Source File | Auth Guard | Primary Frontend / External Caller |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/` | `home` | `backend/main.py:124` | None (Public) | Health monitors / Browser |
| `GET` | `/health` | `health` | `backend/main.py:132` | None (Public) | `ApiService.getHealth()` |
| `GET` | `/config/public` | `public_config` | `backend/main.py:146` | None (Public) | Map components checking geocoder keys |
| `POST` | `/webhook` | `webhook` | `backend/main.py:160` | RateLimit (5/min) | `automation/needs_trigger.gs` |
| `POST` | `/volunteer_webhook`| `webhook_ngo_register_alias` | `backend/main.py:204` | RateLimit (5/min) | `automation/volunteer_trigger.gs` |
| `WEBSOCKET` | `/ws` | `websocket_endpoint` | `backend/main.py:96` | Token Query Param | None (No active frontend caller) |
| `POST` | `/need/report` | `report_need_public` | `backend/routes/need.py:280` | None (Public) | `ApiService.submitEmergencyReport()` |
| `POST` | `/need` | `create_need` | `backend/routes/need.py:292` | Bearer Token Required | Authenticated admin/coordinator |
| `GET` | `/need` | `list_needs` | `backend/routes/need.py:301` | Optional Auth | `ApiService.getNeeds()` |
| `GET` | `/need/{need_id}` | `get_single_need` | `backend/routes/need.py:322` | Optional Auth | `ApiService.getNeed()` |
| `GET` | `/needs` | `list_needs_alias` | `backend/main.py:258` | Optional Auth | `ApiService.getNeeds()` (Primary) |
| `GET` | `/needs/{need_id}` | `get_single_need_alias` | `backend/main.py:264` | Optional Auth | `ApiService.getNeed()` (Primary) |
| `POST` | `/needs` | `report_need_alias` | `backend/main.py:270` | Bearer Token Required | Authenticated batch tools |
| `GET` | `/match` | `match_needs` | `backend/routes/match.py:217`| Bearer Token Required | Coordinator triage tools |
| `GET` | `/match/debug/{need_id}`| `debug_match` | `backend/routes/match.py:338`| Bearer Token Required | Coordinator debugging |
| `POST` | `/match/allocate/{need_id}`| `allocate_need_ngos`| `backend/routes/match.py:389`| Role: NGO / Admin / System | Target MVP allocation |
| `POST` | `/match/coordinate/{need_id}`| `coordinate_need` | `backend/routes/match.py:406`| Role: NGO / Admin / System | `demo_runner_fixed.py` Step 5 |
| `GET` | `/assignment` | `get_active_assignments` | `backend/routes/assignment.py:12`| Bearer Token Required | Coordinator operations |
| `GET` | `/assignment/active` | `get_active_assignments` | `backend/routes/assignment.py:12`| Bearer Token Required | `ApiService.getActiveAssignments()` fallback |
| `GET` | `/assignments` | `get_assignments_alias` | `backend/main.py:319` | Bearer Token Required | Coordinator operations |
| `GET` | `/assignments/active`| `get_assignments_alias` | `backend/main.py:319` | Bearer Token Required | `ApiService.getActiveAssignments()` (Primary) |
| `POST` | `/assignment/volunteer/{need_id}`| `accept_need` | `backend/routes/assignment.py:34`| Role: Volunteer / Admin | `ApiService.acceptAssignment()` fallback |
| `POST` | `/assignment/{assignment_id}/accept`| `accept_assignment_endpoint`| `backend/routes/assignment.py:164`| Bearer Token Required | `ApiService.acceptAssignment()` fallback |
| `POST` | `/assignments/{assignment_id}/accept`| `accept_assignment_alias`| `backend/main.py:325` | Bearer Token Required | `ApiService.acceptAssignment()` (Primary) |
| `PATCH`| `/assignment/{assignment_id}/progress`| `update_assignment_progress_endpoint`| `backend/routes/assignment.py:182`| Role: Volunteer / Admin | `ApiService.updateAssignmentProgress()` fallback |
| `PATCH`| `/assignments/{assignment_id}/progress`| `update_assignment_progress_alias`| `backend/main.py:331`| Role: Volunteer / Admin | `ApiService.updateAssignmentProgress()` (Primary) |
| `PATCH`| `/assignment/{assignment_id}/dispatch`| `confirm_dispatch_endpoint`| `backend/routes/assignment.py:226`| Role: NGO / Admin | `ApiService.confirmNGODispatch()` fallback |
| `PATCH`| `/assignments/{assignment_id}/dispatch`| `confirm_dispatch_alias`| `backend/main.py:337` | Role: NGO / Admin | `ApiService.confirmNGODispatch()` (Primary) |
| `GET` | `/assignment/volunteer/{volunteer_id}`| `get_volunteer_assignments`| `backend/routes/assignment.py:268`| Role: Volunteer / Admin | `ApiService.getVolunteerAssignments()` fallback |
| `PATCH`| `/assignment/{assignment_id}/resolve`| `resolve` | `backend/routes/assignment.py:324`| Identity Match Guard | `ApiService.resolveAssignment()` fallback |
| `PATCH`| `/assignments/{assignment_id}/resolve`| `resolve_assignment_alias`| `backend/main.py:343` | Identity Match Guard | `ApiService.resolveAssignment()` (Primary) |
| `GET` | `/ngo/list` | `list_ngos` | `backend/routes/ngo.py:54` | None (Public) | `ApiService.getNGOs()` fallback |
| `GET` | `/ngos` | `list_ngos_alias` | `backend/main.py:276` | None (Public) | `ApiService.getNGOs()` (Primary) |
| `POST` | `/ngo/register` | `register_ngo` | `backend/routes/ngo.py:92` | None (Public) | `automation/ngo_trigger.gs` |
| `GET` | `/ngo/{ngo_id}` | `get_ngo_details` | `backend/routes/ngo.py:134` | Optional Auth | `ApiService.getNGO()` fallback |
| `GET` | `/ngos/{ngo_id}` | `get_ngo_alias` | `backend/main.py:283` | Optional Auth | `ApiService.getNGO()` (Primary) |
| `GET` | `/ngo/{ngo_id}/dashboard`| `get_ngo_dashboard` | `backend/routes/ngo.py:143` | Role: NGO / Admin | NGO private portal |
| `GET` | `/ngo/{ngo_id}/needs` | `get_ngo_needs` | `backend/routes/ngo.py:245` | Role: NGO / Admin | `ApiService.getNGONeeds()` fallback |
| `GET` | `/ngos/{ngo_id}/needs` | `get_ngo_needs_alias` | `backend/main.py:312` | Role: NGO / Admin | `ApiService.getNGONeeds()` (Primary) |
| `GET` | `/ngo/{ngo_id}/dispatches`| `get_ngo_dispatches` | `backend/routes/ngo.py:280` | Role: NGO / Admin | `ApiService.getNGODispatches()` fallback |
| `GET` | `/ngos/{ngo_id}/dispatches`| `get_ngo_dispatches_alias`| `backend/main.py:306`| Role: NGO / Admin | `ApiService.getNGODispatches()` (Primary) |
| `GET` | `/ngo/{ngo_id}/inventory`| `get_ngo_inventory_endpoint`| `backend/routes/ngo.py:38`| NGO Owner / Admin | `ApiService.getNGO()` inventory fallback |
| `GET` | `/ngos/{ngo_id}/inventory`| `get_ngo_inventory_alias`| `backend/main.py:289` | NGO Owner / Admin | `ApiService.getNGO()` inventory (Primary) |
| `POST` | `/ngo/{ngo_id}/inventory`| `set_ngo_inventory_endpoint`| `backend/routes/ngo.py:15`| NGO Owner / Admin | `ApiService.updateNGOInventory()` fallback |
| `POST` | `/ngos/{ngo_id}/inventory`| `set_ngo_inventory_alias`| `backend/main.py:296` | NGO Owner / Admin | `ApiService.updateNGOInventory()` (Primary) |
| `PATCH`| `/ngos/{ngo_id}/inventory`| `set_ngo_inventory_alias`| `backend/main.py:296` | NGO Owner / Admin | REST PATCH alias |
| `POST` | `/volunteer` | `create_volunteer` | `backend/routes/volunteer.py:16`| Bearer Token Required | Coordinator onboarding |
| `PATCH`| `/volunteer/status` | `update_own_status` | `backend/routes/volunteer.py:73`| Role: Volunteer (Self) | Volunteer mobile status toggle |
| `PATCH`| `/volunteer/{volunteer_id}/availability`| `update_volunteer_availability_endpoint`| `backend/routes/volunteer.py:94`| Self or Coordinator | `ApiService.updateVolunteerAvailability()` fallback |
| `PATCH`| `/volunteers/{volunteer_id}/availability`| `update_volunteer_availability_endpoint`| `backend/routes/volunteer.py:94`| Self or Coordinator | `ApiService.updateVolunteerAvailability()` (Primary) |
| `GET` | `/volunteers` | `list_volunteers` | `backend/routes/volunteer.py:139`| Bearer Token Required | `ApiService.getVolunteers()` |
| `GET` | `/volunteer/{volunteer_id}`| `get_single_volunteer`| `backend/routes/volunteer.py:159`| Optional Auth | `ApiService.getVolunteer()` fallback |
| `GET` | `/volunteers/{volunteer_id}`| `get_single_volunteer`| `backend/routes/volunteer.py:159`| Optional Auth | `ApiService.getVolunteer()` (Primary) |
| `GET` | `/volunteers/{volunteer_id}/assignments`| `get_vol_assignments_alias`| `backend/routes/volunteer.py:192`| Self or Coordinator | `ApiService.getVolunteerAssignments()` (Primary) |
| `POST` | `/auth/register` | `register_volunteer` | `backend/routes/volunteer_auth.py:22`| None (Public) | Volunteer signup flow |
| `POST` | `/auth/login` | `login_volunteer_endpoint`| `backend/routes/volunteer_auth.py:49`| None (Public) | Volunteer password login |
| `POST` | `/auth/send-otp` | `send_otp_endpoint` | `backend/routes/volunteer_auth.py:73`| None (Public) | Passwordless OTP request |
| `POST` | `/auth/verify-otp` | `verify_otp_endpoint` | `backend/routes/volunteer_auth.py:108`| None (Public) | Passwordless OTP verification |
| `GET` | `/dashboard` | `dashboard` | `backend/routes/dashboard.py:120`| Bearer Token Required | Coordinator summary |
| `GET` | `/dashboard/reports`| `get_reports_endpoint` | `backend/routes/dashboard.py:14`| Bearer Token Required | Coordinator map feed |
| `GET` | `/stats` | `get_stats` | `backend/routes/stats.py:7` | None (Public) | `ApiService.getCommunityStats()` |

---

## 5. Duplicate & Overlapping Logic

### Group 1: Plural vs Singular Route Files
- **Files Involved:**
  - `backend/routes/assignments.py` (0 bytes) vs `backend/routes/assignment.py` (15,600 bytes)
  - `backend/routes/needs.py` (0 bytes) vs `backend/routes/need.py` (12,486 bytes)
  - `backend/routes/ngos.py` (0 bytes) vs `backend/routes/ngo.py` (12,905 bytes)
  - `backend/routes/volunteers.py` (0 bytes) vs `backend/routes/volunteer.py` (9,194 bytes)
- **Active Implementation:** The singular files (`assignment.py`, `need.py`, `ngo.py`, `volunteer.py`) contain the actual code. The plural files are empty zero-byte stubs.
- **Root Cause:** A prior refactoring planned to migrate to standard REST plural URLs via separate files, but instead implemented plural endpoints as wrapper aliases directly inside `backend/main.py` lines 256–346.

### Group 2: Empty Service Stubs vs Active Implementations
- **Files Involved:**
  - `backend/services/geocoding.py` (0 bytes) vs `database/geocoding.py` (2,761 bytes)
  - `backend/services/match.py` (0 bytes) vs `backend/routes/match.py` (16,756 bytes)
  - `backend/services/trust.py` (0 bytes) vs `database/verification.py` (12,318 bytes)
- **Active Implementation:** The actual working logic resides in `database/geocoding.py`, `backend/routes/match.py`, and `database/verification.py`. The files in `backend/services/` are unimported empty files.

### Group 3: CLI Tools
- **Files Involved:** `cli.py` (8,536 bytes) vs `setu_cli.py` (10,429 bytes)
- **Comparison & Differences:**
  - `cli.py`: Older script. Hardcodes `requests.post()` without `Authorization: Bearer <token>` headers. Consequently, all calls to protected endpoints fail with HTTP 401/403.
  - `setu_cli.py`: Fully functional. Reads `SECRET_TOKEN`, attaches headers, provides a comprehensive menu, implements CSV export, and covers volunteer, NGO, and need workflows.
- **Recommendation:** Retain `setu_cli.py`; deprecate and retire `cli.py`.

### Group 4: Target MVP Demo Runners
- **Files Involved:** `demo_runner.py` (13,461 bytes) vs `demo_runner_fixed.py` (14,400 bytes)
- **Comparison & Differences:**
  - `demo_runner.py`: Contains a defect in live HTTP mode where `need_id` is queried before the report has been created.
  - `demo_runner_fixed.py`: Corrects the live sequence by submitting to `/need/report`, extracting `need_id`, and then orchestrating allocation and resolution.
- **Recommendation:** Retain `demo_runner_fixed.py`; remove or rename `demo_runner.py`.

### Group 5: AI Extraction Architecture
- **Files Involved:** `ai_processing/gemini_processor.py` (808 bytes) vs `backend/services/ai.py` (14,112 bytes)
- **Relationship:** Not a conflicting duplicate, but an intentional backward-compatibility shim. `ai_processing/gemini_processor.py` simply re-exports functions from `backend/services/ai.py` so legacy imports like `from ai_processing.gemini_processor import process_need_text` continue to work seamlessly.

### Group 6: Requirements Manifests
- **Files Involved:** Root `requirements.txt` (186 bytes) vs `backend/requirements.txt` (167 bytes)
- **Critical Difference:** Root `requirements.txt` contains `pydantic-settings` (line 15). `backend/requirements.txt` does not. Because `Dockerfile` uses `COPY backend/requirements.txt .`, containerized deployments fail on startup with `ModuleNotFoundError: No module named 'pydantic_settings'`.

---

## 6. Dead Code & Obsolete Candidate List

| File / Component | Lines / Size | Current Reference Status | Why It Can Safely Be Removed / Replaced |
| :--- | :--- | :--- | :--- |
| `backend/routes/assignments.py` | 0 bytes | 0 references | Completely empty stub. |
| `backend/routes/needs.py` | 0 bytes | 0 references | Completely empty stub. |
| `backend/routes/ngos.py` | 0 bytes | 0 references | Completely empty stub. |
| `backend/routes/volunteers.py` | 0 bytes | 0 references | Completely empty stub. |
| `backend/services/geocoding.py` | 0 bytes | 0 references | Completely empty stub; implementation in `database/geocoding.py`. |
| `backend/services/match.py` | 0 bytes | 0 references | Completely empty stub; implementation in `backend/routes/match.py`. |
| `backend/services/trust.py` | 0 bytes | 0 references | Completely empty stub; implementation in `database/verification.py`. |
| `config/.gitkeep` | 0 bytes | 0 references | Redundant; `config/` already contains `.env` and `.env.example`. |
| `cli.py` | 206 lines | Unused by frontend | Outdated CLI lacking authorization headers; superseded by `setu_cli.py`. |
| `demo_runner.py` | 305 lines | Unused by CI | Superseded by `demo_runner_fixed.py`. |
| `backend/test.py` | 91 lines | Ad-hoc runner | Redundant test script outside standard test directory structure. |
| `full_test.py` | 94 lines | Ad-hoc runner | Redundant test script at repository root. |
| `test.py` | 275 lines | Ad-hoc runner | Redundant test suite at repository root. |
| Static mount `frontendnew` | Lines 126, 349 | Target non-existent | References directory `frontendnew` that does not exist in repo. |
| WebSocket `@app.websocket("/ws")`| Lines 95–116 | Unused by frontend | Frontend communicates strictly via REST; WebSocket manager broadcasts but no client connects. |

---

## 7. End-to-End Call Graphs (9 Critical Workflows)

### 1. Emergency Report Submission (`POST /need/report`)
```
Caller (Web SOS Drawer / API)
  │
  ▼
POST /need/report (backend/routes/need.py:280)
  │
  ▼
process_and_save_need() (backend/routes/need.py:59)
  │
  ├─► Length & quantity sanity checks (NeedInput validation)
  ├─► process_need_text() (ai_processing/gemini_processor.py -> backend/services/ai.py)
  │     └─► Groq -> Gemini -> Deterministic Regex Fallback
  ├─► get_coordinates() (database/geocoding.py) -> Lat/Lng resolution
  ├─► run_common_validation() (database/verification.py)
  ├─► check_corroboration() (database/needs_db.py) -> Spatial clustering check
  ├─► calculate_trust_score() (database/verification.py)
  │     └─► Assign status: 'rejected' | 'secondary_review' | 'open' (auto_dispatch)
  ├─► save_need() (database/needs_db.py)
  │     └─► INSERT INTO needs_reports (...)
  │
  └─► If auto_dispatch:
        ├─► BackgroundTasks.add_task(_auto_match_for_need)
        └─► BackgroundTasks.add_task(send_alert) -> Gmail SMTP Alert
```

### 2. AI Extraction & Deterministic Fallback
```
extract_need_ai() (backend/services/ai.py:339)
  │
  ├─► Try: _call_groq() [model: llama-3.3-70b-versatile via Groq API]
  │     └─► _extract_json_text() -> _parse_and_validate()
  │
  ├─► Catch Exception -> Fallback: _call_gemini() [model: gemini-2.0-flash via Google GenAI]
  │     └─► _extract_json_text() -> _parse_and_validate()
  │
  └─► Catch Exception -> Fallback: extract_need_deterministic() [Regex keyword rules]
        ├─► Quantity extraction (re.findall)
        ├─► Category classifier (medical, rescue, food, water, shelter)
        ├─► Urgency classifier (critical, high, medium, low)
        └─► Extraction source tagged as "deterministic_fallback"
```

### 3. Trust Scoring & Secondary Review
```
Input Need Verification Payload
  │
  ▼
run_common_validation() (database/verification.py:73)
  ├─ Coordinates validity & India geographic bounds check
  ├─ Description word count & gibberish / spam detector
  │
  ├─► If Failed:
  │     └─► build_common_only_trust_result() -> Score capped <= 30 (Status: 'rejected')
  │
  └─► If Passed:
        ├─ check_corroboration() -> Count reports within 5km in last 4 hours
        ├─ calculate_trust_score() -> Base + Consistency + Corroboration
        │
        ├─► If Score 31..75:
        │     └─► secondary_review() -> Second-pass AI consistency adjustment (+/-5)
        │     └─► Status set to 'secondary_review'
        │
        └─► If Score > 75:
              └─► Status set to 'open', dispatch_action = 'auto_dispatch'
```

### 4. NGO Onboarding & Inventory Update
```
Caller (NGO Dashboard / Script)
  │
  ▼
POST /ngo/register (backend/routes/ngo.py:92)
  └─► save_ngo() (database/ngos_db.py) -> INSERT INTO ngos (...)
  │
  ▼
POST /ngos/{ngo_id}/inventory (backend/main.py:296 -> backend/routes/ngo.py:15)
  ├─► verify_token() -> Validate JWT & verify token.uid == ngo_id
  │
  ▼
add_or_update_inventory() (database/inventory_db.py:26)
  ├─► SELECT id, total_quantity, reserved_quantity FROM ngo_inventory WHERE ngo_id = %s FOR UPDATE
  ├─► Validate total_quantity >= reserved_quantity
  └─► INSERT ... ON CONFLICT (ngo_id, resource_type) DO UPDATE ...
```

### 5. Multi-NGO Partial Allocation
```
Caller (POST /match/allocate/{need_id} or POST /match/coordinate/{need_id})
  │
  ▼
allocate_ngos_for_need() (database/inventory_db.py:87)
  ├─► SELECT * FROM needs_reports WHERE id = %s FOR UPDATE
  ├─► Determine target quantity: remaining_needed = required_quantity - fulfilled_quantity
  ├─► Query candidate NGOs with available stock of compatible resource_type
  ├─► Sort candidate NGOs by:
  │     1. Verified status (True first)
  │     2. Proximity via Haversine distance (closest first)
  │     3. Available quantity descending
  │
  ├─► Greedy Allocation Loop:
  │     For each NGO in candidates:
  │       alloc_qty = min(remaining_needed, ngo.available_quantity)
  │       UPDATE ngo_inventory:
  │         reserved_quantity = reserved_quantity + alloc_qty,
  │         available_quantity = available_quantity - alloc_qty
  │       INSERT INTO ngo_allocations (need_id, ngo_id, alloc_qty, ...)
  │       remaining_needed -= alloc_qty
  │       If remaining_needed == 0: break
  │
  └─► UPDATE needs_reports:
        fulfilled_quantity = fulfilled_quantity + total_allocated,
        status = 'fulfilled' | 'partially_fulfilled'
```

### 6. Volunteer Registration & Verification
```
Volunteer Registration Flow
  │
  ├─► Path A: Password Signup (POST /auth/register)
  │     ├─► hash_password(password) via bcrypt
  │     ├─► get_coordinates(location)
  │     ├─► INSERT INTO volunteers_auth (...)
  │     ├─► INSERT INTO volunteers (...) (active_assignments=0, available=True)
  │     └─► generate_token() -> Returns JWT
  │
  ├─► Path B: Passwordless OTP (POST /auth/send-otp -> POST /auth/verify-otp)
  │     ├─► Generate cryptographically secure 6-digit OTP
  │     ├─► save_otp() -> INSERT INTO otps (expires_at = NOW() + 10 min)
  │     ├─► send_otp_email() -> SMTP via Gmail
  │     ├─► verify_otp_in_db() -> Single-use delete on match
  │     └─► generate_token() -> Returns JWT
  │
  └─► Path C: NGO Association & Verification
        ├─ When created by an NGO caller (token.role == 'ngo'):
        │    volunteer.ngo_id = token.uid
        │    volunteer.ngo_verified = (ngo.verified == True)
        └─ When self-registered: volunteer.ngo_verified = False (Tier-2)
```

### 7. Volunteer Assignment Coordination
```
POST /match/coordinate/{need_id} (backend/routes/match.py:406)
  │
  ├─► _require_ngo_or_system_role(token)
  ├─► allocate_ngos_for_need(need_id) -> Step 5 multi-NGO inventory allocation
  │
  ├─► find_best_volunteer(need, volunteers) (backend/routes/match.py:171)
  │     ├─► Filter: available == True AND active_assignments < 3
  │     ├─► Filter: distance <= 50.0 km (Haversine)
  │     ├─► Filter: If need is sensitive (medical/rescue), require ngo_verified == True
  │     ├─► Score candidates:
  │     │     Score = (Matched Skills * 100) - (Distance km * 2) - (Active Assignments * 30)
  │     └─► Select highest scoring volunteer
  │
  └─► save_assignment() (database/assignments_db.py:9)
        ├─► SELECT volunteers WHERE id = %s FOR UPDATE
        ├─► SELECT needs_reports WHERE id = %s FOR UPDATE
        ├─► INSERT INTO assignments (...)
        ├─► UPDATE needs_reports SET status = 'assigned'
        └─► UPDATE volunteers SET active_assignments = active_assignments + 1
```

### 8. Assignment Dispatch & Acceptance
```
Assignment Acceptance & In-Flight Updates
  │
  ├─► Volunteer Claims Need: POST /assignments/{id}/accept
  │     ├─► Verify volunteer identity matches token.uid
  │     ├─► Check capacity (active_assignments < 3)
  │     └─► Assign status = 'accepted'
  │
  ├─► NGO Confirms Dispatch: PATCH /assignments/{id}/dispatch
  │     ├─► Verify caller role is 'ngo' or 'admin'
  │     └─► Update assignment note = 'dispatched'
  │
  └─► Volunteer Status Update: PATCH /assignments/{id}/progress
        ├─► Verify caller identity matches volunteer_id
        └─► Update progress notes & status = 'in_progress'
```

### 9. Assignment Resolution & Capacity Replenishment
```
PATCH /assignments/{assignment_id}/resolve (backend/routes/assignment.py:324)
  │
  ├─► Verify authenticated identity:
  │     ├─ Volunteer role: must match assignment.volunteer_id
  │     ├─ NGO role: volunteer must be affiliated with caller's ngo_id
  │     └─ Coordinator/System role: permitted
  │
  ├─► Check idempotency: If already resolved, return HTTP 409 Conflict
  │
  ▼
resolve_assignment() (database/assignments_db.py:93)
  ├─► SELECT assignments WHERE id = %s FOR UPDATE
  ├─► Verify supplied need_id and volunteer_id match stored record
  ├─► UPDATE assignments SET status = 'resolved', resolved_at = NOW()
  ├─► UPDATE needs_reports SET status = 'resolved'
  └─► UPDATE volunteers SET
        active_assignments = GREATEST(0, active_assignments - 1),
        available = TRUE
```

---

## 8. Database Schema vs Implementation Consistency

### Table Structure & Usage Alignment

| Table Name | Schema Definition (`database/schema.sql`) | Actual Database Usage in Code | Discrepancies & Notes |
| :--- | :--- | :--- | :--- |
| `otps` | 4 columns: `email`, `otp`, `expires_at`, `created_at` | `database/otp_db.py` | **100% Consistent.** Used for single-use email verification. |
| `ngos` | 16 columns: `id`, `ngo_name`, `owner_name`, `description`, `type`, `location`, `email`, `phone`, `verified`, `registered_at`, `verified_at`, `region`, `reg_number`, `lat`, `lng`, `radius` | `database/ngos_db.py` | **Consistent.** Includes fallback backfill logic in `list_ngos` for older records missing `ngo_name`. |
| `ngo_inventory` | 8 columns: `id`, `ngo_id`, `resource_type`, `total_quantity`, `reserved_quantity`, `available_quantity`, `unit`, `updated_at` | `database/inventory_db.py` | **Consistent & Hardened.** Enforces `total >= reserved` check and unique constraint `(ngo_id, resource_type)`. |
| `volunteers_auth` | 11 columns: `id`, `email`, `password_hash`, `name`, `phone`, `location`, `skills`, `lat`, `lng`, `available`, `registered_at` | `database/volunteers_db.py` | **Consistent.** Contains auth credentials for password-based logins. |
| `volunteers` | 17 columns: `id`, `name`, `email`, `phone`, `skills`, `lat`, `lng`, `available`, `active_assignments`, `registered_at`, `ngo_id`, `ngo_verified`, `specialty`, `vehicle`, `ngo_affiliation`, `verification_code`, `updated_at` | `database/volunteers_db.py` | **Consistent.** Contains operational dispatch state and NGO affiliations. |
| `needs_reports` | 22 columns: `id`, `reporter_name`, `reporter_phone`, `location_text`, `description`, `lat`, `lng`, `resource_type`, `required_quantity`, `fulfilled_quantity`, `unit`, `urgency`, `severity`, `category`, `status`, `timestamp`, `updated_at`, `trust_score`, `summary_en`, `summary_local`, `disaster_type`, `help_needed` | `database/needs_db.py` | **Consistent.** Migration statements in `init_schema.py` ensure all 22 columns exist. |
| `ngo_allocations`| 7 columns: `id`, `need_id`, `ngo_id`, `resource_type`, `allocated_quantity`, `status`, `created_at` | `database/inventory_db.py` | **Consistent.** Tracks partial allocations across multiple NGOs. |
| `assignments` | 10 columns: `id`, `need_id`, `need_description`, `need_location`, `volunteer_id`, `volunteer_name`, `volunteer_phone`, `assigned_at`, `status`, `resolved_at` | `database/assignments_db.py` | **Consistent.** Tracks volunteer dispatch and resolution timestamps. |

### Database Integrity Observations
1. **Dual Volunteer Tables:** `volunteers_auth` stores credentials while `volunteers` stores operational dispatch data. When registering via `register_volunteer_auth()`, rows are inserted into both tables within a single transaction.
2. **PostgreSQL Row-Level Locking:** All critical state changes (`save_assignment`, `resolve_assignment`, `add_or_update_inventory`, `allocate_ngos_for_need`) use `SELECT ... FOR UPDATE` row-level locks to guarantee concurrency safety.
3. **No Unmodeled Tables:** Static analysis confirmed that only these 8 tables are accessed across all database and route modules.

---

## 9. Security & Reliability Reality Check

### Authentication & Token Validation
- **JWT Implementation:** Standard HS256 JWTs generated via `PyJWT` with explicit `uid`, `role`, `email`, `iat`, and `exp` claims (default 24-hour expiration).
- **Constant-Time Comparison:** Verification against static system tokens uses `secrets.compare_digest()` to eliminate timing-attack vulnerabilities.
- **Strict Startup Validation:** In production mode (`ENVIRONMENT=production` or unrecognized environment), `backend/auth.py` terminates server startup with `RuntimeError` if:
  - `JWT_SECRET` or `SECRET_TOKEN` is shorter than 32 characters.
  - Secrets match known default/insecure placeholders (`"secret"`, `"password"`, `"change-me"`).
  - `SECRET_TOKEN` and `JWT_SECRET` are identical strings.

### Authorization & Access Control
- **IDOR / BOLA Protections:**
  - `resolve_assignment` verifies that the caller's authenticated identity matches the assignment's `volunteer_id` (or the caller's NGO matches the volunteer's `ngo_id`).
  - `set_ngo_inventory` enforces that an authenticated NGO can only edit its own `ngo_id`.
  - `update_own_status` derives the volunteer ID strictly from the verified JWT `uid`.
- **Privilege Separation:**
  - Public reporting endpoints (`POST /need/report`) allow anonymous emergency submissions without exposing private records.
  - Sensitive volunteer coordinates on `/dashboard/reports` are masked for unprivileged callers.

### Operational Resilience
- **Rate Limiting:** SlowAPI limiter protects public webhooks (`5/minute` per remote IP).
- **Fallback Geocoding:** Geocoder attempts OpenStreetMap Nominatim first, gracefully falling back to Google Maps if configured, and extracts coordinates from text descriptions if coordinate fields are missing.
- **AI Circuit Breaking:** Multi-tier extraction pipeline gracefully degrades from Groq $\rightarrow$ Gemini $\rightarrow$ Deterministic Regex, guaranteeing that API downtime or quota exhaustion never blocks report ingestion.

---

## 10. Test Suite Coverage & Health

### Test Inventory Across Repository

| Test File Location | File Size | Execution Type | Primary Focus & Coverage |
| :--- | :--- | :--- | :--- |
| `tests/test_database_hardening.py` | 14,448 B | Unit / Mock | Concurrency, row locking, idempotent assignment resolution, inventory checks. |
| `tests/test_mvp_golden_path.py` | 10,203 B | Unit / TestClient | End-to-end 7-step MVP workflow from report to resolution. |
| `tests/test_auth_remediation.py` | 16,861 B | Unit / TestClient | Role enforcement, IDOR checks on inventory, assignments, and availability. |
| `tests/test_auth_security.py` | 12,908 B | Unit / Mock | Password hashing, token tampering, expired OTP handling. |
| `tests/test_jwt_auth_security.py` | 10,642 B | Unit / Mock | JWT claim validation, malformed token rejection, role boundaries. |
| `tests/test_jwt_config_security.py` | 6,860 B | Unit / Mock | Startup secret entropy validation, environment mode gating. |
| `tests/test_jwt_security_fixes.py` | 13,382 B | Unit / TestClient | End-to-end authorization regressions across all protected endpoints. |
| `tests/test_ai_extraction_persistence.py`| 14,050 B | Unit / Mock | AI extraction normalization, system field stripping, DB persistence. |
| `tests/test_ngo.py` | 4,969 B | Unit / Mock | NGO registration, inventory calculations, capacity checks. |
| `database/test_database.py` | 23,454 B | Unit / Mock (54 tests)| PostgreSQL CRUD operations, bcrypt passwords, geocoding fallbacks. |
| `ai_processing/test_ai_processing.py` | 8,800 B | Unit / Mock | Prompt construction, JSON cleaning, category normalization. |
| `ai_processing/test_gemini.py` | 3,723 B | Ad-hoc Live Test | Live Gemini API verification (requires active API key). |
| `notifications/test_notifications.py` | 8,364 B | Unit / Mock | Email alert formatting and SMTP failure handling. |
| `backend/test_backend.py` | 88,468 B | Unit / TestClient | Monolithic legacy test suite covering original endpoints. |
| `test.py` (Root) | 11,415 B | Integration (Live Server)| Requires running server at `SETU_BASE_URL`. |
| `full_test.py` (Root) | 3,699 B | Integration (Live Server)| Requires running server and live database. |

### Test Suite Execution Status
The canonical test suite in `tests/` runs completely offline using mocks and `fastapi.testclient.TestClient`.
- Verified passing command:
  ```powershell
  $env:ENVIRONMENT="development"
  python -m unittest tests/test_database_hardening.py tests/test_mvp_golden_path.py
  ```
  Result: **22 tests passed (OK)** in under 1.5 seconds.

---

## 11. Environment & Configuration Inventory

### Configuration Variables Summary

| Environment Variable | Where Referenced | Purpose & Fallback Behavior |
| :--- | :--- | :--- |
| `ENVIRONMENT` / `ENV` | `backend/auth.py`, `backend/config.py` | Dictates strictness of secret validation. Defaults to `"development"`. |
| `JWT_SECRET` | `backend/auth.py`, `backend/routes/volunteer_auth.py` | Secret key for signing volunteer JWTs. Requires 32+ characters in production. |
| `SECRET_TOKEN` | `backend/auth.py`, `backend/main.py`, `setu_cli.py` | Pre-shared token for admin/coordinator API calls. Requires 32+ characters in production. |
| `SUPABASE_DB_URL` | `database/postgres_client.py` | Supabase PostgreSQL connection URI with SSL requirement. |
| `GROQ_API_KEY` | `backend/services/ai.py` | Primary LLM provider key (`llama-3.3-70b-versatile`). |
| `GEMINI_API_KEY` | `backend/services/ai.py`, `ai_processing/` | Secondary LLM fallback key (`gemini-2.0-flash`). |
| `GOOGLE_MAPS_KEY` / `GOOGLE_MAPS_API_KEY`| `database/geocoding.py`, `backend/main.py` | Google Maps API key; defaults to OpenStreetMap Nominatim if unset. |
| `GMAIL_SENDER` | `notifications/gmail_alert.py`, `backend/email_utils.py`| Gmail address for sending emergency alerts and OTP emails. |
| `GMAIL_APP_PASSWORD` | `notifications/gmail_alert.py`, `backend/email_utils.py`| Gmail 16-character App Password for SMTP authentication. |
| `GMAIL_RECEIVER` | `notifications/gmail_alert.py` | Target recipient for emergency alerts (defaults to `GMAIL_SENDER`). |
| `VITE_API_BASE_URL` | `frontend/src/services/api.js` | Base URL for React frontend API calls (defaults to `http://localhost:8000`). |

### Configuration Inconsistencies
1. **Port Discrepancies:**
   - `frontend/src/services/api.js` defaults to `http://localhost:8000`.
   - `automation/*.gs` Google Apps Scripts hardcode `http://127.0.0.1:8080/`.
   - `Dockerfile` exposes and runs on port `8080`.
   - `demo_runner_fixed.py` defaults to `http://127.0.0.1:8080`.
2. **Missing Dependency in `backend/requirements.txt`:**
   - `backend/requirements.txt` lacks `pydantic-settings`, which causes Docker builds to crash.

---

## 12. Prioritized Cleanup & Migration Plan

The following phased plan outlines the exact actions to take when ready to clean up the repository, ordered by risk and priority:

### Phase 0: Immediate Zero-Risk Removals (0% Breaking Risk)
1. **Delete Empty 0-Byte Route Stubs:**
   - Remove `backend/routes/assignments.py`
   - Remove `backend/routes/needs.py`
   - Remove `backend/routes/ngos.py`
   - Remove `backend/routes/volunteers.py`
2. **Delete Empty 0-Byte Service Stubs:**
   - Remove `backend/services/geocoding.py`
   - Remove `backend/services/match.py`
   - Remove `backend/services/trust.py`
3. **Remove Stray Gitkeep:**
   - Remove `config/.gitkeep`

### Phase 1: Tool & Script Consolidation (Low Risk)
1. **Consolidate CLIs:**
   - Remove deprecated `cli.py`; keep `setu_cli.py` as the official CLI.
2. **Consolidate Demo Runners:**
   - Remove defective `demo_runner.py`; retain `demo_runner_fixed.py` (or rename `demo_runner_fixed.py` to `demo_runner.py`).
3. **Relocate Ad-hoc Root Tests:**
   - Move or archive root test scripts (`test.py`, `full_test.py`, `check_db.py`, `backend/test.py`) into an `archive/` or `tests/integration/` folder so `pytest` and unittest discover only standard test modules.

### Phase 2: Route & Architecture Normalization (Medium Risk)
1. **Clean Up Route Aliases in `backend/main.py`:**
   - Replace manual plural aliases in `backend/main.py` lines 256–346 by either mounting routers with clean plural prefixes or adding path decorators to existing router functions.
2. **Remove Dead Static Mount:**
   - Remove lines 126–127 and 349–350 referencing non-existent `frontendnew/`, or update them to mount `frontend/dist/` if serving a single unified container.
3. **Frontend Mock Mode Default:**
   - In `frontend/src/services/api.js`, update `isMockMode()` to automatically detect backend connectivity on startup (via `/health`) and seamlessly switch to live mode without requiring manual localStorage configuration.

### Phase 3: Deployment & Docker Synchronization (Low Risk)
1. **Synchronize `backend/requirements.txt`:**
   - Add `pydantic-settings` to `backend/requirements.txt` so Docker builds succeed.
2. **Standardize Ports:**
   - Standardize default ports across `Dockerfile`, `automation/*.gs`, and documentation to port `8000` (or configure via an explicit `PORT` environment variable).
