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
	CalendarID  int64     `json:"calendar_id"`
	RecordTitle string    `json:"record_title"`
	AssigneeID  *int64    `json:"assignee_id"`
	RemindAt    time.Time `json:"remind_at"`
	RepeatType  string    `json:"repeat_type"`
	Notified    bool      `json:"notified"`
	CreatedAt   time.Time `json:"created_at"`
}

type CreateReminderParams struct {
	CalendarID int64
	RecordID   int64
	RemindAt   time.Time
	RepeatType string
}

func (r *Repository) GetRecordCalendarID(ctx context.Context, recordID int64) (int64, error) {
	var calendarID int64

	err := r.db.QueryRow(ctx, `
		SELECT calendar_id
		FROM records
		WHERE id = $1
	`, recordID).Scan(&calendarID)

	return calendarID, err
}

func (r *Repository) GetCalendarMemberRole(ctx context.Context, calendarID, userID int64) (string, error) {
	var role string

	err := r.db.QueryRow(ctx, `
		SELECT role
		FROM calendar_members
		WHERE calendar_id = $1
		  AND user_id = $2
		  AND status = 'active' 
	`, calendarID, userID).Scan(&role)

	return role, err
}

func (r *Repository) Create(ctx context.Context, params CreateReminderParams) (*Reminder, error) {
	var item Reminder

	err := r.db.QueryRow(ctx, `
		INSERT INTO reminders (
			calendar_id,
			record_id,
			remind_at,
			repeat_type,
			notified
		)
		VALUES ($1, $2, $3, $4, false)
		RETURNING
			id,
			calendar_id,
			record_id,
			remind_at,
			repeat_type,
			notified,
			created_at
	`,
		params.CalendarID,
		params.RecordID,
		params.RemindAt,
		params.RepeatType,
	).Scan(
		&item.ID,
		&item.CalendarID,
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

func (r *Repository) ListByRecord(ctx context.Context, recordID int64) ([]Reminder, error) {
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
		WHERE rm.record_id = $1
		ORDER BY rm.remind_at ASC, rm.created_at ASC
	`, recordID)
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

func (r *Repository) ListToday(ctx context.Context, userID int64, start, end time.Time) ([]Reminder, error) {
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

	list := make([]Reminder, 0)

	for rows.Next() {
		var item Reminder

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

func (r *Repository) ListUpcoming(ctx context.Context, userID int64, now time.Time) ([]Reminder, error) {
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
