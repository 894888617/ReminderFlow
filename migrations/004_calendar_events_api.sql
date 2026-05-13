-- =========================================================
-- ReminderFlow
-- Calendar events API support
-- =========================================================

ALTER TABLE records
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_records_deleted_at
    ON records(deleted_at);

CREATE TABLE IF NOT EXISTS calendar_events (
    id BIGSERIAL PRIMARY KEY,
    calendar_id BIGINT NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
    record_id BIGINT REFERENCES records(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    start_at TIMESTAMP NOT NULL,
    end_at TIMESTAMP,
    all_day BOOLEAN NOT NULL DEFAULT TRUE,
    timezone VARCHAR(64) DEFAULT 'Asia/Shanghai',
    status VARCHAR(32) DEFAULT 'active',
    created_by BIGINT NOT NULL REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_calendar_id
    ON calendar_events(calendar_id);

CREATE INDEX IF NOT EXISTS idx_calendar_events_record_id
    ON calendar_events(record_id);

CREATE INDEX IF NOT EXISTS idx_calendar_events_start_at
    ON calendar_events(start_at);

CREATE INDEX IF NOT EXISTS idx_calendar_events_deleted_at
    ON calendar_events(deleted_at);

CREATE INDEX IF NOT EXISTS idx_calendar_events_calendar_start_active
    ON calendar_events(calendar_id, start_at)
    WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_calendar_events_updated_at ON calendar_events;
CREATE TRIGGER trg_calendar_events_updated_at
    BEFORE UPDATE ON calendar_events
    FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
