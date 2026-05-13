-- =========================================================
-- ReminderFlow
-- Calendar core module
-- =========================================================

CREATE TABLE IF NOT EXISTS calendars (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    description TEXT,
    color VARCHAR(32),
    timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',
    cover_url TEXT,
    owner_id BIGINT NOT NULL REFERENCES users(id),
    deleted_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calendars_owner_id
    ON calendars(owner_id);

CREATE INDEX IF NOT EXISTS idx_calendars_deleted_at
    ON calendars(deleted_at);

CREATE INDEX IF NOT EXISTS idx_calendars_created_at
    ON calendars(created_at);

CREATE TABLE IF NOT EXISTS calendar_members (
    id BIGSERIAL PRIMARY KEY,
    calendar_id BIGINT NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(32) NOT NULL DEFAULT 'member',
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    joined_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(calendar_id, user_id),
    CONSTRAINT chk_calendar_members_role
        CHECK (role IN ('owner', 'member', 'viewer')),
    CONSTRAINT chk_calendar_members_status
        CHECK (status IN ('active', 'removed'))
);

CREATE INDEX IF NOT EXISTS idx_calendar_members_calendar_id
    ON calendar_members(calendar_id);

CREATE INDEX IF NOT EXISTS idx_calendar_members_user_id
    ON calendar_members(user_id);

CREATE INDEX IF NOT EXISTS idx_calendar_members_role
    ON calendar_members(role);

CREATE INDEX IF NOT EXISTS idx_calendar_members_status
    ON calendar_members(status);

ALTER TABLE records
    ADD COLUMN IF NOT EXISTS calendar_id BIGINT REFERENCES calendars(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_records_calendar_id
    ON records(calendar_id);

CREATE INDEX IF NOT EXISTS idx_records_calendar_created
    ON records(calendar_id, created_at);

DROP TRIGGER IF EXISTS trg_calendars_updated_at ON calendars;
CREATE TRIGGER trg_calendars_updated_at
    BEFORE UPDATE ON calendars
    FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_calendar_members_updated_at ON calendar_members;
CREATE TRIGGER trg_calendar_members_updated_at
    BEFORE UPDATE ON calendar_members
    FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DO $$
BEGIN
    RAISE NOTICE 'ReminderFlow calendar module initialized successfully.';
END $$;
