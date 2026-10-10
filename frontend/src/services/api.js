// ============================================================================
// SETU - Centralized Disaster Coordination API Service & Resilient Mock Engine
// Follows strictly summary.md Section 5 Data Contracts & Section 6 API Routes
// Built with Bharat 4.0 — Smart Emergency Response System
// ============================================================================

const BASE_URL = (import.meta.env?.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/+$/, '');
const MOCK_STORAGE_KEY = 'setu_mock_database_v2';
const MOCK_CONFIG_KEY = 'setu_use_mock_config';

// ----------------------------------------------------------------------------
// Canonical Seed Data (summary.md Section 4 & 5)
// ----------------------------------------------------------------------------
const SEED_VOLUNTEERS = [
  {
    id: "V001",
    name: "Rahul Sharma",
    role_title: "Logistics & Ground Responder",
    skills: ["food_distribution", "first_aid", "crowd_coordination"],
    latitude: 11.6890,
    longitude: 76.1350,
    available: true,
    verified: true,
    tier: 1,
    phone: "+91 98765 43210",
    email: "rahul.sharma@responder.setu.in",
    vehicle: "Motorcycle / Light Van",
    blood_group: "O+",
  },
  {
    id: "V002",
    name: "Dr. Ananya Sen",
    role_title: "Emergency Medical Responder",
    skills: ["emergency_medicine", "triage", "wound_care"],
    latitude: 11.6820,
    longitude: 76.1280,
    available: true,
    verified: true,
    tier: 1,
    phone: "+91 98765 11223",
    email: "ananya.sen@responder.setu.in",
    vehicle: "First Response Vehicle",
    blood_group: "B+",
  },
];

const SEED_NGOS = [
  {
    id: "NGO001",
    name: "Kerala Relief Network",
    verified: true,
    location_text: "Wayanad Central Relief Hub, Meppadi Road",
    phone: "+91 4936 200111",
    email: "dispatch@keralarelief.org",
    coordinator_name: "K. Mohan Kumar",
    coverage_radius_km: 35,
    capacity: [
      {
        need_type: "food",
        item_name: "Cooked Meals & Dry Rations",
        quantity: 500,
        reserved: 200,
        unit: "meals",
        threshold: 100,
      },
      {
        need_type: "water",
        item_name: "Clean Drinking Water Cans",
        quantity: 1000,
        reserved: 80,
        unit: "liters",
        threshold: 250,
      },
      {
        need_type: "shelter",
        item_name: "Emergency Tarpaulins & Blankets",
        quantity: 75,
        reserved: 0,
        unit: "kits",
        threshold: 20,
      },
    ],
  },
  {
    id: "NGO002",
    name: "Seva Disaster Medical Corps",
    verified: true,
    location_text: "Kalpetta Emergency Depot, Sector 2",
    phone: "+91 4936 200222",
    email: "operations@sevamedical.org",
    coordinator_name: "Dr. Preethi Nair",
    coverage_radius_km: 50,
    capacity: [
      {
        need_type: "medical",
        item_name: "First Aid & Triage Trauma Kits",
        quantity: 150,
        reserved: 25,
        unit: "first_aid_kits",
        threshold: 30,
      },
      {
        need_type: "water",
        item_name: "Water Purification & Chlorine Kits",
        quantity: 120,
        reserved: 50,
        unit: "kits",
        threshold: 25,
      },
      {
        need_type: "rescue",
        item_name: "Life Vests & Floatation Rings",
        quantity: 40,
        reserved: 10,
        unit: "units",
        threshold: 15,
      },
    ],
  },
];

