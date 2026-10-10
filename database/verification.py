"""SETU Trust Engine V2 — Phase 1: Pure Verification & Credibility Engine.

This module provides a standalone, deterministic verification and credibility
scoring engine for emergency resource coordination (food supplies and transport).

Architecture:
- Stage 1: Validity Gates (structural validity, phone normalization, unit & coordinate checks)
- Stage 2: Credibility Scoring (reporter reputation, geospatial & temporal corroboration,
           consistency checks, capped penalty deductions)
- Stage 3: Credibility Tier Assignment (pure threshold mapping: high, medium, low)
- Pure Policy: Dispatch Recommendation (pure advisory policy based on tier, severity,
               need type, and confirmed capacity availability)

No database queries, external network calls, or AI API invocations are performed.
"""

from __future__ import annotations

import hashlib
import math
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple, Union

try:
    from database.postgres_client import get_db_cursor
except Exception:
    get_db_cursor = None  # type: ignore


# =============================================================================
# ENUMS & CONSTANTS
# =============================================================================

class NeedType(str, Enum):
    """Supported need categories for SETU platform."""
    FOOD = "food"
    TRANSPORT = "transport"


class TrustTier(str, Enum):
    """Credibility tiers derived from clamped trust score."""
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class DispatchAction(str, Enum):
    """Pure advisory dispatch actions."""
    AUTO_DISPATCH = "auto_dispatch"
    HUMAN_REVIEW = "human_review"
    HOLD_AND_FLAG = "hold_and_flag"


class PriorityLevel(str, Enum):
    """Advisory queue priority levels."""
    LOW = "low"
    NORMAL = "normal"
    ELEVATED = "elevated"
    HIGH = "high"


# =============================================================================
# CENTRAL CONFIGURATION: TRUST_CONFIG
# =============================================================================

@dataclass(frozen=True)
class ReporterWeights:
    registered_ngo_or_camp: int = 15
    resolved_history: int = 10
    reserved_signal: int = 0
    max_score: int = 30


@dataclass(frozen=True)
class CorroborationWeights:
    one_match_score: int = 15
    two_plus_match_score: int = 30
    max_radius_km: float = 3.0
    time_window_hours: float = 3.0
    max_score: int = 30


@dataclass(frozen=True)
class ConsistencyWeights:
    ai_multiplier: float = 2.0
    max_ai_score: int = 20
    location_consistency_score: int = 10
    quantity_plausibility_score: int = 10
    max_score: int = 40


@dataclass(frozen=True)
class PenaltyWeights:
    identical_text_hash: int = 15
    rate_limit_exceeded: int = 15
    flagged_history: int = 15
    max_total_deduction: int = 30
    rate_limit_threshold_count: int = 3


@dataclass(frozen=True)
class TierBoundaries:
    high_threshold: int = 75
    medium_threshold: int = 45
    min_score: int = 0
    max_score: int = 100


@dataclass(frozen=True)
class TrustConfig:
    version: str = "2.0.0"
    reporter: ReporterWeights = field(default_factory=ReporterWeights)
    corroboration: CorroborationWeights = field(default_factory=CorroborationWeights)
    consistency: ConsistencyWeights = field(default_factory=ConsistencyWeights)
    penalties: PenaltyWeights = field(default_factory=PenaltyWeights)
    tiers: TierBoundaries = field(default_factory=TierBoundaries)
    supported_need_types: Tuple[str, ...] = ("food", "transport")
    allowed_severities: Tuple[str, ...] = ("low", "medium", "high", "critical")
    supported_food_units: Tuple[str, ...] = (
        "kg",
        "g",
        "grams",
        "kilograms",
        "liters",
        "l",
        "ml",
        "meals",
        "packets",
        "boxes",
        "cartons",
        "bags",
        "cans",
        "portions",
        "plates",
        "bottles",
        "items",
        "units",
        "quintals",
        "tonnes",
        "tons",
    )
    supported_transport_units: Tuple[str, ...] = (
        "trucks",
        "vehicles",
        "ambulances",
        "vans",
        "boats",
        "cars",
        "trips",
        "people",
        "passengers",
        "persons",
        "seats",
        "packages",
        "boxes",
        "tons",
        "kg",
    )
    unit_sanity_limits: Dict[str, float] = field(
        default_factory=lambda: {
            "meals": 50000.0,
            "packets": 50000.0,
            "portions": 50000.0,
            "plates": 50000.0,
            "bottles": 50000.0,
            "items": 50000.0,
            "units": 50000.0,
            "kg": 100000.0,
            "kilograms": 100000.0,
            "g": 50000000.0,
            "grams": 50000000.0,
            "liters": 50000.0,
            "l": 50000.0,
            "ml": 50000000.0,
            "boxes": 10000.0,
            "cartons": 10000.0,
            "bags": 50000.0,
            "cans": 50000.0,
            "quintals": 1000.0,
            "tonnes": 500.0,
            "tons": 500.0,
            "trucks": 1000.0,
            "vehicles": 1000.0,
            "ambulances": 500.0,
            "vans": 1000.0,
            "boats": 500.0,
            "cars": 1000.0,
            "trips": 10000.0,
            "people": 10000.0,
            "passengers": 10000.0,
            "persons": 10000.0,
            "seats": 10000.0,
        }
    )


