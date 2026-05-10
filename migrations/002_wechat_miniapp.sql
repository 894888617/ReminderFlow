-- =========================================================
-- ReminderFlow
-- WeChat Mini Program Extension
-- =========================================================

-- 1. users 增加微信小程序身份字段
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS wechat_openid VARCHAR(128);

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS wechat_unionid VARCHAR(128);

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS nickname VARCHAR(128);

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS avatar_url TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_wechat_openid
    ON users(wechat_openid)
    WHERE wechat_openid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_wechat_unionid
    ON users(wechat_unionid);


-- 2. workspace_invites 空间邀请表
CREATE TABLE IF NOT EXISTS workspace_invites (
                                                 id BIGSERIAL PRIMARY KEY,
                                                 workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    inviter_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invite_code VARCHAR(64) NOT NULL UNIQUE,
    role VARCHAR(32) NOT NULL DEFAULT 'member',
    expire_at TIMESTAMP,
    used_count INT NOT NULL DEFAULT 0,
    max_use_count INT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_workspace_invites_role
    CHECK (role IN ('member', 'viewer'))
    );

CREATE INDEX IF NOT EXISTS idx_workspace_invites_workspace_id
    ON workspace_invites(workspace_id);

CREATE INDEX IF NOT EXISTS idx_workspace_invites_inviter_id
    ON workspace_invites(inviter_id);

CREATE INDEX IF NOT EXISTS idx_workspace_invites_invite_code
    ON workspace_invites(invite_code);

CREATE INDEX IF NOT EXISTS idx_workspace_invites_expire_at
    ON workspace_invites(expire_at);


-- 3. user_subscriptions 小程序订阅消息授权记录表
CREATE TABLE IF NOT EXISTS user_subscriptions (
                                                  id BIGSERIAL PRIMARY KEY,
                                                  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    template_id VARCHAR(128) NOT NULL,
    scene VARCHAR(64) NOT NULL,
    accepted BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, template_id, scene)
    );

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id
    ON user_subscriptions(user_id);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_template_scene
    ON user_subscriptions(template_id, scene);


-- 4. user_devices 预留：后续 App Push 可复用
CREATE TABLE IF NOT EXISTS user_devices (
                                            id BIGSERIAL PRIMARY KEY,
                                            user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform VARCHAR(32) NOT NULL,
    push_token TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, push_token)
    );

CREATE INDEX IF NOT EXISTS idx_user_devices_user_id
    ON user_devices(user_id);

CREATE INDEX IF NOT EXISTS idx_user_devices_platform
    ON user_devices(platform);


DO $$
BEGIN
    RAISE NOTICE 'ReminderFlow WeChat miniapp extension initialized successfully.';
END $$;