const SEED_NEEDS = [
  {
    id: "N001",
    description: "Around 200 people at Wayanad Relief Camp urgently need cooked meals.",
    need_type: "food",
    item: "cooked meals",
    quantity: 200,
    unit: "meals",
    location_text: "Wayanad Relief Camp, Sector 4",
    latitude: 11.6854,
    longitude: 76.1320,
    severity: "high",
    trust_score: 87,
    verification_status: "verified",
    status: "assigned",
    created_at: new Date(Date.now() - 45 * 60000).toISOString(),
    trust_result: {
      trust_score: 87,
      decision: "verified",
      reasons: [
        "Verified camp coordinator contact details",
        "Corroborated with district intake register",
        "Quantities match documented camp occupancy (200 individuals)",
      ],
      duplicate_suspected: false,
    },
  },
  {
    id: "N002",
    description: "200 meals urgently needed at Wayanad relief camp near entrance.",
    need_type: "food",
    item: "cooked meals",
    quantity: 200,
    unit: "meals",
    location_text: "Wayanad Relief Camp",
    latitude: 11.6852,
    longitude: 76.1322,
    severity: "high",
    trust_score: 42,
    verification_status: "review",
    status: "under_review",
    created_at: new Date(Date.now() - 20 * 60000).toISOString(),
    trust_result: {
      trust_score: 42,
      decision: "review",
      reasons: [
        "Duplicate distress signal flagged: Content matches existing report N001 within 50m radius",
        "Held for coordinator human review to prevent double dispatch",
      ],
      duplicate_suspected: true,
    },
  },
  {
    id: "N003",
    description: "Severe flash flooding: 45 residents stranded on school rooftop requiring rescue boat immediately.",
    need_type: "rescue",
    item: "inflatable rescue boat & life jackets",
    quantity: 45,
    unit: "individuals",
    location_text: "Meppadi High School, Wayanad",
    latitude: 11.5512,
    longitude: 76.1245,
    severity: "critical",
    trust_score: 96,
    verification_status: "verified",
    status: "open",
    created_at: new Date(Date.now() - 10 * 60000).toISOString(),
    trust_result: {
      trust_score: 96,
      decision: "verified",
      reasons: [
        "High life-safety risk verified by multiple emergency calls",
        "Coordinates confirmed in active flood inundation zone",
        "Specialized motorized boat team dispatched from district center",
      ],
      duplicate_suspected: false,
    },
  },
  {
    id: "N004",
    description: "50 water purification kits needed for families in temporary community shelter.",
    need_type: "water",
    item: "purification kits & chlorine tablets",
    quantity: 50,
    unit: "kits",
    location_text: "Chundale Community Center",
    latitude: 11.6110,
    longitude: 76.0590,
    severity: "medium",
    trust_score: 91,
    verification_status: "verified",
    status: "resolved",
    created_at: new Date(Date.now() - 180 * 60000).toISOString(),
    trust_result: {
      trust_score: 91,
      decision: "verified",
      reasons: [
        "Verified by village officer on-site",
        "Delivered and confirmed distributed by Seva Corps",
      ],
      duplicate_suspected: false,
    },
  },
  {
    id: "N005",
    description: "80 liters clean drinking water required at Meppadi Community Hall for flood evacuees.",
    need_type: "water",
    item: "clean drinking water",
    quantity: 80,
    unit: "liters",
    location_text: "Meppadi Community Hall, Ward 6",
    latitude: 11.5540,
    longitude: 76.1280,
    severity: "high",
    trust_score: 93,
    verification_status: "verified",
    status: "in_progress",
    created_at: new Date(Date.now() - 50 * 60000).toISOString(),
    trust_result: {
      trust_score: 93,
      decision: "verified",
      reasons: [
        "Verified by local ward member contact",
        "Water main damaged by landslide in Ward 6",
      ],
      duplicate_suspected: false,
    },
  },
  {
    id: "N006",
    description: "25 first aid and trauma triage kits needed urgently at primary medical post.",
    need_type: "medical",
    item: "first aid kits",
    quantity: 25,
    unit: "kits",
    location_text: "Kalpetta Relief Camp Health Post",
    latitude: 11.6085,
    longitude: 76.0845,
    severity: "high",
    trust_score: 95,
    verification_status: "verified",
    status: "assigned",
    created_at: new Date(Date.now() - 25 * 60000).toISOString(),
    trust_result: {
      trust_score: 95,
      decision: "verified",
      reasons: [
        "Direct intake from on-duty medical officer",
        "Supply replenished via Seva Disaster Medical Corps inventory",
      ],
      duplicate_suspected: false,
    },
  },
];