# Exactly one central configuration object
TRUST_CONFIG = TrustConfig()


# =============================================================================
# DATA MODELS
# =============================================================================

@dataclass
class NeedRequest:
    """Input distress request representation."""
    need_type: Union[str, NeedType]
    reporter_phone: str
    item: Optional[str] = None
    quantity: Optional[Union[float, int]] = None
    unit: Optional[str] = None
    reporter_id: Optional[str] = None
    pickup_location: Optional[str] = None
    destination_location: Optional[str] = None
    cargo_or_passenger_type: Optional[str] = None
    location_description: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    severity: str = "medium"
    description: Optional[str] = None
    text_hash: Optional[str] = None
    request_id: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        if isinstance(d.get("need_type"), Enum):
            d["need_type"] = d["need_type"].value
        return d


@dataclass
class CorroborationCandidate:
    """Historical or concurrent candidate report evaluated for corroboration."""
    candidate_id: str
    need_type: Union[str, NeedType]
    reporter_phone: str
    timestamp: datetime
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    is_duplicate: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "candidate_id": self.candidate_id,
            "need_type": str(self.need_type.value if isinstance(self.need_type, Enum) else self.need_type),
            "reporter_phone": self.reporter_phone,
            "timestamp": self.timestamp.isoformat() if isinstance(self.timestamp, datetime) else str(self.timestamp),
            "latitude": self.latitude,
            "longitude": self.longitude,
            "is_duplicate": self.is_duplicate,
        }


@dataclass
class EvidenceInput:
    """External evidence supplied by server-validated sources."""
    is_registered_ngo_or_camp: Optional[bool] = None
    has_resolved_history: Optional[bool] = None
    is_flagged_history: Optional[bool] = None
    flagged_deduction: Optional[int] = None
    ai_consistency: Optional[float] = None  # Scale 0.0 - 10.0
    ai_source: Optional[str] = None
    location_consistent: Optional[bool] = None
    quantity_plausible: Optional[bool] = None
    is_identical_text: Optional[bool] = None
    recent_reports_count_one_hour: Optional[int] = None
    candidates: List[CorroborationCandidate] = field(default_factory=list)
    reference_time: Optional[datetime] = None
    capacity_available: Optional[bool] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "is_registered_ngo_or_camp": self.is_registered_ngo_or_camp,
            "has_resolved_history": self.has_resolved_history,
            "is_flagged_history": self.is_flagged_history,
            "flagged_deduction": self.flagged_deduction,
            "ai_consistency": self.ai_consistency,
            "ai_source": self.ai_source,
            "location_consistent": self.location_consistent,
            "quantity_plausible": self.quantity_plausible,
            "is_identical_text": self.is_identical_text,
            "recent_reports_count_one_hour": self.recent_reports_count_one_hour,
            "candidates_count": len(self.candidates),
            "reference_time": self.reference_time.isoformat() if self.reference_time else None,
            "capacity_available": self.capacity_available,
        }


@dataclass
class ValidationResult:
    """Result of Stage One structural validation."""
    valid: bool
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class DispatchRecommendation:
    """Pure policy recommendation output."""
    action: str
    priority: str
    reasons: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class TrustResult:
    """Comprehensive credibility assessment and dispatch policy result."""
    valid: bool
    trust_score: Optional[int] = None
    trust_tier: Optional[str] = None
    dispatch_action: Optional[str] = None
    priority: Optional[str] = None
    reasons: List[str] = field(default_factory=list)
    component_breakdown: Dict[str, Any] = field(default_factory=dict)
    applied_penalties: Dict[str, int] = field(default_factory=dict)
    validation_errors: List[str] = field(default_factory=list)
    validation_warnings: List[str] = field(default_factory=list)
    engine_version: str = TRUST_CONFIG.version
    metadata: Dict[str, Any] = field(default_factory=dict)

    def __getitem__(self, key: str) -> Any:
        if key == "score":
            return self.trust_score
        d = self.to_dict()
        if key in d:
            return d[key]
        return getattr(self, key)

    def get(self, key: str, default: Any = None) -> Any:
        if key == "score":
            return self.trust_score if self.trust_score is not None else default
        d = self.to_dict()
        if key in d:
            return d[key]
        return getattr(self, key, default)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "valid": self.valid,
            "trust_score": self.trust_score,
            "score": self.trust_score,
            "trust_tier": self.trust_tier,
            "dispatch_action": self.dispatch_action,
            "priority": self.priority,
            "reasons": list(self.reasons),
            "component_breakdown": dict(self.component_breakdown),
            "applied_penalties": dict(self.applied_penalties),
            "validation_errors": list(self.validation_errors),
            "validation_warnings": list(self.validation_warnings),
            "engine_version": self.engine_version,
            "metadata": dict(self.metadata),
        }


