-- 🗄️ Supabase PostgreSQL Schema for Setu (Fresh Database Instance)

-- 1. otps table (Passwordless email OTP authentication)
CREATE TABLE IF NOT EXISTS otps (
    email TEXT PRIMARY KEY,
    otp TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. ngos table (Registered relief organizations)
CREATE TABLE IF NOT EXISTS ngos (
    id TEXT PRIMARY KEY,
    ngo_name TEXT NOT NULL,
    owner_name TEXT,
    description TEXT,
    type TEXT,
    location TEXT,
    email TEXT UNIQUE,
    phone TEXT,
    verified BOOLEAN DEFAULT FALSE,
    registered_at TIMESTAMPTZ DEFAULT NOW(),
    verified_at TIMESTAMPTZ,
    region TEXT,
    reg_number TEXT,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    radius DOUBLE PRECISION DEFAULT 50.0
);

-- 3. ngo_inventory table (Tracks NGO stock capacity per resource type)
CREATE TABLE IF NOT EXISTS ngo_inventory (
    id TEXT PRIMARY KEY,
    ngo_id TEXT NOT NULL REFERENCES ngos(id) ON DELETE CASCADE,
    resource_type TEXT NOT NULL,
    total_quantity INTEGER NOT NULL DEFAULT 0,
    reserved_quantity INTEGER NOT NULL DEFAULT 0,
    available_quantity INTEGER NOT NULL DEFAULT 0,
    unit TEXT DEFAULT 'units',
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_total_non_negative CHECK (total_quantity >= 0),
    CONSTRAINT chk_reserved_non_negative CHECK (reserved_quantity >= 0),
    CONSTRAINT chk_reserved_le_total CHECK (reserved_quantity <= total_quantity),
    CONSTRAINT uq_ngo_resource UNIQUE (ngo_id, resource_type)
);

-- 4. volunteers_auth table (Password-based auth flow support)
CREATE TABLE IF NOT EXISTS volunteers_auth (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT,
    phone TEXT,
    location TEXT,
    skills TEXT[],
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    available BOOLEAN DEFAULT TRUE,
    registered_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. volunteers table (Operational volunteer profiles)
CREATE TABLE IF NOT EXISTS volunteers (
    id TEXT PRIMARY KEY,
    name TEXT,
    email TEXT,
    phone TEXT,
    skills TEXT[],
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    available BOOLEAN DEFAULT TRUE,
    active_assignments INTEGER DEFAULT 0,
    registered_at TIMESTAMPTZ DEFAULT NOW(),
    ngo_id TEXT REFERENCES ngos(id) ON DELETE SET NULL,
    ngo_verified BOOLEAN DEFAULT FALSE,
    specialty TEXT,
    vehicle TEXT,
    ngo_affiliation TEXT,
    verification_code TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. needs_reports table (Emergency requests with structured extraction)
CREATE TABLE IF NOT EXISTS needs_reports (
    id TEXT PRIMARY KEY,
    reporter_name TEXT,
    reporter_phone TEXT,
    location_text TEXT,
    description TEXT,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    resource_type TEXT DEFAULT 'food',
    required_quantity INTEGER DEFAULT 0,
    fulfilled_quantity INTEGER DEFAULT 0,
    unit TEXT DEFAULT 'units',
    urgency TEXT DEFAULT 'medium',
    severity TEXT DEFAULT 'medium',
    category TEXT DEFAULT 'supplies',
    status TEXT DEFAULT 'open',
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    trust_score INTEGER DEFAULT 50,
    summary_en TEXT,
    summary_local TEXT,
    disaster_type TEXT,
    help_needed TEXT
);

-- 7. ngo_allocations table (Links needs to partial / full NGO allocations)
CREATE TABLE IF NOT EXISTS ngo_allocations (
    id TEXT PRIMARY KEY,
    need_id TEXT NOT NULL REFERENCES needs_reports(id) ON DELETE CASCADE,
    ngo_id TEXT NOT NULL REFERENCES ngos(id) ON DELETE CASCADE,
    resource_type TEXT NOT NULL,
    allocated_quantity INTEGER NOT NULL,
    status TEXT DEFAULT 'allocated',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_positive_allocated_quantity CHECK (allocated_quantity > 0)
);

-- 8. assignments table (Coordinates volunteers to delivered needs)
CREATE TABLE IF NOT EXISTS assignments (
    id TEXT PRIMARY KEY,
    need_id TEXT NOT NULL REFERENCES needs_reports(id) ON DELETE CASCADE,
    need_description TEXT,
    need_location TEXT,
    volunteer_id TEXT NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
    volunteer_name TEXT,
    volunteer_phone TEXT,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'assigned',
    resolved_at TIMESTAMPTZ
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_needs_status ON needs_reports(status);
CREATE INDEX IF NOT EXISTS idx_needs_geo ON needs_reports(lat, lng);
CREATE INDEX IF NOT EXISTS idx_inventory_ngo_resource ON ngo_inventory(ngo_id, resource_type);
CREATE INDEX IF NOT EXISTS idx_allocations_need ON ngo_allocations(need_id);
CREATE INDEX IF NOT EXISTS idx_volunteers_dispatch ON volunteers(available, ngo_verified);
CREATE INDEX IF NOT EXISTS idx_assignments_need_vol ON assignments(need_id, volunteer_id);
CREATE INDEX IF NOT EXISTS idx_otps_expiry ON otps(expires_at);
