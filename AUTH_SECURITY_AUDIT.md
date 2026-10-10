# SETU — Authentication & Authorization Security Audit

**Audit Date:** October 11, 2026  
**Auditor:** Antigravity Autonomous Security Engineer  
**Mode:** Strictly Read-Only Source Code & Architecture Inspection  
**Scope:** Backend (`FastAPI`), Database (`Supabase PostgreSQL`), Frontend Integration (`React 19 / Vite`), Test Suites  

---

## 1. Executive Summary

A comprehensive, read-only authentication and authorization audit was conducted across the SETU disaster relief coordination codebase. While core identity primitives (such as bcrypt password hashing and 24-hour signed JWT tokens) are correctly implemented, **critical authorization and access-control vulnerabilities** exist across the application layer, API routing, and database tiers.

### Key Audit Findings Overview
1. **Critical Authentication Bypass & Broken Object Level Authorization (BOLA/IDOR):** Multiple state-modifying write endpoints (including inventory adjustments, task acceptance, and emergency assignment resolution) either rely on permissive `optional_verify_token` dependencies with broken `if token is not None` checks or are exposed through plural REST aliases with zero authentication dependencies.
2. **Citizen and Responder PII Leakage:** Distress victim contact numbers, full names, incident locations, and live GPS coordinates of deployed volunteers are publicly accessible via unauthenticated endpoints (`GET /dashboard/reports`, `GET /volunteer/{id}`, `GET /need`, `GET /ngo/{id}/dispatches`).
3. **Database-Tier Exposure & Missing Row Level Security (RLS):** Supabase PostgreSQL tables in the `public` schema (including `otps` with plaintext OTPs and `volunteers_auth` with password hashes) have no Row Level Security enabled, exposing them to direct exfiltration via Supabase PostgREST Data APIs.
4. **Fragile Authentication Primitives:** OTP generation uses Python's non-cryptographic `random.randint` (Mersenne Twister), rate-limiting mechanisms are stored in ephemeral in-memory process dictionaries that fail across multi-process deployments, and a shared static `SECRET_TOKEN` acts as a universal root backdoor.
5. **No Frontend Route Protection:** The React single-page application defines zero route guards; all operational dashboards (`/dashboard`, `/ngo-dashboard`, `/volunteer-dashboard`) allow unauthenticated navigation and arbitrary identity switching via client-side dropdown menus.

---

## 2. Severity-Ranked Findings

```
┌──────────────┬──────────────────────────────────────────────────────────────────┐
│ SEVERITY     │ COUNT & SUMMARY                                                  │
├──────────────┼──────────────────────────────────────────────────────────────────┤
│ CRITICAL (4) │ Unauthenticated Assignment Resolution Bypass                     │
│              │ Arbitrary NGO Inventory Tampering (BOLA & Missing Auth)         │
│              │ Unauthenticated Volunteer Availability Tampering (IDOR)          │
│              │ Unauthenticated Live Responder GPS & Victim PII Exfiltration     │
├──────────────┼──────────────────────────────────────────────────────────────────┤
│ HIGH (4)     │ Direct Supabase Data API Exposure (RLS Disabled on All Tables)   │
│              │ Cleartext OTP Storage & Non-Cryptographic PRNG Generation         │
│              │ Ephemeral In-Memory Rate Limiting (Multi-Worker Bypass)          │
│              │ Unauthenticated Assignment Claiming & Dispatch Tampering         │
├──────────────┼──────────────────────────────────────────────────────────────────┤
│ MEDIUM (3)   │ Shared Static `SECRET_TOKEN` Backdoor & JWT Secret Fallback      │
│              │ NGO Account Takeover via Unauthenticated Registration Intake     │
│              │ Missing RBAC on Allocation & Coordination Endpoints              │
├──────────────┼──────────────────────────────────────────────────────────────────┤
│ LOW (2)      │ Cross-Tenant Assignment Leakage on NGO Tactical Dashboard        │
│              │ Zero Route Guards in Frontend React Router                       │
└──────────────┴──────────────────────────────────────────────────────────────────┘
```

---

