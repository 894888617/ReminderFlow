package todo

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

type TodoRecord struct {
	ID           int64      `json:"id"`
	CalendarID   int64      `json:"calendar_id"`
	Title        string     `json:"title"`
	Content      string     `json:"content"`
	CreatorID    int64      `json:"creator_id"`
	AssigneeID   *int64     `json:"assignee_id"`
	AssigneeName string     `json:"assignee_name"`
	Status       string     `json:"status"`
	DueAt        *time.Time `json:"due_at"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
}

type TodoReminder struct {
	ID          int64     `json:"id"`
	RecordID    int64     `json:"record_id"`
	CalendarID  int64     `json:"calendar_id"`
	RecordTitle string    `json:"record_title"`
	AssigneeID  *int64    `json:"assignee_id"`
	RemindAt    time.Time `json:"remind_at"`
	RepeatType  string    `json:"repeat_type"`
	Notified    bool      `json:"notified"`
	CreatedAt   time.Time `json:"created_at"`
}

func (r *Repository) ListDueToday(ctx context.Context, userID int64, start, end time.Time) ([]TodoRecord, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
			rec.id,
			rec.calendar_id,
			rec.title,
			COALESCE(rec.content, ''),
			rec.creator_id,
			rec.assignee_id,
			COALESCE(NULLIF(u.nickname, ''), u.username, ''),
			rec.status,
			rec.due_at,
			rec.created_at,
			rec.updated_at
		FROM records rec
		INNER JOIN calendar_members wm ON wm.calendar_id = rec.calendar_id
		LEFT JOIN users u ON u.id = rec.assignee_id
		WHERE wm.status = 'active'
		  AND wm.user_id = $1
		  AND rec.assignee_id = $1
		  AND rec.due_at >= $2
		  AND rec.due_at < $3
		  AND rec.status NOT IN ('COMPLETED', 'DONE', 'CANCELLED')
		ORDER BY rec.due_at ASC, rec.created_at DESC
	`, userID, start, end)

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := make([]TodoRecord, 0)

	for rows.Next() {
		var item TodoRecord

		if err := rows.Scan(
			&item.ID,
			&item.CalendarID,
			&item.Title,
			&item.Content,
			&item.CreatorID,
			&item.AssigneeID,
			&item.AssigneeName,
			&item.Status,
			&item.DueAt,
			&item.CreatedAt,
			&item.UpdatedAt,
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

func (r *Repository) ListRemindersToday(ctx context.Context, userID int64, start, end time.Time) ([]TodoReminder, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
			rm.id,
			rm.record_id,
			rec.calendar_id,
			rec.title,
			rec.assignee_id,
			rm.remind_at,
			rm.repeat_type,
			rm.notified,
			rm.created_at
		FROM reminders rm
		INNER JOIN records rec ON rec.id = rm.record_id
		INNER JOIN calendar_members wm ON wm.calendar_id = rec.calendar_id
		WHERE wm.status = 'active'
		  AND wm.user_id = $1
		  AND rec.assignee_id = $1
		  AND rm.remind_at >= $2
		  AND rm.remind_at < $3
		ORDER BY rm.remind_at ASC
	`, userID, start, end)

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := make([]TodoReminder, 0)

	for rows.Next() {
		var item TodoReminder

		if err := rows.Scan(
			&item.ID,
			&item.RecordID,
			&item.CalendarID,
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

func (r *Repository) ListUnfinished(ctx context.Context, userID int64) ([]TodoRecord, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
			rec.id,
			rec.calendar_id,
			rec.title,
			COALESCE(rec.content, ''),
			rec.creator_id,
			rec.assignee_id,
			COALESCE(NULLIF(u.nickname, ''), u.username, ''),
			rec.status,
			rec.due_at,
			rec.created_at,
			rec.updated_at
		FROM records rec
		INNER JOIN calendar_members wm ON wm.calendar_id = rec.calendar_id
		LEFT JOIN users u ON u.id = rec.assignee_id
		WHERE wm.status = 'active'
		  AND wm.user_id = $1
		  AND rec.assignee_id = $1
		  AND rec.status NOT IN ('COMPLETED', 'DONE', 'CANCELLED')
		ORDER BY 
			CASE 
				WHEN rec.due_at IS NULL THEN 1 
				ELSE 0 
			END,
			rec.due_at ASC,
			rec.created_at DESC
		LIMIT 100
	`, userID)

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := make([]TodoRecord, 0)

	for rows.Next() {
		var item TodoRecord

		if err := rows.Scan(
			&item.ID,
			&item.CalendarID,
			&item.Title,
			&item.Content,
			&item.CreatorID,
			&item.AssigneeID,
			&item.AssigneeName,
			&item.Status,
			&item.DueAt,
			&item.CreatedAt,
			&item.UpdatedAt,
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
