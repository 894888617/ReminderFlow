-- Associate special calendar events with a responsible member.
ALTER TABLE calendar_events
    ADD COLUMN IF NOT EXISTS assignee_id BIGINT REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_calendar_events_assignee_id
    ON calendar_events(assignee_id);
