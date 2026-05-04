-- =========================================================
-- ReminderFlow / 轻记协同
-- Initial Database Schema
-- PostgreSQL
-- =========================================================

-- CREATE DATABASE reminder;

-- =========================
-- 1. users 用户表
-- =========================

CREATE TABLE IF NOT EXISTS users (
                                     id BIGSERIAL PRIMARY KEY,
                                     username VARCHAR(64) NOT NULL UNIQUE,
                                     email VARCHAR(128) UNIQUE,
                                     password_hash TEXT NOT NULL,
                                     created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                                     updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_username
    ON users(username);

CREATE INDEX IF NOT EXISTS idx_users_email
    ON users(email);


-- =========================
-- 2. workspaces 协作空间表
-- =========================

CREATE TABLE IF NOT EXISTS workspaces (
                                          id BIGSERIAL PRIMARY KEY,
                                          name VARCHAR(128) NOT NULL,
                                          owner_id BIGINT NOT NULL REFERENCES users(id),
                                          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                                          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workspaces_owner_id
    ON workspaces(owner_id);

CREATE INDEX IF NOT EXISTS idx_workspaces_created_at
    ON workspaces(created_at);


-- =========================
-- 3. workspace_members 空间成员表
-- =========================

CREATE TABLE IF NOT EXISTS workspace_members (
                                                 id BIGSERIAL PRIMARY KEY,
                                                 workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                                                 user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                                                 role VARCHAR(32) NOT NULL DEFAULT 'member',
                                                 created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                                                 UNIQUE(workspace_id, user_id),
                                                 CONSTRAINT chk_workspace_members_role
                                                     CHECK (role IN ('owner', 'member', 'viewer'))
);

CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace_id
    ON workspace_members(workspace_id);

CREATE INDEX IF NOT EXISTS idx_workspace_members_user_id
    ON workspace_members(user_id);

CREATE INDEX IF NOT EXISTS idx_workspace_members_role
    ON workspace_members(role);


-- =========================
-- 4. records 协同记录 / 任务表
-- =========================

CREATE TABLE IF NOT EXISTS records (
                                       id BIGSERIAL PRIMARY KEY,
                                       workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                                       title VARCHAR(200) NOT NULL,
                                       content TEXT,
                                       creator_id BIGINT NOT NULL REFERENCES users(id),
                                       assignee_id BIGINT REFERENCES users(id),
                                       status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
                                       due_at TIMESTAMP,
                                       created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                                       updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
                                       CONSTRAINT chk_records_status
                                           CHECK (status IN ('PENDING', 'IN_PROGRESS', 'DONE', 'OVERDUE', 'CANCELLED'))
);

CREATE INDEX IF NOT EXISTS idx_records_workspace_id
    ON records(workspace_id);

CREATE INDEX IF NOT EXISTS idx_records_creator_id
    ON records(creator_id);

CREATE INDEX IF NOT EXISTS idx_records_assignee_id
    ON records(assignee_id);

CREATE INDEX IF NOT EXISTS idx_records_status
    ON records(status);

CREATE INDEX IF NOT EXISTS idx_records_due_at
    ON records(due_at);

CREATE INDEX IF NOT EXISTS idx_records_created_at
    ON records(created_at);

CREATE INDEX IF NOT EXISTS idx_records_workspace_status
    ON records(workspace_id, status);

CREATE INDEX IF NOT EXISTS idx_records_workspace_assignee
    ON records(workspace_id, assignee_id);

CREATE INDEX IF NOT EXISTS idx_records_workspace_due
    ON records(workspace_id, due_at);

CREATE INDEX IF NOT EXISTS idx_records_workspace_created
    ON records(workspace_id, created_at);

CREATE INDEX IF NOT EXISTS idx_records_assignee_status_due
    ON records(assignee_id, status, due_at);

CREATE INDEX IF NOT EXISTS idx_records_due_status
    ON records(due_at, status);

CREATE INDEX IF NOT EXISTS idx_records_assignee_status
    ON records(assignee_id, status);


-- =========================
-- 5. reminders 定时提醒表
-- =========================

CREATE TABLE IF NOT EXISTS reminders (
                                         id BIGSERIAL PRIMARY KEY,
                                         record_id BIGINT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
                                         remind_at TIMESTAMP NOT NULL,
                                         repeat_type VARCHAR(32) NOT NULL DEFAULT 'NONE',
                                         notified BOOLEAN NOT NULL DEFAULT FALSE,
                                         created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                                         CONSTRAINT chk_reminders_repeat_type
                                             CHECK (repeat_type IN ('NONE', 'DAILY', 'WEEKLY', 'MONTHLY'))
);

CREATE INDEX IF NOT EXISTS idx_reminders_record_id
    ON reminders(record_id);

CREATE INDEX IF NOT EXISTS idx_reminders_remind_at
    ON reminders(remind_at);

CREATE INDEX IF NOT EXISTS idx_reminders_notified
    ON reminders(notified);

CREATE INDEX IF NOT EXISTS idx_reminders_notified_remind_at
    ON reminders(notified, remind_at);


-- =========================
-- 6. notifications 通知表
-- =========================

CREATE TABLE IF NOT EXISTS notifications (
                                             id BIGSERIAL PRIMARY KEY,
                                             user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                                             record_id BIGINT REFERENCES records(id) ON DELETE SET NULL,
                                             title VARCHAR(200) NOT NULL,
                                             content TEXT,
                                             read BOOLEAN NOT NULL DEFAULT FALSE,
                                             created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id
    ON notifications(user_id);

CREATE INDEX IF NOT EXISTS idx_notifications_record_id
    ON notifications(record_id);

CREATE INDEX IF NOT EXISTS idx_notifications_read
    ON notifications(read);

CREATE INDEX IF NOT EXISTS idx_notifications_created_at
    ON notifications(created_at);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read_created
    ON notifications(user_id, read, created_at);


-- =========================
-- 7. operation_logs 操作日志表
-- =========================

CREATE TABLE IF NOT EXISTS operation_logs (
                                              id BIGSERIAL PRIMARY KEY,
                                              workspace_id BIGINT REFERENCES workspaces(id) ON DELETE SET NULL,
                                              record_id BIGINT REFERENCES records(id) ON DELETE SET NULL,
                                              user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
                                              action VARCHAR(64) NOT NULL,
                                              detail TEXT,
                                              created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operation_logs_workspace_id
    ON operation_logs(workspace_id);

CREATE INDEX IF NOT EXISTS idx_operation_logs_record_id
    ON operation_logs(record_id);

CREATE INDEX IF NOT EXISTS idx_operation_logs_user_id
    ON operation_logs(user_id);

CREATE INDEX IF NOT EXISTS idx_operation_logs_action
    ON operation_logs(action);

CREATE INDEX IF NOT EXISTS idx_operation_logs_created_at
    ON operation_logs(created_at);


-- =========================
-- 8. attachments 附件表：预留
-- 当前前端暂未接入文件上传，但先预留结构
-- =========================

CREATE TABLE IF NOT EXISTS attachments (
                                           id BIGSERIAL PRIMARY KEY,
                                           record_id BIGINT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
                                           uploader_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
                                           filename VARCHAR(255) NOT NULL,
                                           file_url TEXT NOT NULL,
                                           mime_type VARCHAR(128),
                                           size_bytes BIGINT,
                                           created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attachments_record_id
    ON attachments(record_id);

CREATE INDEX IF NOT EXISTS idx_attachments_uploader_id
    ON attachments(uploader_id);

CREATE INDEX IF NOT EXISTS idx_attachments_created_at
    ON attachments(created_at);


-- =========================
-- 9. 自动更新时间 updated_at 触发器
-- =========================

CREATE OR REPLACE FUNCTION set_updated_at()
    RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


DROP TRIGGER IF EXISTS trg_workspaces_updated_at ON workspaces;
CREATE TRIGGER trg_workspaces_updated_at
    BEFORE UPDATE ON workspaces
    FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


DROP TRIGGER IF EXISTS trg_records_updated_at ON records;
CREATE TRIGGER trg_records_updated_at
    BEFORE UPDATE ON records
    FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


-- =========================
-- 10. 初始化完成提示
-- =========================

DO $$
    BEGIN
        RAISE NOTICE 'ReminderFlow database initialized successfully.';
    END $$;