# =============================================================================
# PURE UTILITY & NORMALIZATION HELPERS
# =============================================================================

def normalize_phone(phone: Any) -> Optional[str]:
    """Normalize phone string to exactly 10 numeric digits.

    Handles common prefixes (+91, 91, 0) and formatting characters (spaces, dashes, parentheses).
    Returns None if the phone cannot be normalized to exactly 10 digits.
    """
    if phone is None:
        return None
    raw = str(phone).strip()
    if not raw:
        return None

    # Strip formatting separators
    cleaned = (
        raw.replace(" ", "")
        .replace("-", "")
        .replace("(", "")
        .replace(")", "")
        .replace(".", "")
    )

    # Handle international prefixes
    if cleaned.startswith("+91"):
        cleaned = cleaned[3:]
    elif cleaned.startswith("0") and len(cleaned) == 11:
        cleaned = cleaned[1:]
    elif cleaned.startswith("91") and len(cleaned) == 12:
        cleaned = cleaned[2:]

    # Final check: exactly 10 digits
    if cleaned.isdigit() and len(cleaned) == 10:
        return cleaned
    return None


def mask_phone(phone: Any) -> str:
    """Mask phone number for privacy preservation in reasons and logs."""
    normalized = normalize_phone(phone)
    if normalized:
        return f"******{normalized[-4:]}"
    raw = str(phone or "").strip()
    if len(raw) >= 4:
        return f"{'*' * (len(raw) - 4)}{raw[-4:]}"
    return "****"