const SEED_ASSIGNMENTS = [
  {
    id: "A001",
    need_id: "N001",
    ngo_id: "NGO001",
    volunteer_id: "V001",
    status: "assigned", // assigned (pending volunteer acceptance)
    dispatch_status: "ready_for_pickup", // ready_for_pickup, dispatched, in_transit, delivered
    assigned_at: new Date(Date.now() - 30 * 60000).toISOString(),
    resolved_at: null,
    destination: "Wayanad Relief Camp, Sector 4",
    latitude: 11.6854,
    longitude: 76.1320,
    supplies: "200 cooked meals & ration packets",
    quantity: 200,
    unit: "meals",
    instructions: "Collect 200 hot food boxes from Wayanad Central Relief Hub kitchen. Present manifest to Camp Warden Sreedharan at Gate 2. Avoid flooded low-lying bypass.",
  },
  {
    id: "A002",
    need_id: "N004",
    ngo_id: "NGO002",
    volunteer_id: "V002",
    status: "resolved",
    dispatch_status: "delivered",
    assigned_at: new Date(Date.now() - 120 * 60000).toISOString(),
    resolved_at: new Date(Date.now() - 15 * 60000).toISOString(),
    destination: "Chundale Community Center",
    latitude: 11.6110,
    longitude: 76.0590,
    supplies: "50 water purification kits",
    quantity: 50,
    unit: "kits",
    instructions: "Hand over purification units to community shelter lead. Signed receipt submitted.",
  },
  {
    id: "A003",
    need_id: "N005",
    ngo_id: "NGO001",
    volunteer_id: "V001",
    status: "in_progress",
    dispatch_status: "in_transit",
    assigned_at: new Date(Date.now() - 45 * 60000).toISOString(),
    resolved_at: null,
    destination: "Meppadi Community Hall, Ward 6",
    latitude: 11.5540,
    longitude: 76.1280,
    supplies: "80 liters clean drinking water (4 x 20L cans)",
    quantity: 80,
    unit: "liters",
    instructions: "Water cans loaded on vehicle. Route clearance verified via Meppadi town road. Contact ward member Anitha on arrival.",
  },
  {
    id: "A004",
    need_id: "N006",
    ngo_id: "NGO002",
    volunteer_id: "V002",
    status: "assigned",
    dispatch_status: "ready_for_pickup",
    assigned_at: new Date(Date.now() - 20 * 60000).toISOString(),
    resolved_at: null,
    destination: "Kalpetta Relief Camp Health Post",
    latitude: 11.6085,
    longitude: 76.0845,
    supplies: "25 first aid and trauma triage kits",
    quantity: 25,
    unit: "kits",
    instructions: "Pick up sterilized kit boxes from Kalpetta Emergency Depot shelf M-2. Hand over directly to Dr. Sen or duty nurse.",
  },
];

// ----------------------------------------------------------------------------
// Local Storage Mock Database Engine
// ----------------------------------------------------------------------------
function loadMockDatabase() {
  try {
    const raw = localStorage.getItem(MOCK_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.needs && parsed.assignments && parsed.volunteers && parsed.ngos) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn("Could not load stored mock database; resetting to canonical seed.", e);
  }
  const initial = {
    needs: SEED_NEEDS,
    assignments: SEED_ASSIGNMENTS,
    volunteers: SEED_VOLUNTEERS,
    ngos: SEED_NGOS,
  };
  saveMockDatabase(initial);
  return initial;
}

function saveMockDatabase(data) {
  try {
    localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error("Failed to save mock database to localStorage", e);
  }
}

// ----------------------------------------------------------------------------
// Mock Intelligence Parser (Simulating AI & Trust Engine)
// ----------------------------------------------------------------------------
function simulateStructuredNeedExtraction(rawText, locationHint = '') {
  const text = (rawText || '').trim();
  const lower = text.toLowerCase();

  // 1. Detect Category / Need Type
  let need_type = "general";
  let item = "relief supplies";
  let unit = "units";

  if (lower.includes("food") || lower.includes("meal") || lower.includes("ration") || lower.includes("cook")) {
    need_type = "food";
    item = "cooked meals & dry rations";
    unit = "meals";
  } else if (lower.includes("water") || lower.includes("drink") || lower.includes("bottle") || lower.includes("purif")) {
    need_type = "water";
    item = "safe drinking water";
    unit = "liters";
  } else if (lower.includes("doctor") || lower.includes("medic") || lower.includes("injur") || lower.includes("first aid") || lower.includes("bandage") || lower.includes("hospital")) {
    need_type = "medical";
    item = "emergency medical aid & triage";
    unit = "kits";
  } else if (lower.includes("rescue") || lower.includes("boat") || lower.includes("trap") || lower.includes("strand") || lower.includes("flood") || lower.includes("drown")) {
    need_type = "rescue";
    item = "rescue evacuation boat & life support";
    unit = "individuals";
  } else if (lower.includes("shelter") || lower.includes("blanket") || lower.includes("tent") || lower.includes("tarp")) {
    need_type = "shelter";
    item = "tarpaulins & warm blankets";
    unit = "kits";
  }

  // 2. Extract Quantity
  const qtyMatch = text.match(/\b(\d{1,5})\b/);
  const quantity = qtyMatch ? parseInt(qtyMatch[1], 10) : 50;

  // 3. Extract or Fallback Location
  let location_text = locationHint;
  if (!location_text) {
    const locMatch = text.match(/at\s+([A-Za-z0-9\s,.-]+?)(?:\s+(?:urgently|need|require|help|for|\.|$))/i);
    location_text = locMatch ? locMatch[1].trim() : "Wayanad Relief Sector";
  }

  // 4. Severity Assessment
  let severity = "medium";
  if (lower.includes("urgent") || lower.includes("critical") || lower.includes("immediately") || lower.includes("trapped") || lower.includes("dying") || lower.includes("bleeding")) {
    severity = need_type === "rescue" || need_type === "medical" ? "critical" : "high";
  } else if (quantity > 150) {
    severity = "high";
  }

  // 5. Trust Assessment Calculation
  let trust_score = 88;
  const reasons = [
    "Contact information validated with format check",
    `Automated extraction detected valid ${need_type} request for ${quantity} ${unit}`,
    `Location identified as '${location_text}' in emergency coverage zone`,
  ];

  if (quantity > 5000) {
    trust_score = 65;
    reasons.push("Unusually large quantity requested; human verification advised");
  }

  return {
    need_type,
    item,
    quantity,
    unit,
    location_text,
    severity,
    trust_score,
    verification_status: trust_score >= 80 ? "verified" : "review",
    trust_result: {
      trust_score,
      decision: trust_score >= 80 ? "verified" : "review",
      reasons,
      duplicate_suspected: false,
    },
  };
}

