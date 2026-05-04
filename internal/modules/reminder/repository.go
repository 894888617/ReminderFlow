package reminder

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{
		db: db,
	}
}

type Reminder struct {
	ID          int64     `json:"id"`
	RecordID    int64     `json:"record_id"`
	WorkspaceID int64     `json:"workspace_id"`
	RecordTitle string    `json:"record_title"`
	AssigneeID  *int64    `json:"assignee_id"`
	RemindAt    time.Time `json:"remind_at"`
	RepeatType  string    `json:"repeat_type"`
	Notified    bool      `json:"notified"`
	CreatedAt   time.Time `json:"created_at"`
}

type CreateReminderParams struct {
	RecordID   int64
	RemindAt   time.Time
	RepeatType string
}

func (r *Repository) GetRecordWorkspaceID(ctx context.Context, recordID int64) (int64, error) {
	var workspaceID int64

	err := r.db.QueryRow(ctx, `
		SELECT workspace_id
		FROM records
		WHERE id = $1
	`, recordID).Scan(&workspaceID)

	return workspaceID, err
}

func (r *Repository) GetWorkspaceMemberRole(ctx context.Context, workspaceID, userID int64) (string, error) {
	var role string

	err := r.db.QueryRow(ctx, `
		SELECT role
		FROM workspace_members
		WHERE workspace_id = $1
		  AND user_id = $2
	`, workspaceID, userID).Scan(&role)

	return role, err
}

func (r *Repository) Create(ctx context.Context, params CreateReminderParams) (*Reminder, error) {
	var item Reminder

	err := r.db.QueryRow(ctx, `
		INSERT INTO reminders (
			record_id,
			remind_at,
			repeat_type,
			notified
		)
		VALUES ($1, $2, $3, false)
		RETURNING
			id,
			record_id,
			remind_at,
			repeat_type,
			notified,
			created_at
	`,
		params.RecordID,
		params.RemindAt,
		params.RepeatType,
	).Scan(
		&item.ID,
		&item.RecordID,
		&item.RemindAt,
		&item.RepeatType,
		&item.Notified,
		&item.CreatedAt,
	)

	if err != nil {
		return nil, err
	}

	return &item, nil
}

func (r *Repository) ListToday(ctx context.Context, userID int64, start, end time.Time) ([]Reminder, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
			rm.id,
			rm.record_id,
			rec.workspace_id,
			rec.title,
			rec.assignee_id,
			rm.remind_at,
			rm.repeat_type,
			rm.notified,
			rm.created_at
		FROM reminders rm
		INNER JOIN records rec ON rec.id = rm.record_id
		INNER JOIN workspace_members wm ON wm.workspace_id = rec.workspace_id
		WHERE wm.user_id = $1
		  AND rec.assignee_id = $1
		  AND rm.remind_at >= $2
		  AND rm.remind_at < $3
		ORDER BY rm.remind_at ASC
	`, userID, start, end)

	if err != nil {
		return nil, err
	}

	defer rows.Close()

	list := make([]Reminder, 0)

	for rows.Next() {
		var item Reminder

		if err := rows.Scan(
			&item.ID,
			&item.RecordID,
			&item.WorkspaceID,
			&item.RecordTitle,
			&item.AssigneeID,
			&item.RemindAt,
			&item.RepeatType,
			&item.Notified,
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

func (r *Repository) ListUpcoming(ctx context.Context, userID int64, now time.Time) ([]Reminder, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
			rm.id,
			rm.record_id,
			rec.workspace_id,
			rec.title,
			rec.assignee_id,
			rm.remind_at,
			rm.repeat_type,
			rm.notified,
			rm.created_at
		FROM reminders rm
		INNER JOIN records rec ON rec.id = rm.record_id
		INNER JOIN workspace_members wm ON wm.workspace_id = rec.workspace_id
		WHERE wm.user_id = $1
		  AND rec.assignee_id = $1
		  AND rm.remind_at >= $2
		ORDER BY rm.remind_at ASC
		LIMIT 100
	`, userID, now)

	if err != nil {
		return nil, err
	}

	defer rows.Close()

	list := make([]Reminder, 0)

	for rows.Next() {
		var item Reminder

		if err := rows.Scan(
			&item.ID,
			&item.RecordID,
			&item.WorkspaceID,
			&item.RecordTitle,
			&item.AssigneeID,
			&item.RemindAt,
			&item.RepeatType,
			&item.Notified,
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
