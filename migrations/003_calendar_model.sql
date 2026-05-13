-- =========================================================
-- ReminderFlow / 轻记协同
-- Calendar Model Migration
--
-- This migration introduces calendars as the collaboration root while
-- keeping legacy workspace tables in place for rollback/data inspection.
-- It is intentionally idempotent because migrations are executed on startup.
-- =========================================================

-- =========================
-- 1. calendars 日历表
-- =========================
CREATE TABLE IF NOT EXISTS calendars (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    color VARCHAR(32) DEFAULT '#1677ff',
    timezone VARCHAR(64) DEFAULT 'Asia/Shanghai',
    cover_url TEXT,
    owner_id BIGINT NOT NULL REFERENCES users(id),
    visibility VARCHAR(32) DEFAULT 'private',
    status VARCHAR(32) DEFAULT 'active',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_calendars_owner_id
    ON calendars(owner_id);

CREATE INDEX IF NOT EXISTS idx_calendars_status
    ON calendars(status);

CREATE INDEX IF NOT EXISTS idx_calendars_created_at
    ON calendars(created_at);

-- =========================
-- 2. calendar_members 日历成员表
-- =========================
CREATE TABLE IF NOT EXISTS calendar_members (
    id BIGSERIAL PRIMARY KEY,
    calendar_id BIGINT NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(32) NOT NULL,
    status VARCHAR(32) DEFAULT 'active',
    joined_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(calendar_id, user_id),
    CONSTRAINT chk_calendar_members_role
        CHECK (role IN ('owner', 'member', 'viewer'))
);

CREATE INDEX IF NOT EXISTS idx_calendar_members_calendar_id
    ON calendar_members(calendar_id);

CREATE INDEX IF NOT EXISTS idx_calendar_members_user_id
    ON calendar_members(user_id);

CREATE INDEX IF NOT EXISTS idx_calendar_members_role
    ON calendar_members(role);

CREATE INDEX IF NOT EXISTS idx_calendar_members_status
    ON calendar_members(status);

-- =========================
-- 3. calendar_invites 日历邀请表
-- =========================
CREATE TABLE IF NOT EXISTS calendar_invites (
    id BIGSERIAL PRIMARY KEY,
    calendar_id BIGINT NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
    code VARCHAR(128) NOT NULL UNIQUE,
    role VARCHAR(32) NOT NULL DEFAULT 'member',
    expire_at TIMESTAMP NOT NULL,
    max_uses INT DEFAULT 1,
    used_count INT DEFAULT 0,
    created_by BIGINT NOT NULL REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP,
    CONSTRAINT chk_calendar_invites_role
        CHECK (role IN ('owner', 'member', 'viewer'))
);

CREATE INDEX IF NOT EXISTS idx_calendar_invites_calendar_id
    ON calendar_invites(calendar_id);

CREATE INDEX IF NOT EXISTS idx_calendar_invites_code
    ON calendar_invites(code);

CREATE INDEX IF NOT EXISTS idx_calendar_invites_created_by
    ON calendar_invites(created_by);

CREATE INDEX IF NOT EXISTS idx_calendar_invites_expire_at
    ON calendar_invites(expire_at);

-- =========================
-- 4. records / notifications 改为挂 calendar_id
-- =========================
ALTER TABLE records
    ADD COLUMN IF NOT EXISTS calendar_id BIGINT;

ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS calendar_id BIGINT;

ALTER TABLE user_subscriptions
    ADD COLUMN IF NOT EXISTS calendar_id BIGINT;

-- =========================
-- 5. calendar_events 日历事件表
-- =========================
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

CREATE INDEX IF NOT EXISTS idx_calendar_events_status
    ON calendar_events(status);

-- =========================
-- 6. 迁移旧 workspace 数据到 calendar 数据模型
-- =========================
DO $$
BEGIN
    IF to_regclass('public.workspaces') IS NOT NULL THEN
        INSERT INTO calendars (
            id,
            name,
            owner_id,
            created_at,
            updated_at
        )
        SELECT
            ws.id,
            LEFT(ws.name, 100),
            ws.owner_id,
            ws.created_at,
            ws.updated_at
        FROM workspaces ws
        ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            owner_id = EXCLUDED.owner_id,
            updated_at = EXCLUDED.updated_at;
    END IF;
END $$;

SELECT setval(
    pg_get_serial_sequence('calendars', 'id'),
    COALESCE((SELECT MAX(id) FROM calendars), 1),
    (SELECT COUNT(*) > 0 FROM calendars)
);

DO $$
BEGIN
    IF to_regclass('public.workspace_members') IS NOT NULL THEN
        INSERT INTO calendar_members (
            calendar_id,
            user_id,
            role,
            joined_at,
            created_at,
            updated_at
        )
        SELECT
            wm.workspace_id,
            wm.user_id,
            wm.role,
            wm.created_at,
            wm.created_at,
            wm.created_at
        FROM workspace_members wm
        INNER JOIN calendars c ON c.id = wm.workspace_id
        ON CONFLICT (calendar_id, user_id) DO UPDATE SET
            role = EXCLUDED.role,
            updated_at = EXCLUDED.updated_at;
    END IF;
END $$;

DO $$
BEGIN
    IF to_regclass('public.workspace_invites') IS NOT NULL THEN
        INSERT INTO calendar_invites (
            calendar_id,
            code,
            role,
            expire_at,
            max_uses,
            used_count,
            created_by,
            created_at,
            updated_at
        )
        SELECT
            wi.workspace_id,
            wi.invite_code,
            wi.role,
            COALESCE(wi.expire_at, wi.created_at + INTERVAL '7 days'),
            COALESCE(wi.max_use_count, 1),
            wi.used_count,
            wi.inviter_id,
            wi.created_at,
            wi.created_at
        FROM workspace_invites wi
        INNER JOIN calendars c ON c.id = wi.workspace_id
        ON CONFLICT (code) DO UPDATE SET
            calendar_id = EXCLUDED.calendar_id,
            role = EXCLUDED.role,
            expire_at = EXCLUDED.expire_at,
            max_uses = EXCLUDED.max_uses,
            used_count = EXCLUDED.used_count,
            updated_at = EXCLUDED.updated_at;
    END IF;
END $$;

DO $$
BEGIN
    IF to_regclass('public.records') IS NOT NULL
       AND EXISTS (
           SELECT 1
           FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = 'records'
             AND column_name = 'workspace_id'
       ) THEN
        UPDATE records rec
        SET calendar_id = rec.workspace_id
        WHERE rec.calendar_id IS NULL
          AND rec.workspace_id IS NOT NULL
          AND EXISTS (
              SELECT 1
              FROM calendars c
              WHERE c.id = rec.workspace_id
          );
    END IF;
END $$;

DO $$
BEGIN
    IF to_regclass('public.notifications') IS NOT NULL
       AND EXISTS (
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

DO $$
BEGIN
    IF to_regclass('public.notifications') IS NOT NULL
       AND to_regclass('public.records') IS NOT NULL THEN
        UPDATE notifications n
        SET calendar_id = rec.calendar_id
        FROM records rec
        WHERE n.record_id = rec.id
          AND n.calendar_id IS NULL
          AND rec.calendar_id IS NOT NULL;
    END IF;
END $$;

-- =========================
-- 7. calendar_id 约束与索引
-- =========================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_records_calendar_id'
    ) THEN
        ALTER TABLE records
            ADD CONSTRAINT fk_records_calendar_id
            FOREIGN KEY (calendar_id) REFERENCES calendars(id) ON DELETE CASCADE;
    END IF;
END $$;

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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_user_subscriptions_calendar_id'
    ) THEN
        ALTER TABLE user_subscriptions
            ADD CONSTRAINT fk_user_subscriptions_calendar_id
            FOREIGN KEY (calendar_id) REFERENCES calendars(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_records_calendar_id
    ON records(calendar_id);

CREATE INDEX IF NOT EXISTS idx_records_calendar_status
    ON records(calendar_id, status);

CREATE INDEX IF NOT EXISTS idx_records_calendar_assignee
    ON records(calendar_id, assignee_id);

CREATE INDEX IF NOT EXISTS idx_records_calendar_due
    ON records(calendar_id, due_at);

CREATE INDEX IF NOT EXISTS idx_records_calendar_created
    ON records(calendar_id, created_at);

CREATE INDEX IF NOT EXISTS idx_notifications_calendar_id
    ON notifications(calendar_id);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_calendar_id
    ON user_subscriptions(calendar_id);

-- =========================
-- 8. updated_at 触发器
-- =========================
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

DROP TRIGGER IF EXISTS trg_calendar_invites_updated_at ON calendar_invites;
CREATE TRIGGER trg_calendar_invites_updated_at
    BEFORE UPDATE ON calendar_invites
    FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_calendar_events_updated_at ON calendar_events;
CREATE TRIGGER trg_calendar_events_updated_at
    BEFORE UPDATE ON calendar_events
    FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Keep legacy workspace tables/columns for rollback. They are deprecated and
-- should no longer be used by new application code.
DO $$
BEGIN
    RAISE NOTICE 'ReminderFlow calendar model migration completed; legacy workspace tables are deprecated.';
END $$;

-- =========================
-- 9. record-related tables calendar ownership
-- =========================
ALTER TABLE reminders
    ADD COLUMN IF NOT EXISTS calendar_id BIGINT;

ALTER TABLE operation_logs
    ADD COLUMN IF NOT EXISTS calendar_id BIGINT;

UPDATE reminders rm
SET calendar_id = rec.calendar_id
FROM records rec
WHERE rm.record_id = rec.id
  AND rm.calendar_id IS NULL
  AND rec.calendar_id IS NOT NULL;

UPDATE operation_logs ol
SET calendar_id = rec.calendar_id
FROM records rec
WHERE ol.record_id = rec.id
  AND ol.calendar_id IS NULL
  AND rec.calendar_id IS NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_reminders_calendar_id'
    ) THEN
        ALTER TABLE reminders
            ADD CONSTRAINT fk_reminders_calendar_id
            FOREIGN KEY (calendar_id) REFERENCES calendars(id) ON DELETE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_operation_logs_calendar_id'
    ) THEN
        ALTER TABLE operation_logs
            ADD CONSTRAINT fk_operation_logs_calendar_id
            FOREIGN KEY (calendar_id) REFERENCES calendars(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_reminders_calendar_id
    ON reminders(calendar_id);

CREATE INDEX IF NOT EXISTS idx_operation_logs_calendar_id
    ON operation_logs(calendar_id);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'records'
          AND column_name = 'workspace_id'
          AND is_nullable = 'NO'
    ) THEN
        ALTER TABLE records
            ALTER COLUMN workspace_id DROP NOT NULL;
    END IF;
END $$;
