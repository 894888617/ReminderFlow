package operationlog

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

type OperationLog struct {
	ID          int64     `json:"id"`
	WorkspaceID int64     `json:"workspace_id"`
	RecordID    *int64    `json:"record_id"`
	UserID      *int64    `json:"user_id"`
	Username    string    `json:"username"`
	Action      string    `json:"action"`
	Detail      string    `json:"detail"`
	CreatedAt   time.Time `json:"created_at"`
}

type CreateLogParams struct {
	WorkspaceID int64
	RecordID    *int64
	UserID      *int64
	Action      string
	Detail      string
}

func (r *Repository) Create(ctx context.Context, params CreateLogParams) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO operation_logs (
			workspace_id,
			record_id,
			user_id,
			action,
			detail,
			created_at
		)
		VALUES ($1, $2, $3, $4, $5, NOW())
	`,
		params.WorkspaceID,
		params.RecordID,
		params.UserID,
		params.Action,
		params.Detail,
	)

	return err
}

func (r *Repository) ListByRecordID(ctx context.Context, recordID int64) ([]OperationLog, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
			ol.id,
			ol.workspace_id,
			ol.record_id,
			ol.user_id,
			COALESCE(NULLIF(u.nickname, ''), u.username, ''),
			ol.action,
			COALESCE(ol.detail, ''),
			ol.created_at
		FROM operation_logs ol
		LEFT JOIN users u ON u.id = ol.user_id
		WHERE ol.record_id = $1
		ORDER BY ol.created_at DESC
		LIMIT 100
	`, recordID)

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := make([]OperationLog, 0)

	for rows.Next() {
		var item OperationLog

		if err := rows.Scan(
			&item.ID,
			&item.WorkspaceID,
			&item.RecordID,
			&item.UserID,
			&item.Username,
			&item.Action,
			&item.Detail,
			&item.CreatedAt,
		); err != nil {
			return nil, err
		}

		list = append(list, item)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return list, nil
}
