# SETU Trust Engine V2 — Phase 1

Production-minded, deterministic validation, credibility scoring, and dispatch recommendation engine for **SETU**, a disaster response and resource-coordination platform focused specifically on:
1. **Food supplies** (meals, rations, water, bulk commodities)
2. **Transport** (food logistics, cargo, and passenger evacuation)

---

## 1. Purpose and Scope of Phase 1

Phase 1 provides a standalone, zero-dependency Python module (`database/verification.py`) that answers three distinct operational questions:

1. **Validity:** Is the submitted distress request structurally valid and complete?
2. **Credibility:** Given a valid request and available server-validated evidence, how credible does it appear?
3. **Dispatch Recommendation:** Based on the credibility tier, request severity, and confirmed resource availability, what action should the platform take?

### Core Architecture & Separation of Concerns

The engine maintains a strict distinction between:
- **Valid Data:** Structurally complete and adhering to unit/coordinate/phone rules.
- **Credible Information:** Mathematically scored based on reputation, corroboration, and consistency signals.
- **Independently Verified Information:** Corroborated by distinct, unlinked sources in close geographic/temporal proximity.
- **Dispatch Eligibility:** Passing pure policy rules based on credibility tier and severity.
- **Actual Resource Fulfilment:** Requiring confirmed inventory or volunteer/vehicle capacity.

> [!IMPORTANT]
> A high trust score is **not** proof that a report is genuine. A dispatch recommendation is **not** proof that resources are physically available.

---

## 2. Pipeline Stages

The engine executes in sequential stages:

```
+-------------------------------------------------------------+
|                      Incoming Request                       |
+-------------------------------------------------------------+
                               |
                               v
+-------------------------------------------------------------+
|               STAGE ONE: Validity Gates                     |
|  - Phone normalization (exactly 10 digits)                  |
|  - Coordinate bounds ([-90, 90], [-180, 180])               |
|  - Need-type integrity ('food' vs 'transport')              |
|  - Unit & quantity sanity limits per commodity type        |
+-------------------------------------------------------------+
            |                                  |
         [Valid]                            [Invalid]
            |                                  |
            v                                  v
+-------------------------+      +----------------------------+
| STAGE TWO: Scoring      |      | Return Validation Errors   |
| - Reporter Score (0-30) |      | (No score or dispatch      |
| - Corroboration (0-30)  |      |  recommendation computed)  |
| - Consistency (0-40)    |      +----------------------------+
| - Capped Penalties (0-30|
+-------------------------+
            |
            v
+-------------------------+
| STAGE THREE: Tiering    |
| - High   (75 - 100)     |
| - Medium (45 - 74)      |
| - Low    (0 - 44)       |
+-------------------------+
            |
            v
+-------------------------------------------------------------+
| STAGE FOUR: Dispatch Recommendation Policy                  |
| - High Tier + Confirmed Capacity -> auto_dispatch           |
| - High Tier without Capacity    -> human_review            |
| - Medium Tier                   -> human_review            |
| - Medium Tier + Critical        -> human_review (elevated) |
| - Low Tier                      -> hold_and_flag           |
| - Unknown Capacity              -> human_review / hold     |
+-------------------------------------------------------------+
```

### Stage 1: Validity Gates (`validate_need`)
- Rejects non-positive quantities (`qty <= 0`).
- Validates latitude in `[-90.0, 90.0]` and longitude in `[-180.0, 180.0]`. Coordinates `(0.0, 0.0)` are mathematically valid. Missing coordinates are never silently replaced with `(0, 0)`.
- Normalizes phone numbers with country/trunk codes (`+91`, `91`, leading `0`), whitespace, parentheses, and hyphens into exactly 10 digits.
- Enforces need-type specific fields:
  - Food: requires `item`, positive `quantity`, supported `unit`, valid phone, and location information (coordinates or `location_description`).
  - Transport: requires `pickup_location`, `destination_location`, `cargo_or_passenger_type`, valid phone, and location details.
- Validates severity against `{"low", "medium", "high", "critical"}`.
- Enforces unit-specific sanity thresholds (e.g., max 50,000 meals, 100,000 kg).

### Stage 2: Credibility Scoring (`calculate_trust_score`)
Calculates independent component scores:
- **Reporter Score (Max 30):**
  - Registered NGO or camp account: +15
  - Positive history of resolved reports: +10
  - Reserved signal: 0 (reserved for future calibration)
  - Unknown reporters: 0 (never penalized for being new/unknown)
- **Corroboration Score (Max 30):**
  - 0 independent qualifying matches: 0
  - 1 independent qualifying match: +15
  - 2+ independent qualifying matches: +30
  - Rules: Same need type, distance $\le 3\text{ km}$ via Haversine formula, time window within previous 3 hours, distinct reporter phone, valid coordinates on both records, duplicates excluded. Reports from the same phone only count as 1 independent source.