// ----------------------------------------------------------------------------
// Unified ApiService
// ----------------------------------------------------------------------------
class ApiService {
  /**
   * Determine if we are operating in Simulated Mock Mode
   */
  static isMockMode() {
    const override = localStorage.getItem(MOCK_CONFIG_KEY);
    if (override !== null) {
      return override === 'true';
    }
    return import.meta.env?.VITE_USE_MOCK !== 'false';
  }

  static setMockMode(enabled) {
    localStorage.setItem(MOCK_CONFIG_KEY, enabled ? 'true' : 'false');
  }

  static resetDatabase() {
    localStorage.removeItem(MOCK_STORAGE_KEY);
    return loadMockDatabase();
  }

  /**
   * Universal HTTP fetch with structured error return
   */
  static async request(endpoint, options = {}) {
    const url = `${BASE_URL}${endpoint}`;
    const token = localStorage.getItem('auth_token');

    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...options.headers,
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      const response = await fetch(url, { ...options, headers });
      const contentType = response.headers.get('content-type') || '';
      let data = null;

      if (response.status === 204) {
        data = null;
      } else if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        try { data = JSON.parse(text); } catch { data = { message: text }; }
      }

      if (!response.ok) {
        const errorMsg = data?.detail || data?.error || data?.message || `Server returned HTTP ${response.status}`;
        return { ok: false, status: response.status, error: errorMsg, data };
      }