def compute_text_hash(text: Optional[str]) -> str:
    """Deterministic normalized text hash for deduplication detection."""
    norm = " ".join(str(text or "").strip().lower().split())
    return hashlib.sha256(norm.encode("utf-8")).hexdigest()


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great-circle distance between two points on Earth using Haversine."""
    r = 6371.0  # Earth radius in kilometers
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return r * c


def _is_valid_coord_value(lat: Any, lon: Any) -> bool:
    """Validate latitude [-90, 90] and longitude [-180, 180].

    Note: (0.0, 0.0) is mathematically valid.
    """
    try:
        lat_f = float(lat)
        lon_f = float(lon)
    except (TypeError, ValueError):
        return False
    return -90.0 <= lat_f <= 90.0 and -180.0 <= lon_f <= 180.0


# =============================================================================
# STAGE ONE — VALIDITY GATES
# =============================================================================

def validate_need(request: NeedRequest) -> ValidationResult:
    """Validate structural integrity and completeness of a distress request.

    Does NOT calculate trust points or recommend dispatch.
    """
    errors: List[str] = []
    warnings: List[str] = []

    # 1. Need Type Validation
    raw_type = str(request.need_type.value if isinstance(request.need_type, Enum) else request.need_type).strip().lower()
    if raw_type not in TRUST_CONFIG.supported_need_types:
        errors.append(f"need type '{raw_type}' is unsupported; must be 'food' or 'transport'")

    # 2. Phone Validation
    normalized_phone = normalize_phone(request.reporter_phone)
    if not normalized_phone:
        errors.append("phone must contain exactly 10 digits")

    # 3. Coordinate Boundary Validation
    has_lat = request.latitude is not None
    has_lon = request.longitude is not None
    if has_lat != has_lon:
        errors.append("both latitude and longitude must be provided together")
    elif has_lat and has_lon:
        try:
            lat_f = float(request.latitude)  # type: ignore[arg-type]
            if not (-90.0 <= lat_f <= 90.0):
                errors.append(f"latitude must be between -90 and 90, got {lat_f}")
        except (TypeError, ValueError):
            errors.append("latitude must be a valid numeric coordinate")

        try:
            lon_f = float(request.longitude)  # type: ignore[arg-type]
            if not (-180.0 <= lon_f <= 180.0):
                errors.append(f"longitude must be between -180 and 180, got {lon_f}")
        except (TypeError, ValueError):
            errors.append("longitude must be a valid numeric coordinate")

    # 4. Severity Validation
    raw_severity = str(request.severity or "medium").strip().lower()
    if raw_severity not in TRUST_CONFIG.allowed_severities:
        errors.append(f"invalid severity '{raw_severity}'; must be one of {TRUST_CONFIG.allowed_severities}")

    # 5. Food-Specific Validation
    if raw_type == NeedType.FOOD.value:
        if not request.item or not str(request.item).strip():
            errors.append("food item is required")

        if request.quantity is None:
            errors.append("quantity is required")
        else:
            try:
                qty_f = float(request.quantity)
                if qty_f <= 0:
                    errors.append("quantity must be greater than zero")
                else:
                    # Sanity limit check
                    if request.unit:
                        unit_norm = str(request.unit).strip().lower()
                        if unit_norm in TRUST_CONFIG.unit_sanity_limits:
                            limit = TRUST_CONFIG.unit_sanity_limits[unit_norm]
                            if qty_f > limit:
                                errors.append(f"quantity {qty_f} exceeds sanity limit of {int(limit)} for unit '{unit_norm}'")
            except (TypeError, ValueError):
                errors.append("quantity must be a valid number")

        if not request.unit or not str(request.unit).strip():
            errors.append("unit is required")
        else:
            unit_norm = str(request.unit).strip().lower()
            if unit_norm not in TRUST_CONFIG.supported_food_units:
                errors.append(f"unsupported unit '{unit_norm}' for food")

        # Location requirement for food: either geocoded coords or text location
        has_location_text = bool(request.location_description and str(request.location_description).strip())
        has_coords = has_lat and has_lon and _is_valid_coord_value(request.latitude, request.longitude)
        if not has_location_text and not has_coords:
            errors.append("location information is required (provide location_description or valid coordinates)")

    # 6. Transport-Specific Validation
    elif raw_type == NeedType.TRANSPORT.value:
        if not request.pickup_location or not str(request.pickup_location).strip():
            errors.append("transport pickup location is required")

        if not request.destination_location or not str(request.destination_location).strip():
            errors.append("transport destination location is required")

        if not request.cargo_or_passenger_type or not str(request.cargo_or_passenger_type).strip():
            errors.append("cargo or passenger type is required")

        if request.quantity is not None:
            try:
                qty_t = float(request.quantity)
                if qty_t <= 0:
                    errors.append("quantity must be greater than zero")
                elif request.unit:
                    unit_t = str(request.unit).strip().lower()
                    if unit_t in TRUST_CONFIG.unit_sanity_limits:
                        limit_t = TRUST_CONFIG.unit_sanity_limits[unit_t]
                        if qty_t > limit_t:
                            errors.append(f"quantity {qty_t} exceeds sanity limit of {int(limit_t)} for unit '{unit_t}'")
            except (TypeError, ValueError):
                errors.append("quantity must be a valid number")

        if request.unit:
            unit_t = str(request.unit).strip().lower()
            if unit_t not in TRUST_CONFIG.supported_transport_units:
                errors.append(f"unsupported unit '{unit_t}' for transport")

    return ValidationResult(
        valid=len(errors) == 0,
        errors=errors,
        warnings=warnings,
    )


# =============================================================================
# STAGE THREE — CREDIBILITY TIER MAPPING
# =============================================================================

def assign_trust_tier(score: int) -> TrustTier:
    """Map a clamped integer trust score (0-100) to its credibility tier.

    Thresholds:
    - 75 - 100: HIGH
    - 45 - 74: MEDIUM
    - 0 - 44: LOW

    Raises ValueError if score is out of the valid range [0, 100].
    """
    if score < TRUST_CONFIG.tiers.min_score or score > TRUST_CONFIG.tiers.max_score:
        raise ValueError(
            f"Score {score} is out of the valid range {TRUST_CONFIG.tiers.min_score}-{TRUST_CONFIG.tiers.max_score}"
        )
    if score >= TRUST_CONFIG.tiers.high_threshold:
        return TrustTier.HIGH
    if score >= TRUST_CONFIG.tiers.medium_threshold:
        return TrustTier.MEDIUM
    return TrustTier.LOW


# =============================================================================
# STAGE FOUR — DISPATCH RECOMMENDATION POLICY
# =============================================================================

def recommend_dispatch(
    trust_tier: Union[TrustTier, str],
    severity: str,
    need_type: Union[NeedType, str],
    capacity_available: Optional[bool] = None,
) -> DispatchRecommendation:
    """Pure advisory dispatch policy function.

    Must never assign volunteers, mutate databases, or perform I/O.
    """
    tier_str = trust_tier.value if isinstance(trust_tier, Enum) else str(trust_tier).lower()
    sev_norm = str(severity or "medium").strip().lower()
    need_norm = need_type.value if isinstance(need_type, Enum) else str(need_type).strip().lower()

    reasons: List[str] = []

    # 1. Low Credibility Tier: Always hold and flag
    if tier_str == TrustTier.LOW.value:
        reasons.append("Low credibility tier: held and flagged for investigation")
        return DispatchRecommendation(
            action=DispatchAction.HOLD_AND_FLAG.value,
            priority=PriorityLevel.LOW.value if sev_norm == "low" else PriorityLevel.NORMAL.value,
            reasons=reasons,
        )

    # 2. Medium Credibility Tier: Always requires human review
    if tier_str == TrustTier.MEDIUM.value:
        if sev_norm == "critical":
            reasons.append("Medium credibility tier requires human review; Critical severity elevates review priority")
            return DispatchRecommendation(
                action=DispatchAction.HUMAN_REVIEW.value,
                priority=PriorityLevel.ELEVATED.value,
                reasons=reasons,
            )
        reasons.append("Medium credibility tier: human review recommended before dispatch")
        return DispatchRecommendation(
            action=DispatchAction.HUMAN_REVIEW.value,
            priority=PriorityLevel.NORMAL.value,
            reasons=reasons,
        )

    # 3. High Credibility Tier:
    # Gated strictly on capacity confirmation
    if capacity_available is None:
        reasons.append("High credibility tier, but Capacity availability is unknown; human review required before dispatch")
        return DispatchRecommendation(
            action=DispatchAction.HUMAN_REVIEW.value,
            priority=PriorityLevel.NORMAL.value,
            reasons=reasons,
        )

    if capacity_available is False:
        reasons.append("High credibility tier, but confirmed capacity is currently unavailable; routing to human review")
        return DispatchRecommendation(
            action=DispatchAction.HUMAN_REVIEW.value,
            priority=PriorityLevel.NORMAL.value,
            reasons=reasons,
        )

    # High tier with confirmed capacity
    if need_norm == NeedType.FOOD.value:
        reasons.append("High credibility food request with confirmed inventory capacity recommended for auto-dispatch")
        return DispatchRecommendation(
            action=DispatchAction.AUTO_DISPATCH.value,
            priority=PriorityLevel.NORMAL.value,
            reasons=reasons,
        )

    if need_norm == NeedType.TRANSPORT.value:
        reasons.append("High credibility transport request with confirmed vehicle/volunteer capacity recommended for auto-dispatch")
        return DispatchRecommendation(
            action=DispatchAction.AUTO_DISPATCH.value,
            priority=PriorityLevel.NORMAL.value,
            reasons=reasons,
        )

    # Fallback for unexpected need type
    reasons.append("Human review recommended due to unspecified need type configuration")
    return DispatchRecommendation(
        action=DispatchAction.HUMAN_REVIEW.value,
        priority=PriorityLevel.NORMAL.value,
        reasons=reasons,
    )


# =============================================================================
# STAGE TWO — CREDIBILITY SCORING ENGINE
# =============================================================================

def _evaluate_corroboration(
    request: NeedRequest,
    evidence: EvidenceInput,
) -> Tuple[int, int, List[str]]:
    """Pure helper to evaluate corroborating candidate reports.

    Returns:
        (corroboration_score, qualifying_count, reasons)
    """
    reasons: List[str] = []
    cfg = TRUST_CONFIG.corroboration

    req_lat = request.latitude
    req_lon = request.longitude
    req_phone = normalize_phone(request.reporter_phone)
    req_type = str(request.need_type.value if isinstance(request.need_type, Enum) else request.need_type).strip().lower()

    # Coordinates on current request are mandatory for distance calculation
    if req_lat is None or req_lon is None or not _is_valid_coord_value(req_lat, req_lon):
        reasons.append("+0: Corroboration unavailable because request lacks valid geocoded coordinates")
        return 0, 0, reasons

    if not evidence.candidates:
        reasons.append("+0: Corroboration: 0 qualifying independent matches found")
        return 0, 0, reasons

    # Reference timestamp for deterministic evaluation
    ref_time = evidence.reference_time or datetime.now(timezone.utc)
    if ref_time.tzinfo is None:
        ref_time = ref_time.replace(tzinfo=timezone.utc)

    qualifying_phones: set[str] = set()
    qualifying_candidates: List[CorroborationCandidate] = []

    for cand in evidence.candidates:
        # 1. Candidate must not be marked as duplicate
        if cand.is_duplicate:
            continue

        # 2. Need type must match
        cand_type = str(cand.need_type.value if isinstance(cand.need_type, Enum) else cand.need_type).strip().lower()
        if cand_type != req_type:
            continue

        # 3. Candidate coordinates must be valid
        if cand.latitude is None or cand.longitude is None or not _is_valid_coord_value(cand.latitude, cand.longitude):
            continue

        # 4. Candidate phone must normalize and must NOT match current reporter's phone
        cand_phone = normalize_phone(cand.reporter_phone)
        if not cand_phone or cand_phone == req_phone:
            continue

        # 5. Timestamp must fall within previous 3 hours relative to reference time
        cand_time = cand.timestamp
        if cand_time.tzinfo is None:
            cand_time = cand_time.replace(tzinfo=timezone.utc)

        time_delta_sec = (ref_time - cand_time).total_seconds()
        if time_delta_sec < 0 or time_delta_sec > cfg.time_window_hours * 3600:
            continue

        # 6. Haversine distance must be <= 3.0 km
        dist_km = haversine_distance_km(float(req_lat), float(req_lon), float(cand.latitude), float(cand.longitude))
        if dist_km > cfg.max_radius_km:
            continue

        # Candidate qualifies
        qualifying_candidates.append(cand)
        qualifying_phones.add(cand_phone)

    # Independent sources count by distinct phone numbers
    independent_count = len(qualifying_phones)
    if independent_count >= 2:
        score = cfg.two_plus_match_score
        reasons.append(f"+{score}: Corroboration: {independent_count} independent reports found within {cfg.max_radius_km}km in past {int(cfg.time_window_hours)}h")
    elif independent_count == 1:
        score = cfg.one_match_score
        reasons.append(f"+{score}: Corroboration: 1 independent report found within {cfg.max_radius_km}km in past {int(cfg.time_window_hours)}h")
    else:
        score = 0
        reasons.append("+0: Corroboration: 0 qualifying independent matches found")

    return score, independent_count, reasons


def calculate_trust_score(
    request: Union[NeedRequest, Dict[str, Any]],
    evidence: Optional[Union[EvidenceInput, Dict[str, Any], int, float]] = None,
    # Legacy adapter parameters
    corroboration: Optional[Any] = None,
    category: Optional[str] = None,
    disaster_type: str = "",
    base_score: int = 20,
    *,
    ai_consistency: Optional[Any] = None,
    corroborating_reports_count: Optional[Any] = None,
    ai_category: Optional[str] = None,
    consistency: Optional[Any] = None,
) -> Union[TrustResult, Dict[str, Any]]:
    """Execute validity gating and credibility scoring.

    If request is structurally invalid, stops and returns an invalid TrustResult
    without score or dispatch recommendation.
    """
    # -------------------------------------------------------------------------
    # Legacy adapter path (for existing codebase compatibility)
    # -------------------------------------------------------------------------
    if isinstance(request, dict) and (
        isinstance(evidence, (int, float))
        or corroborating_reports_count is not None
        or ai_consistency is not None
        or consistency is not None
        or corroboration is not None
    ):
        c_val = evidence if isinstance(evidence, (int, float)) else (ai_consistency if ai_consistency is not None else (consistency or 5))
        corrob_val = corroborating_reports_count if corroborating_reports_count is not None else (corroboration or 0)
        cat_val = ai_category or category or request.get("category", "other")
        return _legacy_calculate_trust_score(
            data_dict=request,
            ai_consistency=c_val,
            corroborating_reports_count=corrob_val,
            ai_category=cat_val,
            base_score=base_score,
            disaster_type=disaster_type,
        )

    # -------------------------------------------------------------------------
    # Convert dict to NeedRequest if caller passed raw dict
    # -------------------------------------------------------------------------
    if isinstance(request, dict):
        req_obj = NeedRequest(
            need_type=request.get("need_type", request.get("category", "food")),
            reporter_phone=str(request.get("reporter_phone", "")),
            item=request.get("item"),
            quantity=request.get("quantity"),
            unit=request.get("unit"),
            reporter_id=request.get("reporter_id"),
            pickup_location=request.get("pickup_location"),
            destination_location=request.get("destination_location"),
            cargo_or_passenger_type=request.get("cargo_or_passenger_type"),
            location_description=request.get("location_description"),
            latitude=request.get("latitude", request.get("lat")),
            longitude=request.get("longitude", request.get("lng")),
            severity=request.get("severity", "medium"),
            description=request.get("description"),
            text_hash=request.get("text_hash"),
            request_id=request.get("request_id"),
        )
    else:
        req_obj = request

    ev_obj = evidence if isinstance(evidence, EvidenceInput) else EvidenceInput()

    # -------------------------------------------------------------------------
    # STAGE ONE: VALIDITY GATES
    # -------------------------------------------------------------------------
    validation = validate_need(req_obj)
    if not validation.valid:
        norm_phone = normalize_phone(req_obj.reporter_phone)
        masked_ph = mask_phone(norm_phone) if norm_phone else "****"
        return TrustResult(
            valid=False,
            trust_score=None,
            trust_tier=None,
            dispatch_action=None,
            priority=None,
            reasons=[f"Validation failed: {err}" for err in validation.errors],
            component_breakdown={},
            applied_penalties={},
            validation_errors=validation.errors,
            validation_warnings=validation.warnings,
            engine_version=TRUST_CONFIG.version,
            metadata={"masked_reporter_phone": masked_ph},
        )

    # -------------------------------------------------------------------------
    # STAGE TWO: CREDIBILITY SCORING
    # -------------------------------------------------------------------------
    reasons: List[str] = []
    metadata: Dict[str, Any] = {}
    applied_penalties: Dict[str, int] = {}

    norm_phone = normalize_phone(req_obj.reporter_phone)
    metadata["masked_reporter_phone"] = mask_phone(norm_phone)

    # 1. Reporter Credibility Component (Max 30)
    rep_cfg = TRUST_CONFIG.reporter
    rep_score = 0

    if ev_obj.is_registered_ngo_or_camp is True:
        rep_score += rep_cfg.registered_ngo_or_camp
        reasons.append(f"+{rep_cfg.registered_ngo_or_camp}: Reporter verified as registered NGO or camp account")
    elif ev_obj.is_registered_ngo_or_camp is False:
        reasons.append("+0: Reporter is not a registered NGO or camp account")
    else:
        reasons.append("+0: Registered NGO/camp evidence unavailable")

    if ev_obj.has_resolved_history is True:
        rep_score += rep_cfg.resolved_history
        reasons.append(f"+{rep_cfg.resolved_history}: Positive reporter history of resolved reports")
    elif ev_obj.has_resolved_history is False:
        reasons.append("+0: No positive history of resolved reports")
    else:
        reasons.append("+0: Resolved report history evidence unavailable")

    # Reserved signal: 0 points until formally defined
    rep_score = min(rep_score, rep_cfg.max_score)

    # 2. Corroboration Component (Max 30)
    corrob_score, qualifying_count, corrob_reasons = _evaluate_corroboration(req_obj, ev_obj)
    reasons.extend(corrob_reasons)

    # 3. Consistency Component (Max 40)
    cons_cfg = TRUST_CONFIG.consistency
    ai_points = 0
    loc_points = 0
    qty_points = 0

    # AI Extraction Consistency (0-10 -> scaled x2 to max 20)
    if ev_obj.ai_consistency is not None:
        try:
            ai_val = float(ev_obj.ai_consistency)
            if 0.0 <= ai_val <= 10.0:
                ai_points = min(int(round(ai_val * cons_cfg.ai_multiplier)), cons_cfg.max_ai_score)
                src_note = f" (source: {ev_obj.ai_source})" if ev_obj.ai_source else ""
                reasons.append(f"+{ai_points}: AI extraction consistency ({ai_val}/10){src_note}")
            else:
                reasons.append(f"+0: Invalid AI consistency input ({ai_val}); must be between 0 and 10")
        except (TypeError, ValueError):
            reasons.append("+0: Invalid AI consistency input; must be numeric")
    else:
        reasons.append("+0: AI consistency evidence unavailable")

    # Deterministic Location Consistency (Max 10)
    if ev_obj.location_consistent is True:
        loc_points = cons_cfg.location_consistency_score
        reasons.append(f"+{loc_points}: Deterministic location consistency confirmed")
    elif ev_obj.location_consistent is False:
        reasons.append("+0: Deterministic location check flagged inconsistency")
    else:
        reasons.append("+0: Location consistency evidence unavailable")

    # Deterministic Quantity Plausibility (Max 10)
    if ev_obj.quantity_plausible is True:
        qty_points = cons_cfg.quantity_plausibility_score
        reasons.append(f"+{qty_points}: Deterministic quantity plausibility confirmed")
    elif ev_obj.quantity_plausible is False:
        reasons.append("+0: Deterministic quantity check flagged implausibility")
    else:
        reasons.append("+0: Quantity plausibility evidence unavailable")

    consistency_total = min(ai_points + loc_points + qty_points, cons_cfg.max_score)

    # 4. Penalties (Max deduction 30)
    pen_cfg = TRUST_CONFIG.penalties
    raw_penalties = 0

    if ev_obj.is_identical_text is True:
        applied_penalties["identical_text_hash"] = pen_cfg.identical_text_hash
        raw_penalties += pen_cfg.identical_text_hash
        reasons.append(f"-{pen_cfg.identical_text_hash}: Identical normalized text hash detected")

    if (
        ev_obj.recent_reports_count_one_hour is not None
        and ev_obj.recent_reports_count_one_hour > pen_cfg.rate_limit_threshold_count
    ):
        applied_penalties["rate_limit_exceeded"] = pen_cfg.rate_limit_exceeded
        raw_penalties += pen_cfg.rate_limit_exceeded
        reasons.append(
            f"-{pen_cfg.rate_limit_exceeded}: Rate limit exceeded ({ev_obj.recent_reports_count_one_hour} reports in 1h)"
        )

    if ev_obj.is_flagged_history is True:
        flag_ded = (
            ev_obj.flagged_deduction
            if ev_obj.flagged_deduction is not None
            else pen_cfg.flagged_history
        )
        applied_penalties["flagged_history"] = flag_ded
        raw_penalties += flag_ded
        reasons.append(f"-{flag_ded}: Reporter flagged in historical verification records")

    capped_penalties = min(raw_penalties, pen_cfg.max_total_deduction)
    if raw_penalties > pen_cfg.max_total_deduction:
        reasons.append(f"Combined deductions capped at maximum penalty of {pen_cfg.max_total_deduction}")

    # 5. Final Clamped Score Formula
    positive_sum = rep_score + corrob_score + consistency_total
    raw_final = positive_sum - capped_penalties
    clamped_score = max(TRUST_CONFIG.tiers.min_score, min(TRUST_CONFIG.tiers.max_score, int(round(raw_final))))

    # 6. Credibility Tier
    tier = assign_trust_tier(clamped_score)

    # 7. Dispatch Recommendation (Pure Policy)
    dispatch_rec = recommend_dispatch(
        trust_tier=tier,
        severity=req_obj.severity,
        need_type=req_obj.need_type,
        capacity_available=ev_obj.capacity_available,
    )
    reasons.extend(dispatch_rec.reasons)

    component_breakdown = {
        "reporter_score": rep_score,
        "corroboration_score": corrob_score,
        "consistency_score": consistency_total,
        "penalties_total": capped_penalties,
        "ai_consistency_score": ai_points,
        "location_consistency_score": loc_points,
        "quantity_plausibility_score": qty_points,
        "raw_calculated_score": raw_final,
        "qualifying_corroborations_count": qualifying_count,
    }

    return TrustResult(
        valid=True,
        trust_score=clamped_score,
        trust_tier=tier.value,
        dispatch_action=dispatch_rec.action,
        priority=dispatch_rec.priority,
        reasons=reasons,
        component_breakdown=component_breakdown,
        applied_penalties=applied_penalties,
        validation_errors=[],
        validation_warnings=validation.warnings,
        engine_version=TRUST_CONFIG.version,
        metadata=metadata,
    )


# =============================================================================
# LEGACY V1 BACKWARD-COMPATIBILITY ADAPTERS
# =============================================================================

HIGH_STAKES_CATEGORIES = {"rescue"}
HIGH_STAKES_DISASTER_KEYWORDS = {
    "flood",
    "earthquake",
    "collapse",
    "building collapse",
    "landslide",
    "tsunami",
    "cyclone",
    "drowning",
    "fire",
}


def is_high_stakes_disaster(category: str | None, disaster_type: str | None = None) -> bool:
    """Legacy check for high stakes disaster classification."""
    cat = str(category or "").strip().lower()
    disaster = str(disaster_type or "").strip().lower()
    if cat in HIGH_STAKES_CATEGORIES:
        return True
    return any(kw in disaster for kw in HIGH_STAKES_DISASTER_KEYWORDS)


def run_common_validation(data_dict: dict) -> dict:
    """Legacy baseline check helper for older routes."""
    phone = str(data_dict.get("reporter_phone", "")).strip().replace(" ", "").replace("-", "")
    phone_ok = phone.isdigit() and len(phone) == 10

    lat = data_dict.get("lat", data_dict.get("latitude"))
    lng = data_dict.get("lng", data_dict.get("longitude"))
    coords_ok = _is_valid_coord_value(lat, lng) and not (float(lat or 0) == 0.0 and float(lng or 0) == 0.0)

    base_score = (10 if phone_ok else 0) + (10 if coords_ok else 0)
    passed = phone_ok and coords_ok
    return {
        "passed": passed,
        "phone_ok": phone_ok,
        "coords_ok": coords_ok,
        "base_score": base_score,
        "score": min(max(35 + int(base_score * 1.5), 0), 100),
        "status": "Verified" if passed else "Pending Verification",
        "reasons": [
            f"+{10 if phone_ok else 0}: Phone validation",
            f"+{10 if coords_ok else 0}: Coordinate validation",
        ],
    }


def build_common_only_trust_result(common_validation: dict, category: str, disaster_type: str = "") -> dict:
    """Legacy pass-through score result builder."""
    score = common_validation.get("score", 35)
    return {
        "trust_score": score,
        "dispatch_action": "auto_dispatch" if score > 75 else "secondary_review",
        "reasons": common_validation.get("reasons", []),
        "breakdown": {
            "ai_consistency": 0,
            "weather_corroboration": 0,
            "nearby_corroboration": 0,
            "common_checks": common_validation.get("base_score", 0),
        },
    }


def _legacy_calculate_trust_score(
    data_dict: dict,
    ai_consistency: Any = 5,
    corroborating_reports_count: Any = 0,
    ai_category: Optional[str] = None,
    base_score: int = 20,
    consistency: Any = None,
    corroboration: Any = None,
    category: Optional[str] = None,
    disaster_type: str = "",
) -> dict:
    """Legacy V1 scoring adapter for backward compatibility."""
    try:
        c_val = int(ai_consistency if ai_consistency is not None else (consistency or 5))
    except (TypeError, ValueError):
        c_val = 5

    try:
        corrob_val = int(corroborating_reports_count if corroborating_reports_count is not None else (corroboration or 0))
    except (TypeError, ValueError):
        corrob_val = 0

    ai_pts = min(max(c_val, 0), 10) * 3
    corrob_pts = min(max(corrob_val, 0) * 20, 40)
    b_pts = base_score if base_score is not None else 20
    total = min(max(ai_pts + corrob_pts + b_pts, 0), 100)

    if total > 75:
        action = "auto_dispatch"
    elif total >= 35:
        action = "human_review"
    else:
        action = "flagged"

    return {
        "score": total,
        "trust_score": total,
        "dispatch_action": action,
        "reasons": [
            f"+{ai_pts}: Legacy AI consistency",
            f"+{corrob_pts}: Legacy nearby corroboration",
        ],
        "breakdown": {
            "ai_consistency": ai_pts,
            "weather_corroboration": 0,
            "nearby_corroboration": corrob_pts,
            "common_checks": b_pts,
        },
    }