### Finding 1: Unauthenticated Assignment Resolution Bypass [CRITICAL]
- **File:** [`backend/routes/assignment.py`](file:///C:/Users/mudit/Documents/Build4.0/backend/routes/assignment.py#L276-L341), [`backend/main.py`](file:///C:/Users/mudit/Documents/Build4.0/backend/main.py#L320-L322)
- **Endpoints:** `PATCH /assignment/{assignment_id}/resolve`, `PATCH /assignments/{assignment_id}/resolve`
- **Functions:** `resolve()`, `resolve_assignment_alias()`
- **Vulnerability Description:**  
  The endpoint uses `token: Optional[dict] = Depends(optional_verify_token)`. At lines 308–328:
  ```python
  if token is not None:
      caller_role = token.get("role")
      ...
      if caller_role == "volunteer":
          if not caller_uid or caller_uid != volunteer_id:
              raise HTTPException(status_code=403, detail="Forbidden...")
  ```
  If an attacker sends **no Authorization header**, `token` evaluates to `None`. The entire authorization block is bypassed! Furthermore, the plural REST alias in `backend/main.py` lines 320–322:
  ```python
  @app.patch("/assignments/{assignment_id}/resolve")
  def resolve_assignment_alias(assignment_id: str):
      from backend.routes.assignment import resolve
      return resolve(assignment_id)
  ```
  does not declare any token dependency.
- **Attack Scenario & Impact:**  
  An unauthenticated remote attacker can iterate through assignment UUIDs and mark active disaster relief deliveries as "resolved". This closes active distress cases prematurely and restores volunteer capacity before emergency supplies reach victims, causing coordination failure during active disasters.

---

### Finding 2: Arbitrary NGO Inventory Manipulation via BOLA and Missing Auth [CRITICAL]
- **File:** [`backend/routes/ngo.py`](file:///C:/Users/mudit/Documents/Build4.0/backend/routes/ngo.py#L14-L28), [`backend/main.py`](file:///C:/Users/mudit/Documents/Build4.0/backend/main.py#L278-L287)
- **Endpoints:** `POST /ngo/{ngo_id}/inventory`, `POST /ngos/{ngo_id}/inventory`, `PATCH /ngos/{ngo_id}/inventory`
- **Functions:** `set_ngo_inventory_endpoint()`, `set_ngo_inventory_alias()`
- **Vulnerability Description:**  
  In `backend/routes/ngo.py`:
  ```python
  @router.post("/{ngo_id}/inventory")
  def set_ngo_inventory_endpoint(ngo_id: str, data: NGOInventoryInput, token: Optional[dict] = Depends(optional_verify_token)):
      if isinstance(token, dict) and token.get("role") == "ngo" and token.get("uid") != ngo_id:
          raise HTTPException(status_code=403, detail="Access denied: cannot modify another NGO's inventory")
      inv_id = add_or_update_inventory(ngo_id, data.resource_type, data.total_quantity, data.unit)
  ```
  1. If `token` is `None` (no header), `isinstance(token, dict)` is `False` — authorization is bypassed.
  2. If the user is logged in as a `volunteer` (`role == "volunteer"`), `token.get("role") == "ngo"` is `False` — authorization is bypassed.
  3. In `backend/main.py`, the plural aliases `@app.post("/ngos/{ngo_id}/inventory")` and `@app.patch("/ngos/{ngo_id}/inventory")` do not define `token` at all.
- **Attack Scenario & Impact:**  
  Any unauthenticated actor or low-privileged volunteer can set an NGO's food, boat, or medical stock to `0` or `999999`. Setting stock to 0 denies emergency allocation; inflating stock creates phantom inventory, causing automated matching engines to dispatch non-existent supplies.

---

### Finding 3: Unauthenticated Volunteer Availability Tampering (IDOR) [CRITICAL]
- **File:** [`backend/routes/volunteer.py`](file:///C:/Users/mudit/Documents/Build4.0/backend/routes/volunteer.py#L96-L112)
- **Endpoints:** `PATCH /volunteer/{volunteer_id}/availability`, `PATCH /volunteers/{volunteer_id}/availability`
- **Function:** `update_volunteer_availability_endpoint()`
- **Vulnerability Description:**  
  While [`PATCH /volunteer/status`](file:///C:/Users/mudit/Documents/Build4.0/backend/routes/volunteer.py#L75-L94) correctly extracts `volunteer_id` from the verified token (`token.get("uid")`), `PATCH /volunteer/{volunteer_id}/availability` accepts `volunteer_id` in the URL path, applies `optional_verify_token`, and immediately calls `update_volunteer_status(volunteer_id, data.available)` without checking caller identity.
- **Attack Scenario & Impact:**  
  An unauthenticated actor can fetch the public volunteer list from `GET /volunteers` and toggle every volunteer to `available = false` (off-duty). This instantly paralyzes automated triage matching across the entire disaster zone.

---

### Finding 4: Unauthenticated Live Responder GPS Tracking & Victim PII Leakage [CRITICAL]
- **File:** [`backend/routes/dashboard.py`](file:///C:/Users/mudit/Documents/Build4.0/backend/routes/dashboard.py#L13-L110), [`backend/routes/volunteer.py`](file:///C:/Users/mudit/Documents/Build4.0/backend/routes/volunteer.py#L133-L144), [`backend/routes/need.py`](file:///C:/Users/mudit/Documents/Build4.0/backend/routes/need.py#L261-L277)
- **Endpoints:** `GET /dashboard/reports`, `GET /volunteer/{volunteer_id}`, `GET /need`, `GET /need/{need_id}`
- **Vulnerability Description:**  
  `GET /dashboard/reports` uses `optional_verify_token` without gating unauthenticated requests. It returns:
  - Caller full name and phone number (`reporter_name`, `reporter_phone`)
  - Incident address and distress summary
  - Assigned responder full name, phone number (`volunteer_phone`), and live GPS coordinates (`volunteer_lat`, `volunteer_lng`)
  Similarly, `GET /volunteer/{volunteer_id}` is completely unauthenticated and exposes personal phone numbers, email addresses, and vehicle details.
- **Attack Scenario & Impact:**  
  Hostile actors, stalkers, or looters in active disaster zones can track field workers and vulnerable victims in real time, extract phone numbers for phishing/harassment, and identify unstaffed disaster relief supply drops.

---

### Finding 5: Supabase Data API Exposure — Missing Row Level Security (RLS) [HIGH]
- **File:** [`database/schema.sql`](file:///C:/Users/mudit/Documents/Build4.0/database/schema.sql#L1-L143)
- **Tables Affected:** `otps`, `volunteers_auth`, `volunteers`, `ngos`, `ngo_inventory`, `needs_reports`, `ngo_allocations`, `assignments`
- **Vulnerability Description:**  
  `schema.sql` contains zero `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` commands and zero `CREATE POLICY` statements. Supabase exposes the PostgreSQL `public` schema over PostgREST (`https://<project-ref>.supabase.co/rest/v1/`). By default, PostgREST grants `anon` and `authenticated` roles broad read and write permissions unless RLS is enabled or table grants are explicitly revoked.
- **Attack Scenario & Impact:**  
  Anyone with the public Supabase URL and anon public key can query `https://<ref>.supabase.co/rest/v1/otps` to read active one-time passwords, or query `https://<ref>.supabase.co/rest/v1/volunteers_auth` to dump password hashes and phone numbers directly from the database, bypassing the FastAPI application entirely.

---

### Finding 6: Cleartext OTP Storage & Non-Cryptographic Random Generation [HIGH]
- **File:** [`database/otp_db.py`](file:///C:/Users/mudit/Documents/Build4.0/database/otp_db.py#L5-L25), [`backend/routes/volunteer_auth.py`](file:///C:/Users/mudit/Documents/Build4.0/backend/routes/volunteer_auth.py#L93-L98)
- **Functions:** `save_otp()`, `send_otp_endpoint()`
- **Vulnerability Description:**  
  1. OTP generation uses Python's standard `random.randint(100000, 999999)` instead of `secrets.randbelow` or `secrets.choice`. `random` is based on the Mersenne Twister PRNG, which is completely predictable given 624 observed outputs.
  2. OTPs are stored in plaintext in the `otps` table (`INSERT INTO otps (email, otp, expires_at) VALUES (%s, %s, ...)`).
- **Attack Scenario & Impact:**  
  Database readers can intercept active authentication codes. Furthermore, if an attacker observes consecutive OTPs generated by the worker process, they can predict subsequent OTPs and take over accounts without receiving the email.

---

### Finding 7: Ephemeral In-Memory Rate Limiting (Multi-Worker Bypass) [HIGH]
- **File:** [`backend/routes/volunteer_auth.py`](file:///C:/Users/mudit/Documents/Build4.0/backend/routes/volunteer_auth.py#L16-L19), [`backend/routes/volunteer_auth.py`](file:///C:/Users/mudit/Documents/Build4.0/backend/routes/volunteer_auth.py#L77-L92), [`backend/routes/volunteer_auth.py`](file:///C:/Users/mudit/Documents/Build4.0/backend/routes/volunteer_auth.py#L117-L149)
- **Vulnerability Description:**  
  OTP resend cooldowns and brute-force attempt counts are stored in Python memory (`_verify_attempts = {}`, `_last_sent = {}`, with a `threading.Lock()`).
- **Attack Scenario & Impact:**  
  In any standard production deployment (e.g. Uvicorn with multiple workers `--workers 4`, Gunicorn, or multi-instance serverless deployments on Google Cloud Run), memory is isolated per worker process. An attacker can distribute requests across workers or container instances, bypassing both the 60-second cooldown and the 5-attempt brute-force limit.

---

### Finding 8: Unauthenticated Assignment Claiming & Dispatch Tampering [HIGH]
- **File:** [`backend/routes/assignment.py`](file:///C:/Users/mudit/Documents/Build4.0/backend/routes/assignment.py#L33-L72), [`backend/routes/assignment.py`](file:///C:/Users/mudit/Documents/Build4.0/backend/routes/assignment.py#L166-L223)
- **Endpoints:** `POST /assignment/volunteer/{need_id}`, `POST /assignments/{assignment_id}/accept`, `PATCH /assignments/{assignment_id}/progress`, `PATCH /assignments/{assignment_id}/dispatch`
- **Functions:** `accept_need()`, `accept_assignment_endpoint()`, `update_assignment_progress_endpoint()`, `confirm_dispatch_endpoint()`
- **Vulnerability Description:**  
  1. `accept_need` uses `optional_verify_token`. When `token` is missing, line 68 falls back to `volunteer_id = volunteer_id or "V001"`. Anyone can assign any need to any arbitrary volunteer.
  2. `update_assignment_progress_endpoint` and `confirm_dispatch_endpoint` take `optional_verify_token` and perform direct database updates without validating whether the caller is assigned to the task.
- **Attack Scenario & Impact:**  
  An unauthenticated actor can claim tasks on behalf of registered volunteers and falsely report dispatches as "in progress", preventing legitimate responders from being dispatched.

---

### Finding 9: Shared Static `SECRET_TOKEN` Backdoor & JWT Secret Fallback [MEDIUM]
- **File:** [`backend/auth.py`](file:///C:/Users/mudit/Documents/Build4.0/backend/auth.py#L12-L17), [`backend/auth.py`](file:///C:/Users/mudit/Documents/Build4.0/backend/auth.py#L50-L56)
- **Vulnerability Description:**  
  1. `verify_token` checks:
     ```python
     if token == SECRET_TOKEN:
         return {"uid": "system", "role": "system", "email": "system@setu.org"}
     ```
     Any caller who obtains `SECRET_TOKEN` obtains full unrestricted `system` privileges.
  2. `JWT_SECRET = os.getenv("JWT_SECRET", SECRET_TOKEN)`: if `JWT_SECRET` is omitted from `.env`, JWT signing defaults to `SECRET_TOKEN`. If `SECRET_TOKEN` is known by test scripts or client configurations, arbitrary JWTs can be forged.
- **Impact:**  
  Static credentials act as a master key. If leaked, an attacker achieves complete system compromise.

---

### Finding 10: Missing RBAC on Allocation & Coordination Endpoints [MEDIUM]
- **File:** [`backend/routes/match.py`](file:///C:/Users/mudit/Documents/Build4.0/backend/routes/match.py#L456-L515)
- **Endpoints:** `POST /match/allocate/{need_id}`, `POST /match/coordinate/{need_id}`
- **Vulnerability Description:**  
  While `GET /match` explicitly enforces `token.get("role") in ["system", "ngo"]`, `POST /match/allocate/{need_id}` and `POST /match/coordinate/{need_id}` only require `token: dict = Depends(verify_token)`. No role check is performed.
- **Impact:**  
  A registered volunteer with a basic `role="volunteer"` JWT can trigger system-wide multi-NGO inventory allocation and initiate automatic volunteer dispatches.

---

### Finding 11: Cross-Tenant Data Leakage on NGO Tactical Dashboard [LOW]
- **File:** [`backend/routes/ngo.py`](file:///C:/Users/mudit/Documents/Build4.0/backend/routes/ngo.py#L184-L186)
- **Endpoint:** `GET /ngo/{ngo_id}/dashboard`
- **Vulnerability Description:**  
  In `get_ngo_dashboard()`, line 185 queries active assignments across the entire database:
  ```python
  cur.execute("SELECT * FROM assignments WHERE resolved_at IS NULL")
  assignment_rows = cur.fetchall()
  ```
- **Impact:**  
  An authenticated NGO sees active assignments, locations, and lead volunteers belonging to all other NGOs, violating multi-tenant isolation.

---

### Finding 12: Zero Route Guards in Frontend React Router [LOW / ARCHITECTURAL]
- **File:** [`frontend/src/App.jsx`](file:///C:/Users/mudit/Documents/Build4.0/frontend/src/App.jsx#L8-L29), [`frontend/src/pages/NgoDashboardPage.jsx`](file:///C:/Users/mudit/Documents/Build4.0/frontend/src/pages/NgoDashboardPage.jsx#L30-L32), [`frontend/src/pages/VolunteerDashboardPage.jsx`](file:///C:/Users/mudit/Documents/Build4.0/frontend/src/pages/VolunteerDashboardPage.jsx#L27-L29)
- **Vulnerability Description:**  
  All frontend routes (`/`, `/ngo-dashboard`, `/volunteer-dashboard`, `/dashboard`) are completely public. The pages use local state dropdowns (`setSelectedNgoId('NGO001')`, `setSelectedVolunteerId('V001')`) that allow switching between organizations and volunteers without requiring authentication.

---

## 3. Current Authentication & Authorization Architecture

### 3.1 Authentication Primitives

```
┌────────────────────────────────────────────────────────────────────────┐
│                              CLIENT                                    │
└──────────────┬──────────────────────────────────────────┬──────────────┘
               │                                          │
       Password Login                             Email OTP Flow
       (Volunteers Only)                          (NGOs & Volunteers)
               │                                          │
               ▼                                          ▼
     POST /auth/login                             POST /auth/send-otp
   (Bcrypt verification)                        (Generates 6-digit OTP)
               │                                          │
               ▼                                          ▼
      Returns JWT Token                          POST /auth/verify-otp
  (HS256, 24h, role: volunteer)                    (Validates OTP in DB)
               │                                          │
               └──────────────────┬───────────────────────┘
                                  ▼
                         Signed JWT Payload:
                     { sub, uid, role, email, exp }
```

- **Token Signing:** HMAC-SHA256 (`HS256`) with `JWT_SECRET` (falling back to `SECRET_TOKEN`).
- **Session Lifespan:** Hardcoded 24 hours (`exp = now + timedelta(hours=24)`).
- **Token Invalidation:** Stateless JWT; no blacklist or session revocation table exists.
- **Client Storage:** Tokens stored in browser `localStorage.getItem('auth_token')`.

### 3.2 Authorization Enforcement

FastAPI routes use one of three dependency configurations:
1. `Depends(verify_token)`: Rejects missing/invalid tokens with 401. Accepts `SECRET_TOKEN` as system root.
2. `Depends(optional_verify_token)`: Returns decoded payload if valid token present; returns `None` if token missing or invalid. **Used incorrectly on write endpoints.**
3. **No Dependency (Public):** Routes that declare no dependency, including aliases in `backend/main.py`.

---

## 4. Complete Endpoint Security Matrix

| Method | Endpoint Path | Source File | Auth Dependency | Role / Ownership Enforced | Verdict | Risk / Defect |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/health` | `main.py` | None | None | **SAFE** | Public health probe |
| `GET` | `/config/public` | `main.py` | None | None | **POTENTIAL RISK** | Leaks Google Maps API key if unrestricted |
| `WS` | `/ws` | `main.py` | Query Param `token` | Valid token or `SECRET_TOKEN` | **POTENTIAL RISK** | Token in query string logged in access logs |
| `POST` | `/webhook` | `main.py` | None (5/min rate limit) | None | **SAFE** | Intended public emergency SOS webhook |
| `POST` | `/volunteer_webhook` | `main.py` | None (5/min rate limit) | Forces `ngo_verified: False` | **SAFE** | Public volunteer registration intake |
| `POST` | `/auth/register` | `volunteer_auth.py` | None | None | **SAFE** | Public volunteer account registration |
| `POST` | `/auth/login` | `volunteer_auth.py` | None | None | **SAFE** | Password login; bcrypt verified |
| `POST` | `/auth/send-otp` | `volunteer_auth.py` | None | None | **VULNERABLE** | Cleartext OTP in DB; in-memory rate limit |
| `POST` | `/auth/verify-otp` | `volunteer_auth.py` | None | None | **VULNERABLE** | In-memory attempt cap; unverified NGO email issue |
| `POST` | `/need/report` | `need.py` | None | None | **SAFE** | Public emergency SOS intake |
| `POST` | `/need` | `need.py` | `verify_token` | None | **POTENTIAL RISK** | Any role can post needs |
| `POST` | `/needs` | `main.py` (alias) | None | None | **VULNERABLE** | Plural alias has zero authentication |
| `GET` | `/need`, `/needs` | `need.py`, `main.py` | None | None | **VULNERABLE** | Leaks victim phone numbers and locations |
| `GET` | `/need/{id}`, `/needs/{id}` | `need.py`, `main.py` | None | None | **VULNERABLE** | Unauthenticated distress victim PII access |
| `POST` | `/ngo/register` | `ngo.py` | None | Strips `verified` | **SAFE** | Public registration intake |
| `GET` | `/ngo/list`, `/ngos` | `ngo.py`, `main.py` | None | None | **POTENTIAL RISK** | Exposes NGO contact PII; GET modifies DB |
| `GET` | `/ngo/{id}`, `/ngos/{id}` | `ngo.py`, `main.py` | None | None | **SAFE** | Public profile |
| `GET` | `/ngo/{id}/inventory` | `ngo.py`, `main.py` | None | None | **POTENTIAL RISK** | Unauthenticated inventory stock visibility |
| `POST` | `/ngo/{id}/inventory` | `ngo.py` | `optional_verify_token` | Flawed: bypassed if token omitted or role=vol | **VULNERABLE** | Critical BOLA: anyone can modify NGO inventory |
| `POST` | `/ngos/{id}/inventory` | `main.py` (alias) | None | None | **VULNERABLE** | Critical: unauthenticated inventory tampering |
| `PATCH` | `/ngos/{id}/inventory` | `main.py` (alias) | None | None | **VULNERABLE** | Critical: unauthenticated inventory tampering |
| `GET` | `/ngo/{id}/dashboard` | `ngo.py` | `verify_token` | Enforces NGO/affiliated vol, but leaks all tasks | **POTENTIAL RISK** | Cross-tenant global assignment leakage |
| `GET` | `/ngo/{id}/needs` | `ngo.py`, `main.py` | None | None | **POTENTIAL RISK** | Unauthenticated read of allocated needs |
| `GET` | `/ngo/{id}/dispatches` | `ngo.py`, `main.py` | None | None | **VULNERABLE** | Leaks volunteer phones, vehicles, victim PII |
| `POST` | `/volunteer` | `volunteer.py` | `verify_token` | Validates NGO ID if role=ngo, strips tier if not | **SAFE** | Proper role-based input sanitization |
| `PATCH` | `/volunteer/status` | `volunteer.py` | `verify_token` | Enforces `role == "volunteer"`, uses `token.uid` | **SAFE** | Secure: identity derived from token |
| `PATCH` | `/volunteer/{id}/availability` | `volunteer.py` | `optional_verify_token` | None | **VULNERABLE** | Critical IDOR: anyone can toggle any volunteer |
| `PATCH` | `/volunteers/{id}/availability` | `volunteer.py` | `optional_verify_token` | None | **VULNERABLE** | Critical IDOR: anyone can toggle any volunteer |
| `GET` | `/volunteers` | `volunteer.py` | `optional_verify_token` | None | **SAFE** | Sanitized public responder roster |
| `GET` | `/volunteer/{id}` | `volunteer.py` | None | None | **VULNERABLE** | Leaks responder phone number and email |
| `GET` | `/volunteers/{id}` | `volunteer.py` | None | None | **VULNERABLE** | Leaks responder phone number and email |
| `GET` | `/volunteers/{id}/assignments`| `volunteer.py` | `optional_verify_token` | None | **VULNERABLE** | Anyone can inspect another's assignments |
| `GET` | `/assignment/volunteer/{id}` | `assignment.py` | `optional_verify_token` | Checks role only IF token present; bypass if omitted | **VULNERABLE** | Bypassed if token is omitted |
| `GET` | `/assignment`, `/assignments` | `assignment.py`, `main.py` | `optional_verify_token` | None | **POTENTIAL RISK** | Unauthenticated read of all active dispatches |
| `POST` | `/assignment/volunteer/{need_id}`| `assignment.py` | `optional_verify_token` | Fallback to query volunteer_id or "V001" | **VULNERABLE** | Unauthenticated caller can claim tasks |
| `POST` | `/assignments/{id}/accept` | `assignment.py`, `main.py` | `optional_verify_token` | Fallback to payload volunteer_id or "V001" | **VULNERABLE** | Unauthenticated caller can claim tasks |
| `PATCH` | `/assignments/{id}/progress` | `assignment.py`, `main.py` | `optional_verify_token` | None | **VULNERABLE** | Unauthenticated state manipulation |
| `PATCH` | `/assignments/{id}/dispatch` | `assignment.py`, `main.py` | `optional_verify_token` | None | **VULNERABLE** | Unauthenticated state manipulation |
| `PATCH` | `/assignment/{id}/resolve` | `assignment.py` | `optional_verify_token` | Checks role only IF token present; bypass if omitted | **VULNERABLE** | Critical: unauthenticated case closure |
| `PATCH` | `/assignments/{id}/resolve` | `main.py` (alias) | None | None | **VULNERABLE** | Critical: unauthenticated case closure |
| `GET` | `/match` | `match.py` | `verify_token` | Enforces `role in ["system", "ngo"]` | **SAFE** | Protected matching engine |
| `GET` | `/match/debug/{need_id}` | `match.py` | `verify_token` | Enforces `role in ["system", "ngo"]` | **SAFE** | Protected debug breakdown |
| `POST` | `/match/allocate/{need_id}` | `match.py` | `verify_token` | None (any authenticated role can call) | **VULNERABLE** | Missing RBAC: volunteers can allocate inventory |
| `POST` | `/match/coordinate/{need_id}` | `match.py` | `verify_token` | None (any authenticated role can call) | **VULNERABLE** | Missing RBAC: volunteers can trigger dispatches |
| `GET` | `/dashboard/reports` | `dashboard.py` | `optional_verify_token` | None | **VULNERABLE** | Critical: leaks live GPS coordinates and phone numbers |
| `GET` | `/dashboard` | `dashboard.py` | `optional_verify_token` | None | **SAFE** | Aggregate statistics |
| `GET` | `/stats` | `stats.py` | None | None | **SAFE** | Public community telemetry stats |

---

## 5. Existing Test Coverage & Missing Security Regression Tests

### 5.1 Existing Security Tests (`tests/test_auth_security.py`)
- **What is covered:**
  - Password registration & login for volunteers (`test_authenticated_volunteer_success`).
  - NGO OTP generation & verification flow (`test_authenticated_ngo_success`).
  - Rejection of volunteers calling `/match` and `/match/debug` (`test_wrong_role_matching_rejection`).
  - Cross-volunteer assignment access check when volunteer token is passed (`test_volunteer_access_another_volunteer_assignments_rejection`).
  - Cross-NGO dashboard access check when NGO token is passed (`test_ngo_access_another_ngo_dashboard_rejection`).
  - Expired token and bad token rejection (`test_expired_or_invalid_token_rejection`).
  - OTP expiry and 5-attempt brute-force lockout (`test_otp_expired_check`, `test_otp_wrong_too_many_times`).
  - Public webhook Tier 1 promotion denial (`test_volunteer_unauthorized_tier1_promotion_rejection`).
- **Deficiencies of the Existing Suite:**
  - Requires a live server running on `127.0.0.1:8080`; cannot run as a standalone unit test.
  - `test_unauthenticated_request` in `tests/test_auth_security.py` actually asserts that `GET /dashboard`, `GET /dashboard/reports`, `GET /volunteers`, and `POST /assignment/volunteer/dummy` return `401`. In the actual codebase, these endpoints return `200` because they use `optional_verify_token` or fallback IDs. **The existing test currently fails against the actual implementation.**

### 5.2 Missing Security Regression Tests
1. **Unauthenticated Write Rejections:**
   - Test verifying `POST /ngo/{ngo_id}/inventory` and `POST /ngos/{ngo_id}/inventory` reject requests without a token (401).
   - Test verifying `POST /ngo/{ngo_id}/inventory` rejects a volunteer token (403).
   - Test verifying `POST /ngo/{ngo_id}/inventory` rejects NGO A modifying NGO B's inventory (403).
   - Test verifying `PATCH /assignments/{id}/resolve` rejects unauthenticated callers (401).
   - Test verifying `PATCH /assignments/{id}/resolve` rejects volunteers resolving an assignment not assigned to them (403).
   - Test verifying `PATCH /volunteer/{id}/availability` rejects unauthenticated callers and cross-volunteer callers (401/403).
2. **PII Masking Verification:**
   - Test verifying `GET /dashboard/reports` masks volunteer phone, volunteer coordinates, and reporter phone numbers for unauthenticated or non-coordinator callers.
   - Test verifying `GET /volunteer/{id}` masks email and phone for unauthenticated callers.
3. **RBAC on Matching & Coordination:**
   - Test verifying `POST /match/allocate/{need_id}` and `POST /match/coordinate/{need_id}` reject volunteer tokens (403).
4. **Database-Tier Tests:**
   - Supabase PostgREST RLS denial tests for `otps` and `volunteers_auth` using the `anon` key.

---

## 6. Prioritized Remediation Plan

### Phase 1: Immediate Critical Fixes (Application & Route Hardening)
1. **Enforce Strict Authentication on All State Mutators:**
   - Replace `optional_verify_token` with `verify_token` on:
     - `POST /ngo/{ngo_id}/inventory`
     - `POST /ngos/{ngo_id}/inventory`, `PATCH /ngos/{ngo_id}/inventory`
     - `PATCH /assignment/{id}/resolve`, `PATCH /assignments/{id}/resolve`
     - `PATCH /assignments/{id}/progress`, `PATCH /assignments/{id}/dispatch`
     - `PATCH /volunteer/{id}/availability`, `PATCH /volunteers/{id}/availability`
2. **Implement Role-Based Authorization Dependencies (RBAC):**
   - Create explicit FastAPI role dependencies in `backend/auth.py`:
     ```python
     def require_role(*allowed_roles):
         def dependency(token: dict = Depends(verify_token)):
             if token.get("role") not in allowed_roles:
                 raise HTTPException(status_code=403, detail="Forbidden: insufficient role")
             return token
         return dependency
     ```
   - Restrict inventory updates to `require_role("ngo", "system")` with strict ownership check (`token["uid"] == ngo_id`).
   - Restrict `/match/allocate` and `/match/coordinate` to `require_role("ngo", "system")`.
3. **Fix Assignment Resolution Authorization Logic:**
   - Require `token = Depends(verify_token)` on `resolve()`.
   - If `role == "volunteer"`, enforce `token["uid"] == volunteer_id`.
   - If `role == "ngo"`, verify the assigned volunteer belongs to the caller's NGO.
4. **Fix Volunteer Availability IDOR:**
   - In `PATCH /volunteer/{volunteer_id}/availability`, verify `token["role"] == "volunteer" and token["uid"] == volunteer_id` (or `role in ["ngo", "system"]`).

### Phase 2: Sensitive Data Protection & Cryptographic Hygiene
1. **Mask Public PII Feeds:**
   - On `GET /dashboard/reports`, `GET /need`, `GET /volunteer/{id}`, and `GET /ngo/{id}/dispatches`, redact phone numbers, emails, and exact live GPS coordinates when the caller lacks an authenticated coordinator/system token.
2. **Hash OTPs & Use Cryptographic PRNG:**
   - Update `send_otp_endpoint` to use `secrets.randbelow(900000) + 100000`.
   - Store SHA-256 hashes of OTPs in the `otps` table (`hashlib.sha256(otp.encode()).hexdigest()`) instead of cleartext.
3. **Distributed Rate Limiting:**
   - Migrate OTP rate-limiting and attempt counters from local Python process dictionaries to Redis or a PostgreSQL-backed rate-limit table with transactional row locks.

### Phase 3: Database Hardening (Supabase RLS)
1. **Enable Row Level Security (RLS) on All Tables:**
   ```sql
   ALTER TABLE otps ENABLE ROW LEVEL SECURITY;
   ALTER TABLE volunteers_auth ENABLE ROW LEVEL SECURITY;
   ALTER TABLE volunteers ENABLE ROW LEVEL SECURITY;
   ALTER TABLE ngos ENABLE ROW LEVEL SECURITY;
   ALTER TABLE ngo_inventory ENABLE ROW LEVEL SECURITY;
   ALTER TABLE needs_reports ENABLE ROW LEVEL SECURITY;
   ALTER TABLE ngo_allocations ENABLE ROW LEVEL SECURITY;
   ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
   ```
2. **Revoke Direct Data API Access for Sensitive Tables:**
   - Revoke `anon` and `authenticated` access to `otps` and `volunteers_auth`:
     ```sql
     REVOKE ALL ON TABLE otps FROM anon, authenticated;
     REVOKE ALL ON TABLE volunteers_auth FROM anon, authenticated;
     ```
   - Ensure external clients cannot read password hashes or OTPs via PostgREST.

### Phase 4: Frontend Route Guards
1. **Add Route Protection in React:**
   - Wrap `/ngo-dashboard`, `/volunteer-dashboard`, and `/dashboard` with an authentication guard component (`<ProtectedRoute requiredRole="...">`).
   - Bind dashboard views to the logged-in user's token identity instead of an unauthenticated dropdown switcher.
