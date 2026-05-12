package wechatmini

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

type MiniUser struct {
	ID            int64     `json:"id"`
	Username      string    `json:"username"`
	Email         string    `json:"email"`
	WechatOpenID  string    `json:"wechat_openid"`
	WechatUnionID string    `json:"wechat_unionid"`
	Nickname      string    `json:"nickname"`
	AvatarURL     string    `json:"avatar_url"`
	CreatedAt     time.Time `json:"created_at"`
}

type UpsertWechatUserParams struct {
	OpenID    string
	UnionID   string
	Nickname  string
	AvatarURL string
}

func (r *Repository) FindUserByOpenID(ctx context.Context, openID string) (*MiniUser, error) {
	var user MiniUser

	err := r.db.QueryRow(ctx, `
		SELECT
			id,
			username,
			COALESCE(email, ''),
			COALESCE(wechat_openid, ''),
			COALESCE(wechat_unionid, ''),
			COALESCE(nickname, ''),
			COALESCE(avatar_url, ''),
			created_at
		FROM users
		WHERE wechat_openid = $1
	`, openID).Scan(
		&user.ID,
		&user.Username,
		&user.Email,
		&user.WechatOpenID,
		&user.WechatUnionID,
		&user.Nickname,
		&user.AvatarURL,
		&user.CreatedAt,
	)

	if err != nil {
		return nil, err
	}

	return &user, nil
}

func (r *Repository) UpsertWechatUser(ctx context.Context, params UpsertWechatUserParams) (*MiniUser, error) {
	var id int64
	defaultNickname := buildDefaultWechatNickname(params.OpenID)

	err := r.db.QueryRow(ctx, `
		SELECT id
		FROM users
		WHERE wechat_openid = $1
		   OR (NULLIF($2, '') IS NOT NULL AND wechat_unionid = $2)
		ORDER BY CASE WHEN wechat_openid = $1 THEN 0 ELSE 1 END, id ASC
		LIMIT 1
	`, params.OpenID, params.UnionID).Scan(&id)

	if err == nil {
		_, updateErr := r.db.Exec(ctx, `
			UPDATE users
			SET
				wechat_openid = $2,
				wechat_unionid = COALESCE(NULLIF($3, ''), wechat_unionid),
				nickname = COALESCE(NULLIF($4, ''), NULLIF(nickname, ''), $6),
				avatar_url = COALESCE(NULLIF($5, ''), avatar_url),
				updated_at = NOW()
			WHERE id = $1
		`, id, params.OpenID, params.UnionID, params.Nickname, params.AvatarURL, defaultNickname)

		if updateErr != nil {
			return nil, updateErr
		}

		return r.FindUserByOpenID(ctx, params.OpenID)
	}

	username := buildWechatUsername(params.OpenID)
	passwordHash := randomPasswordHashPlaceholder()

	err = r.db.QueryRow(ctx, `
		INSERT INTO users (
			username,
			email,
			password_hash,
			wechat_openid,
			wechat_unionid,
			nickname,
			avatar_url,
			created_at,
			updated_at
		)
		VALUES ($1, NULL, $2, $3, NULLIF($4, ''), NULLIF($5, ''), NULLIF($6, ''), NOW(), NOW())
		RETURNING id
	`, username, passwordHash, params.OpenID, params.UnionID, coalesceString(params.Nickname, defaultNickname), params.AvatarURL).Scan(&id)

	if err != nil {
		return nil, err
	}

	return r.FindUserByOpenID(ctx, params.OpenID)
}

func buildDefaultWechatNickname(openID string) string {
	openID = strings.TrimSpace(openID)

	if len(openID) <= 6 {
		return "微信用户"
	}

	return "微信用户" + openID[len(openID)-6:]
}

func coalesceString(values ...string) string {
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value != "" {
			return value
		}
	}

	return ""
}

func buildWechatUsername(openID string) string {
	openID = strings.TrimSpace(openID)

	if len(openID) <= 10 {
		return "wx_" + openID
	}

	return "wx_" + openID[len(openID)-10:]
}

func randomPasswordHashPlaceholder() string {
	buf := make([]byte, 16)
	_, err := rand.Read(buf)
	if err != nil {
		return fmt.Sprintf("wechat_%d", time.Now().UnixNano())
	}

	return "wechat_" + hex.EncodeToString(buf)
}