- **Consistency Score (Max 40):**
  - AI extraction consistency: Caller-supplied 0–10 score multiplied by 2 (Max 20).
  - Deterministic location consistency: +10 if verified, 0 if unverified/unavailable.
  - Deterministic quantity plausibility: +10 if plausible, 0 if implausible/unavailable.
- **Penalties (Max total deduction 30):**
  - Identical normalized text hash: −15
  - Rate limit (> 3 reports in 1 hour from same phone): −15
  - Flagged reporter history: −15
  - Combined deductions capped strictly at 30.

### Stage 3: Credibility Tier (`assign_trust_tier`)
- **High:** Score 75–100
- **Medium:** Score 45–74
- **Low:** Score 0–44
- Clamped strictly to `[0, 100]`. Out-of-range inputs raise `ValueError`.

### Stage 4: Dispatch Recommendation Policy (`recommend_dispatch`)
Pure advisory policy function that does **not** perform I/O, volunteer matching, or notification sending:
- **High Tier:**
  - Food + confirmed capacity $\rightarrow$ `auto_dispatch`
  - Transport + confirmed capacity $\rightarrow$ `auto_dispatch`
  - Capacity unavailable or unknown $\rightarrow$ `human_review` (never marks dispatched without verified capacity)
- **Medium Tier:**
  - Normal $\rightarrow$ `human_review` (`priority=normal`)
  - Critical severity $\rightarrow$ `human_review` (`priority=elevated`)
- **Low Tier:**
  - Always $\rightarrow$ `hold_and_flag` (`priority=low` or `normal`)

---

## 3. Scoring Formula

$$\text{Final Score} = \min\left(100, \max\left(0, \text{Reporter} + \text{Corroboration} + \text{Consistency} - \min(30, \text{Penalties})\right)\right)$$

| Component | Max Points | Signals & Criteria |
| :--- | :---: | :--- |
| **Reporter** | 30 | Registered NGO/Camp (+15), Resolved history (+10), Reserved (+0) |
| **Corroboration** | 30 | 1 match (+15), 2+ matches (+30) within 3km and 3h |
| **Consistency** | 40 | AI consistency (0–20), Location consistency (+10), Quantity plausibility (+10) |
| **Penalties** | (30) | Duplicate hash (−15), Rate limit >3/h (−15), Flagged history (−15) |

---

## 4. Evidence Contract (Caller Responsibilities)

The caller must explicitly provide server-verified evidence in `EvidenceInput`. Missing evidence (`None`) is treated as unavailable (0 points awarded), **never** as proof of fraud:

| Field | Type | Description |
| :--- | :--- | :--- |
| `is_registered_ngo_or_camp` | `Optional[bool]` | Server-validated NGO or camp account flag |
| `has_resolved_history` | `Optional[bool]` | Whether reporter has previously resolved reports |
| `is_flagged_history` | `Optional[bool]` | Whether reporter has confirmed fraud/spam history |
| `ai_consistency` | `Optional[float]` | Score from 0.0 to 10.0 indicating AI extraction coherence |
| `ai_source` | `Optional[str]` | Model or system identifier producing AI consistency |
| `location_consistent` | `Optional[bool]` | Deterministic GIS / administrative boundary match |
| `quantity_plausible` | `Optional[bool]` | Plausibility flag based on demographic/need context |
| `is_identical_text` | `Optional[bool]` | Hash match indicating duplicated text content |
| `recent_reports_count_one_hour` | `Optional[int]` | Total reports submitted from reporter phone in last 60m |
| `candidates` | `List[CorroborationCandidate]` | Nearby candidates for corroboration checks |
| `reference_time` | `Optional[datetime]` | Explicit UTC timestamp for deterministic evaluations |
| `capacity_available` | `Optional[bool]` | Confirmed warehouse inventory or vehicle/responder availability |

---

## 5. What Phase 1 Deliberately Does NOT Implement

To maintain production safety, testability, and strict boundaries:
- ❌ **No database queries:** All evidence, candidates, and reference timestamps are injected by the caller.
- ❌ **No AI API calls:** LLM evaluations are validated caller inputs, not engine network requests.
- ❌ **No SMS/OTP verification:** Phone numbers are structurally validated and masked; identity verification happens upstream.
- ❌ **No volunteer assignment or alert dispatch:** Recommendations are purely advisory data structures.
- ❌ **No weather or external network API calls.**

---

## 6. Installation & Development

### Prerequisites
- Python 3.11+
- Standard Library only for runtime (`math`, `hashlib`, `dataclasses`, `datetime`, `enum`)

### Development Setup
```bash
# Clone and navigate to repository root
git clone <repo-url>
cd <repo-folder>

# Create and activate virtual environment
python -m venv venv
# Windows:
venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

# Install testing dependencies
pip install pytest
```

### Running Tests
```bash
# Run verification unit test suite (41 tests)
pytest tests/test_verification.py -v

# Run database tests (53 tests)
pytest database/test_database.py -v

# Run AI extraction & persistence tests (18 tests)
pytest tests/test_ai_extraction_persistence.py -v

# Run Phase 2 Trust Integration suite (15 tests)
pytest tests/test_trust_integration.py -v

# Run MVP golden path tests (7 tests)
pytest tests/test_mvp_golden_path.py -v
```

