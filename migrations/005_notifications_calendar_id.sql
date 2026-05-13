-- =========================================================
-- ReminderFlow
-- Notifications calendar ownership and unread metadata
-- =========================================================

ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS calendar_id BIGINT;

ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS notification_type VARCHAR(64) NOT NULL DEFAULT 'GENERAL';

ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS read_at TIMESTAMP;

UPDATE notifications n
SET calendar_id = rec.calendar_id
FROM records rec
WHERE n.record_id = rec.id
  AND n.calendar_id IS NULL
  AND rec.calendar_id IS NOT NULL;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'notifications'
          AND column_name = 'workspace_id'
    ) THEN
        UPDATE notifications n
        SET calendar_id = n.workspace_id
        WHERE n.calendar_id IS NULL
          AND n.workspace_id IS NOT NULL
          AND EXISTS (
              SELECT 1
              FROM calendars c
              WHERE c.id = n.workspace_id
          );
    END IF;
END $$;

UPDATE notifications
SET read_at = created_at
WHERE read = TRUE
  AND read_at IS NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_notifications_calendar_id'
    ) THEN
        ALTER TABLE notifications
            ADD CONSTRAINT fk_notifications_calendar_id
            FOREIGN KEY (calendar_id) REFERENCES calendars(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_notifications_calendar_id
    ON notifications(calendar_id);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read_created
    ON notifications(user_id, read, created_at);

CREATE INDEX IF NOT EXISTS idx_notifications_notification_type
    ON notifications(notification_type);
