package subscription

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

type UserSubscription struct {
	ID         int64     `json:"id"`
	UserID     int64     `json:"user_id"`
	TemplateID string    `json:"template_id"`
	Scene      string    `json:"scene"`
	Accepted   bool      `json:"accepted"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

type UpsertSubscriptionParams struct {
	UserID     int64
	TemplateID string
	Scene      string
	Accepted   bool
}

func (r *Repository) Upsert(ctx context.Context, params UpsertSubscriptionParams) (*UserSubscription, error) {
	var item UserSubscription

	err := r.db.QueryRow(ctx, `
		INSERT INTO user_subscriptions (
			user_id,
			template_id,
			scene,
			accepted,
			created_at,
			updated_at
		)
		VALUES ($1, $2, $3, $4, NOW(), NOW())
		ON CONFLICT (user_id, template_id, scene)
		DO UPDATE SET
			accepted = EXCLUDED.accepted,
			updated_at = NOW()
		RETURNING
			id,
			user_id,
			template_id,
			scene,
			accepted,
			created_at,
			updated_at
	`, params.UserID, params.TemplateID, params.Scene, params.Accepted).Scan(
		&item.ID,
		&item.UserID,
		&item.TemplateID,
		&item.Scene,
		&item.Accepted,
		&item.CreatedAt,
		&item.UpdatedAt,
	)

	if err != nil {
		return nil, err
	}

	return &item, nil
}

func (r *Repository) HasAccepted(ctx context.Context, userID int64, templateID string, scene string) (bool, error) {
	var exists bool

	err := r.db.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM user_subscriptions
			WHERE user_id = $1
			  AND template_id = $2
			  AND scene = $3
			  AND accepted = TRUE
		)
	`, userID, templateID, scene).Scan(&exists)

	return exists, err
}

func (r *Repository) GetUserWechatOpenID(ctx context.Context, userID int64) (string, error) {
	var openID string

	err := r.db.QueryRow(ctx, `
		SELECT COALESCE(wechat_openid, '')
		FROM users
		WHERE id = $1
	`, userID).Scan(&openID)

	return openID, err
}
