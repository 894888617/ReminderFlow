-- =========================================================
-- ReminderFlow appointment calendar support
-- =========================================================

ALTER TABLE calendar_events
    ADD COLUMN IF NOT EXISTS event_type VARCHAR(32) NOT NULL DEFAULT 'record';

ALTER TABLE calendar_events
    ALTER COLUMN status SET DEFAULT 'pending';

ALTER TABLE records
    ADD COLUMN IF NOT EXISTS customer_name VARCHAR(128);

ALTER TABLE records
    ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(32);

ALTER TABLE records
    ADD COLUMN IF NOT EXISTS service_name VARCHAR(128);

CREATE INDEX IF NOT EXISTS idx_calendar_events_event_type
    ON calendar_events(event_type);

CREATE INDEX IF NOT EXISTS idx_calendar_events_status_lower
    ON calendar_events(LOWER(status));

CREATE INDEX IF NOT EXISTS idx_records_customer_name
    ON records(customer_name);

CREATE INDEX IF NOT EXISTS idx_records_customer_phone
    ON records(customer_phone);
