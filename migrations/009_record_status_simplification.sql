-- Simplify record statuses to PENDING / COMPLETED / CANCELLED and keep legacy rows compatible.
UPDATE records
SET status = CASE
    WHEN status IN ('COMPLETED', 'DONE') THEN 'COMPLETED'
    WHEN status = 'CANCELLED' THEN 'CANCELLED'
    ELSE 'PENDING'
END;

UPDATE calendar_events
SET status = CASE
    WHEN LOWER(status) IN ('completed', 'done') THEN 'completed'
    WHEN LOWER(status) = 'cancelled' THEN 'cancelled'
    WHEN LOWER(COALESCE(event_type, '')) IN ('rest', 'blocked', 'full') THEN LOWER(event_type)
    ELSE 'pending'
END
WHERE record_id IS NOT NULL;

DO $$
DECLARE
    constraint_name text;
BEGIN
    SELECT conname INTO constraint_name
    FROM pg_constraint
    WHERE conrelid = 'records'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%status%';

    IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE records DROP CONSTRAINT %I', constraint_name);
    END IF;
END $$;

ALTER TABLE records
    ADD CONSTRAINT chk_records_status
    CHECK (status IN ('PENDING', 'COMPLETED', 'CANCELLED'));
