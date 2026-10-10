-- Migration 002: Add Trust & Verification Metadata Columns and Performance Indexes
-- Applies to `needs_reports` table for Phase 2 / Trust Engine V2 integration.
-- Idempotent: safe to run multiple times.

ALTER TABLE needs_reports ADD COLUMN IF NOT EXISTS trust_tier TEXT DEFAULT 'unscored';
ALTER TABLE needs_reports ADD COLUMN IF NOT EXISTS dispatch_action TEXT DEFAULT 'human_review';
ALTER TABLE needs_reports ADD COLUMN IF NOT EXISTS trust_reasons JSONB DEFAULT '[]'::jsonb;
ALTER TABLE needs_reports ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'MEDIUM';
ALTER TABLE needs_reports ADD COLUMN IF NOT EXISTS engine_version TEXT DEFAULT '2.0.0';
ALTER TABLE needs_reports ADD COLUMN IF NOT EXISTS text_hash TEXT;
ALTER TABLE needs_reports ADD COLUMN IF NOT EXISTS flag TEXT DEFAULT 'unverified';

-- Performance & duplicate-detection indexes
CREATE INDEX IF NOT EXISTS idx_needs_text_hash ON needs_reports(text_hash);
CREATE INDEX IF NOT EXISTS idx_needs_phone_timestamp ON needs_reports(reporter_phone, timestamp);
CREATE INDEX IF NOT EXISTS idx_needs_trust_tier ON needs_reports(trust_tier);
CREATE INDEX IF NOT EXISTS idx_needs_dispatch_action ON needs_reports(dispatch_action);
