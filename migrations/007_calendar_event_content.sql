-- Store remarks for special calendar events.
ALTER TABLE calendar_events
    ADD COLUMN IF NOT EXISTS content TEXT;