---

## 7. Phase 2 Pipeline & Database Integration

Phase 2 connects the Trust Engine directly into SETU's emergency intake and dispatch pipeline:

1. **Server-Side Evidence Gathering (`database/needs_db.py`):**
   - `check_reporter_reputation(phone)`: Resolves verified NGO status (+15), resolved history (+10), or flagged history (-15).
   - `check_duplicate_and_rate_limit(phone, text)`: Deduplicates identical descriptions (-15) and rate-limits burst submissions (>3/hr, -15).
   - `get_corroboration_candidates(...)`: Queries reports within 3 hours matching need type (`food` or `transport`), excluding the reporter's phone.
   - `save_need(...)`: Persists full trust metadata (`trust_score`, `trust_tier`, `dispatch_action`, `priority`, `engine_version`, `text_hash`, `trust_reasons`).

2. **Pre-Flight Capacity Verification:**
   - **Food Supplies:** `check_food_inventory_available(quantity, lat, lng)` verifies available stock in NGO inventories within radius.
   - **Transport:** `check_transport_capacity_available(lat, lng)` verifies available volunteers with vehicle tags within 50 km.
   - If capacity is unavailable or unknown, high-credibility reports are held for human review (`human_review`), preventing false promises.

3. **Safe Dispatch & Matcher Gating (`backend/routes/match.py`):**
   - `GET /match` strictly refuses to match needs with `trust_tier == 'low'`, `dispatch_action in ('hold_and_flag', 'human_review')`, or `status in ('flagged', 'secondary_review', 'rejected')`.
   - Automated notifications (`send_alert`) and volunteer dispatch are triggered **only** when `dispatch_action == 'auto_dispatch'`.

4. **Coordinator Review Endpoint (`POST /need/{need_id}/review`):**
   - Enables authenticated NGO coordinators and system administrators to review reports held in `secondary_review` or `flagged`.
   - Transitions approved reports to `open` (`coordinator_approved`) and triggers volunteer matching.
   - Transitions rejected reports to `rejected` (`coordinator_rejected`).

```python
from datetime import datetime, timedelta, timezone
from database.verification import (
    NeedRequest,
    EvidenceInput,
    CorroborationCandidate,
    validate_need,
    calculate_trust_score,
    recommend_dispatch,
    assign_trust_tier,
)

# 1. Construct distress request
request = NeedRequest(
    need_type="food",
    item="drinking water packets",
    quantity=500,
    unit="packets",
    reporter_phone="+91-98765-43210",
    latitude=26.8467,
    longitude=80.9462,
    severity="high",
    location_description="Sector 4 Community Relief Center",
)

# 2. Stage One: Validate structural integrity
validation = validate_need(request)
if not validation.valid:
    print(f"Validation failed: {validation.errors}")
    exit(1)

# 3. Prepare server-validated evidence
ref_time = datetime(2026, 10, 11, 10, 0, tzinfo=timezone.utc)
nearby_candidate = CorroborationCandidate(
    candidate_id="rep-102",
    need_type="food",
    reporter_phone="9123456780",
    timestamp=ref_time - timedelta(minutes=45),
    latitude=26.8500,
    longitude=80.9500,
)

evidence = EvidenceInput(
    is_registered_ngo_or_camp=True,
    has_resolved_history=True,
    ai_consistency=8.5,
    ai_source="gemini-1.5-flash",
    location_consistent=True,
    quantity_plausible=True,
    candidates=[nearby_candidate],
    reference_time=ref_time,
    capacity_available=True,  # Confirmed available stock
)

# 4. Stage Two: Calculate credibility and pure dispatch recommendation
result = calculate_trust_score(request, evidence)

# 5. Inspect explainable result
print(f"Valid:               {result.valid}")
print(f"Trust Score:         {result.trust_score} / 100")
print(f"Trust Tier:          {result.trust_tier}")
print(f"Dispatch Action:     {result.dispatch_action}")
print(f"Queue Priority:      {result.priority}")
print(f"Score Breakdown:     {result.component_breakdown}")
print(f"Applied Penalties:   {result.applied_penalties}")
print("\nExplainable Reasons:")
for reason in result.reasons:
    print(f"  • {reason}")
```

---

## 8. Known Limitations & Uncalibrated Starting Weights

1. **Uncalibrated Weights:** Starting weights (15 for NGO, 10 for history, 15/30 for corroboration) reflect initial engineering heuristics and require calibration against historical disaster telemetry.
2. **Corroboration Thresholds:** The fixed 3 km radius does not account for rural vs. dense urban topography.
3. **Time Window:** The 3-hour window is static and does not scale with prolonged disaster phases (e.g., slow-onset flooding).
4. **Reserved Signal:** 5 points in the reporter category remain intentionally unallocated until an explicit verified signal is defined.