      return { ok: true, status: response.status, data };
    } catch (err) {
      console.warn(`[SETU Network] Failed calling ${url}:`, err.message);
      return {
        ok: false,
        status: 0,
        error: `Cannot connect to live FastAPI backend at ${BASE_URL}. (${err.message})`,
        data: null,
      };
    }
  }

  // --------------------------------------------------------------------------
  // 1. System Health
  // --------------------------------------------------------------------------
  static async getHealth() {
    if (this.isMockMode()) {
      return {
        ok: true,
        mode: 'mock',
        data: {
          status: "ok",
          mode: "Simulated Mock Mode (Offline-Ready)",
          database: "localStorage memory cache active",
          timestamp: new Date().toISOString(),
        },
      };
    }

    const res = await this.request('/health');
    if (res.ok) {
      return { ok: true, mode: 'live', data: res.data };
    }
    return {
      ok: false,
      mode: 'live_offline',
      error: res.error,
    };
  }

  // --------------------------------------------------------------------------
  // 2. Community Telemetry Stats
  // --------------------------------------------------------------------------
  static async getCommunityStats() {
    if (this.isMockMode()) {
      const db = loadMockDatabase();
      return {
        ok: true,
        mode: 'mock',
        data: {
          total_volunteers: db.volunteers?.length || 2,
          total_needs: db.needs?.length || 6,
          total_ngos: db.ngos?.length || 2,
        },
      };
    }

    let res = await this.request('/stats');
    if (res.ok && res.data) {
      return {
        ok: true,
        mode: 'live',
        data: {
          total_volunteers: res.data.total_volunteers ?? 0,
          total_needs: res.data.total_reports ?? res.data.total_needs ?? 0,
          total_ngos: res.data.total_ngos ?? 0,
        },
      };
    }

    res = await this.request('/dashboard');
    if (res.ok && res.data) {
      return {
        ok: true,
        mode: 'live',
        data: {
          total_volunteers: res.data.total_volunteers ?? 0,
          total_needs: res.data.total_needs ?? (res.data.reports?.length || 0),
          total_ngos: res.data.total_ngos ?? 0,
        },
      };
    }

    return {
      ok: false,
      mode: 'unavailable',
      error: res.error || 'Backend telemetry data unavailable',
    };
  }

  // --------------------------------------------------------------------------
  // 3. Needs Feed & Listing
  // --------------------------------------------------------------------------
  static async getNeeds() {
    if (this.isMockMode()) {
      const db = loadMockDatabase();
      const enriched = db.needs.map((need) => {
        const assignment = db.assignments.find((a) => a.need_id === need.id);
        const volunteer = assignment ? db.volunteers.find((v) => v.id === assignment.volunteer_id) : null;
        const ngo = assignment ? db.ngos.find((n) => n.id === assignment.ngo_id) : null;

        return {
          ...need,
          assignment: assignment || null,
          volunteer: volunteer || null,
          ngo: ngo || null,
        };
      });

      return {
        ok: true,
        mode: 'mock',
        data: enriched,
      };
    }

    let res = await this.request('/needs');
    if (!res.ok && res.status === 404) {
      res = await this.request('/dashboard/reports');
    }

    if (res.ok && Array.isArray(res.data)) {
      return { ok: true, mode: 'live', data: res.data };
    }

    if (res.ok && res.data?.reports) {
      return { ok: true, mode: 'live', data: res.data.reports };
    }

    return {
      ok: false,
      mode: 'live',
      error: res.error || 'Unable to retrieve needs from FastAPI backend.',
      data: [],
    };
  }

  // --------------------------------------------------------------------------
  // 4. Need Details by ID
  // --------------------------------------------------------------------------
  static async getNeed(needId) {
    if (this.isMockMode()) {
      const db = loadMockDatabase();
      const need = db.needs.find((n) => n.id === needId);
      if (!need) return { ok: false, error: `Need #${needId} not found` };

      const assignment = db.assignments.find((a) => a.need_id === need.id);
      const volunteer = assignment ? db.volunteers.find((v) => v.id === assignment.volunteer_id) : null;
      const ngo = assignment ? db.ngos.find((n) => n.id === assignment.ngo_id) : null;

      return {
        ok: true,
        mode: 'mock',
        data: {
          ...need,
          assignment: assignment || null,
          volunteer: volunteer || null,
          ngo: ngo || null,
        },
      };
    }

    return this.request(`/needs/${needId}`);
  }

  // --------------------------------------------------------------------------
  // 5. Submit Emergency Distress Report
  // --------------------------------------------------------------------------
  static async submitEmergencyReport(payload) {
    const rawText = payload.description || payload.text || '';
    const locationText = payload.location_text || payload.location || '';

    if (this.isMockMode()) {
      const db = loadMockDatabase();
      const structured = simulateStructuredNeedExtraction(rawText, locationText);

      const newId = `N00${db.needs.length + 1}`;
      const newNeed = {
        id: newId,
        description: rawText,
        need_type: structured.need_type,
        item: structured.item,
        quantity: structured.quantity,
        unit: structured.unit,
        location_text: structured.location_text,
        latitude: payload.latitude || 11.6854,
        longitude: payload.longitude || 76.1320,
        severity: structured.severity,
        trust_score: structured.trust_score,
        verification_status: structured.verification_status,
        status: "open",
        created_at: new Date().toISOString(),
        trust_result: structured.trust_result,
      };

      // Match according to backend simulation
      let newAssignment = null;
      let matchedVolunteer = null;
      let matchedNGO = null;

      if (newNeed.verification_status === "verified" && newNeed.severity !== "critical") {
        matchedNGO = db.ngos.find((ngo) =>
          ngo.capacity.some((c) => c.need_type === newNeed.need_type)
        ) || db.ngos[0];

        matchedVolunteer = db.volunteers.find((v) => v.available) || db.volunteers[0];

        if (matchedNGO && matchedVolunteer) {
          const assignId = `A00${db.assignments.length + 1}`;
          newAssignment = {
            id: assignId,
            need_id: newId,
            ngo_id: matchedNGO.id,
            volunteer_id: matchedVolunteer.id,
            status: "assigned",
            dispatch_status: "ready_for_pickup",
            assigned_at: new Date().toISOString(),
            resolved_at: null,
            destination: newNeed.location_text,
            latitude: newNeed.latitude,
            longitude: newNeed.longitude,
            supplies: `${newNeed.quantity} ${newNeed.unit} of ${newNeed.item}`,
            quantity: newNeed.quantity,
            unit: newNeed.unit,
            instructions: `Deliver ${newNeed.quantity} ${newNeed.unit} from ${matchedNGO.name} to ${newNeed.location_text}.`,
          };
          newNeed.status = "assigned";
          db.assignments.unshift(newAssignment);
        }
      }

      db.needs.unshift(newNeed);
      saveMockDatabase(db);

      return {
        ok: true,
        mode: 'mock',
        data: {
          need: newNeed,
          assignment: newAssignment,
          volunteer: matchedVolunteer,
          ngo: matchedNGO,
          message: "Emergency report successfully recorded in SETU dispatch system.",
        },
      };
    }

    let res = await this.request('/needs', {
      method: 'POST',
      body: JSON.stringify({
        description: rawText,
        location_text: locationText,
        ...payload,
      }),
    });

    if (!res.ok && (res.status === 404 || res.status === 405)) {
      res = await this.request('/webhook', {
        method: 'POST',
        body: JSON.stringify({
          description: rawText,
          location: locationText,
          help_needed: rawText,
          ...payload,
        }),
      });
    }

    return res;
  }

  // --------------------------------------------------------------------------
  // 6. NGO Capabilities (Phase 3 Backend Contracts)
  // --------------------------------------------------------------------------
  static async getNGOs() {
    if (this.isMockMode()) {
      const db = loadMockDatabase();
      return { ok: true, mode: 'mock', data: db.ngos };
    }
    const res = await this.request('/ngos');
    return res;
  }

  static async getNGO(ngoId) {
    if (this.isMockMode()) {
      const db = loadMockDatabase();
      const ngo = db.ngos.find((n) => n.id === ngoId);
      if (!ngo) return { ok: false, error: `NGO #${ngoId} not found` };
      return { ok: true, mode: 'mock', data: ngo };
    }
    const res = await this.request(`/ngos/${ngoId}`);
    return res;
  }

  static async updateNGOInventory(ngoId, needType, newQuantity, notes = '') {
    const qty = Math.max(0, parseInt(newQuantity, 10) || 0);

    if (this.isMockMode()) {
      const db = loadMockDatabase();
      const ngo = db.ngos.find((n) => n.id === ngoId);
      if (!ngo) return { ok: false, error: `NGO #${ngoId} not found` };

      const item = ngo.capacity.find((c) => c.need_type === needType);
      if (item) {
        item.quantity = qty;
        if (notes) item.last_updated_note = notes;
        item.last_updated_at = new Date().toISOString();
      } else {
        ngo.capacity.push({
          need_type: needType,
          item_name: `${needType.toUpperCase()} Supplies`,
          quantity: qty,
          reserved: 0,
          unit: "units",
          threshold: Math.max(10, Math.floor(qty * 0.2)),
          last_updated_note: notes,
          last_updated_at: new Date().toISOString(),
        });
      }

      saveMockDatabase(db);
      return {
        ok: true,
        mode: 'mock',
        data: ngo,
        message: `Inventory updated successfully for ${needType}: ${qty} available.`,
      };
    }

    // Call live backend endpoint
    let res = await this.request(`/ngos/${ngoId}/inventory`, {
      method: 'PATCH',
      body: JSON.stringify({
        need_type: needType,
        quantity: qty,
        notes,
      }),
    });

    if (!res.ok && res.status === 404) {
      res = await this.request(`/ngos/${ngoId}/capacity`, {
        method: 'PUT',
        body: JSON.stringify({
          need_type: needType,
          quantity: qty,
        }),
      });
    }

    return res;
  }

  static async getNGODispatches(ngoId) {
    if (this.isMockMode()) {
      const db = loadMockDatabase();
      const dispatches = db.assignments.filter((a) => a.ngo_id === ngoId);
      const enriched = dispatches.map((a) => {
        const need = db.needs.find((n) => n.id === a.need_id) || null;
        const volunteer = db.volunteers.find((v) => v.id === a.volunteer_id) || null;
        return {
          ...a,
          need,
          volunteer,
        };
      });
      return { ok: true, mode: 'mock', data: enriched };
    }

    let res = await this.request(`/ngos/${ngoId}/dispatches`);
    if (!res.ok && res.status === 404) {
      res = await this.request(`/ngos/${ngoId}/assignments`);
    }
    return res;
  }

  static async getNGONeeds(ngoId) {
    if (this.isMockMode()) {
      const db = loadMockDatabase();
      const matchedAssignments = db.assignments.filter((a) => a.ngo_id === ngoId);
      const matchedNeedIds = new Set(matchedAssignments.map((a) => a.need_id));

      const ngo = db.ngos.find((n) => n.id === ngoId);
      const coveredTypes = new Set(ngo ? ngo.capacity.map((c) => c.need_type) : []);

      // Return both directly assigned needs and open needs that match capacity
      const relevantNeeds = db.needs
        .filter((n) => matchedNeedIds.has(n.id) || (n.status === 'open' && coveredTypes.has(n.need_type)))
        .map((need) => {
          const assignment = matchedAssignments.find((a) => a.need_id === need.id) || null;
          const volunteer = assignment ? db.volunteers.find((v) => v.id === assignment.volunteer_id) : null;
          return {
            ...need,
            assignment,
            volunteer,
          };
        });

      return { ok: true, mode: 'mock', data: relevantNeeds };
    }

    let res = await this.request(`/ngos/${ngoId}/needs`);
    return res;
  }

  static async confirmNGODispatch(assignmentId) {
    if (this.isMockMode()) {
      const db = loadMockDatabase();
      const assignment = db.assignments.find((a) => a.id === assignmentId);
      if (!assignment) return { ok: false, error: `Assignment #${assignmentId} not found` };

      assignment.dispatch_status = "dispatched";
      if (assignment.status === "assigned") assignment.status = "in_progress";
      saveMockDatabase(db);

      return {
        ok: true,
        mode: 'mock',
        data: assignment,
        message: `Dispatch #${assignmentId} confirmed and logged for field delivery.`,
      };
    }

    const res = await this.request(`/assignments/${assignmentId}/dispatch`, {
      method: 'PATCH',
      body: JSON.stringify({ dispatch_status: 'dispatched' }),
    });
    return res;
  }

  // --------------------------------------------------------------------------
  // 7. Volunteer Capabilities (Phase 4 Backend Contracts)
  // --------------------------------------------------------------------------
  static async getVolunteers() {
    if (this.isMockMode()) {
      const db = loadMockDatabase();
      return { ok: true, mode: 'mock', data: db.volunteers };
    }
    const res = await this.request('/volunteers');
    return res;
  }

  static async getVolunteer(volunteerId) {
    if (this.isMockMode()) {
      const db = loadMockDatabase();
      const volunteer = db.volunteers.find((v) => v.id === volunteerId);
      if (!volunteer) return { ok: false, error: `Volunteer #${volunteerId} not found` };
      return { ok: true, mode: 'mock', data: volunteer };
    }
    const res = await this.request(`/volunteers/${volunteerId}`);
    return res;
  }

  static async updateVolunteerAvailability(volunteerId, available) {
    if (this.isMockMode()) {
      const db = loadMockDatabase();
      const volunteer = db.volunteers.find((v) => v.id === volunteerId);
      if (!volunteer) return { ok: false, error: `Volunteer #${volunteerId} not found` };

      volunteer.available = Boolean(available);
      saveMockDatabase(db);

      return {
        ok: true,
        mode: 'mock',
        data: volunteer,
        message: `Status updated to ${volunteer.available ? 'Available' : 'Unavailable'}.`,
      };
    }

    const res = await this.request(`/volunteers/${volunteerId}/availability`, {
      method: 'PATCH',
      body: JSON.stringify({ available: Boolean(available) }),
    });
    return res;
  }

  static async getVolunteerAssignments(volunteerId) {
    if (this.isMockMode()) {
      const db = loadMockDatabase();
      const assigned = db.assignments.filter((a) => a.volunteer_id === volunteerId);
      const enriched = assigned.map((a) => {
        const need = db.needs.find((n) => n.id === a.need_id) || null;
        const ngo = db.ngos.find((n) => n.id === a.ngo_id) || null;
        return {
          ...a,
          need,
          ngo,
        };
      });

      return { ok: true, mode: 'mock', data: enriched };
    }

    let res = await this.request(`/volunteers/${volunteerId}/assignments`);
    if (!res.ok && res.status === 404) {
      res = await this.request(`/assignment/volunteer/${volunteerId}`);
    }
    return res;
  }

  static async acceptAssignment(assignmentId, volunteerId = "V001") {
    if (this.isMockMode()) {
      const db = loadMockDatabase();
      const assignment = db.assignments.find((a) => a.id === assignmentId || a.need_id === assignmentId);
      if (!assignment) {
        return { ok: false, error: `Assignment #${assignmentId} could not be found` };
      }

      assignment.status = "accepted";
      assignment.volunteer_id = volunteerId;

      const need = db.needs.find((n) => n.id === assignment.need_id);
      if (need) {
        need.status = "assigned";
      }

      saveMockDatabase(db);
      return {
        ok: true,
        mode: 'mock',
        data: {
          assignment_id: assignment.id,
          status: "accepted",
          message: `Volunteer ${volunteerId} has accepted assignment ${assignment.id}`,
        },
      };
    }

    let res = await this.request(`/assignments/${assignmentId}/accept`, {
      method: 'POST',
      body: JSON.stringify({ volunteer_id: volunteerId }),
    });

    if (!res.ok && res.status === 404) {
      res = await this.request(`/assignment/volunteer/${assignmentId}?volunteer_id=${encodeURIComponent(volunteerId)}`, {
        method: 'POST',
      });
    }

    return res;
  }

  static async updateAssignmentProgress(assignmentId, notes = '') {
    if (this.isMockMode()) {
      const db = loadMockDatabase();
      const assignment = db.assignments.find((a) => a.id === assignmentId || a.need_id === assignmentId);
      if (!assignment) {
        return { ok: false, error: `Assignment #${assignmentId} could not be found` };
      }

      assignment.status = "in_progress";
      assignment.dispatch_status = "in_transit";
      if (notes) assignment.field_notes = notes;

      const need = db.needs.find((n) => n.id === assignment.need_id);
      if (need) need.status = "in_progress";

      saveMockDatabase(db);
      return {
        ok: true,
        mode: 'mock',
        data: assignment,
        message: `Task #${assignment.id} marked as In Progress (En Route).`,
      };
    }

    let res = await this.request(`/assignments/${assignmentId}/progress`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'in_progress', notes }),
    });

    if (!res.ok && res.status === 404) {
      res = await this.request(`/assignments/${assignmentId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'in_progress', notes }),
      });
    }

    return res;
  }

  static async resolveAssignment(assignmentId, resolutionNotes = "Relief aid successfully handed over on site.") {
    if (this.isMockMode()) {
      const db = loadMockDatabase();
      const assignment = db.assignments.find((a) => a.id === assignmentId || a.need_id === assignmentId);
      if (!assignment) {
        return { ok: false, error: `Assignment #${assignmentId} could not be found` };
      }

      assignment.status = "resolved";
      assignment.dispatch_status = "delivered";
      assignment.resolved_at = new Date().toISOString();
      assignment.resolution_notes = resolutionNotes;

      const need = db.needs.find((n) => n.id === assignment.need_id);
      if (need) {
        need.status = "resolved";
      }

      // If associated with an NGO capacity, deduct from reserved
      const ngo = db.ngos.find((n) => n.id === assignment.ngo_id);
      if (ngo && assignment.quantity && need?.need_type) {
        const cap = ngo.capacity.find((c) => c.need_type === need.need_type);
        if (cap && cap.reserved !== undefined) {
          cap.reserved = Math.max(0, cap.reserved - assignment.quantity);
        }
      }

      saveMockDatabase(db);
      return {
        ok: true,
        mode: 'mock',
        data: {
          assignment_id: assignment.id,
          status: "resolved",
          resolved_at: assignment.resolved_at,
          message: `Need #${need?.id || assignment.need_id} marked as resolved!`,
        },
      };
    }

    let res = await this.request(`/assignments/${assignmentId}/resolve`, {
      method: 'PATCH',
      body: JSON.stringify({ notes: resolutionNotes }),
    });

    if (!res.ok && res.status === 404) {
      res = await this.request(`/assignment/${assignmentId}/resolve`, {
        method: 'PATCH',
        body: JSON.stringify({ notes: resolutionNotes }),
      });
    }

    return res;
  }

  static async getActiveAssignments(volunteerId = "V001") {
    if (this.isMockMode()) {
      const db = loadMockDatabase();
      const active = db.assignments.filter((a) => a.status !== "cancelled");
      const enriched = active.map((a) => {
        const need = db.needs.find((n) => n.id === a.need_id) || null;
        const volunteer = db.volunteers.find((v) => v.id === a.volunteer_id) || null;
        const ngo = db.ngos.find((n) => n.id === a.ngo_id) || null;
        return {
          ...a,
          need,
          volunteer,
          ngo,
        };
      });

      return {
        ok: true,
        mode: 'mock',
        data: enriched,
      };
    }

    const res = await this.request(`/volunteers/${volunteerId}/assignments`);
    if (!res.ok && res.status === 404) {
      return this.request(`/assignment/volunteer/${volunteerId}`);
    }
    return res;
  }
}

export default ApiService;
