package mobile

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

type RecentNotification struct {
	ID        int64     `json:"id"`
	RecordID  *int64    `json:"record_id"`
	Title     string    `json:"title"`
	Content   string    `json:"content"`
	Read      bool      `json:"read"`
	CreatedAt time.Time `json:"created_at"`
}

type RecentRecord struct {
	ID           int64      `json:"id"`
	WorkspaceID  int64      `json:"workspace_id"`
	Title        string     `json:"title"`
	Status       string     `json:"status"`
	DueAt        *time.Time `json:"due_at"`
	AssigneeID   *int64     `json:"assignee_id"`
	AssigneeName string     `json:"assignee_name"`
	CreatedAt    time.Time  `json:"created_at"`
}

type HomeSummary struct {
	TodayDueCount           int64                `json:"today_due_count"`
	TodayReminderCount      int64                `json:"today_reminder_count"`
	UnfinishedCount         int64                `json:"unfinished_count"`
	OverdueCount            int64                `json:"overdue_count"`
	UnreadNotificationCount int64                `json:"unread_notification_count"`
	RecentNotifications     []RecentNotification `json:"recent_notifications"`
	RecentRecords           []RecentRecord       `json:"recent_records"`
}

func (r *Repository) GetHomeSummary(ctx context.Context, userID int64) (*HomeSummary, error) {
	todayStart := time.Now().Truncate(24 * time.Hour)
	tomorrowStart := todayStart.Add(24 * time.Hour)

	result := &HomeSummary{
		RecentNotifications: make([]RecentNotification, 0),
		RecentRecords:       make([]RecentRecord, 0),
	}

	if err := r.db.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM records
		WHERE assignee_id = $1
		  AND due_at >= $2
		  AND due_at < $3
		  AND status NOT IN ('DONE', 'CANCELLED')
	`, userID, todayStart, tomorrowStart).Scan(&result.TodayDueCount); err != nil {
		return nil, err
	}

	if err := r.db.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM reminders rem
		INNER JOIN records rec ON rec.id = rem.record_id
		WHERE rec.assignee_id = $1
		  AND rem.remind_at >= $2
		  AND rem.remind_at < $3
	`, userID, todayStart, tomorrowStart).Scan(&result.TodayReminderCount); err != nil {
		return nil, err
	}

	if err := r.db.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM records
		WHERE assignee_id = $1
		  AND status NOT IN ('DONE', 'CANCELLED')
	`, userID).Scan(&result.UnfinishedCount); err != nil {
		return nil, err
	}

	if err := r.db.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM records
		WHERE assignee_id = $1
		  AND status = 'OVERDUE'
	`, userID).Scan(&result.OverdueCount); err != nil {
		return nil, err
	}

	if err := r.db.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM notifications
		WHERE user_id = $1
		  AND read = FALSE
	`, userID).Scan(&result.UnreadNotificationCount); err != nil {
		return nil, err
	}

	notificationRows, err := r.db.Query(ctx, `
		SELECT
			id,
			record_id,
			title,
			COALESCE(content, ''),
			read,
			created_at
		FROM notifications
		WHERE user_id = $1
		ORDER BY created_at DESC
		LIMIT 5
	`, userID)
	if err != nil {
		return nil, err
	}
	defer notificationRows.Close()

	for notificationRows.Next() {
		var item RecentNotification
		if err := notificationRows.Scan(
			&item.ID,
			&item.RecordID,
			&item.Title,
			&item.Content,
			&item.Read,
			&item.CreatedAt,
		); err != nil {
			return nil, err
		}

		result.RecentNotifications = append(result.RecentNotifications, item)
	}

	if err := notificationRows.Err(); err != nil {
		return nil, err
	}

	recordRows, err := r.db.Query(ctx, `
		SELECT
			rec.id,
			rec.workspace_id,
			rec.title,
			rec.status,
			rec.due_at,
			rec.assignee_id,
			COALESCE(NULLIF(u.nickname, ''), u.username, ''),
			rec.created_at
		FROM records rec
		LEFT JOIN users u ON u.id = rec.assignee_id
		WHERE rec.assignee_id = $1
		  AND rec.status NOT IN ('DONE', 'CANCELLED')
		ORDER BY
			CASE WHEN rec.status = 'OVERDUE' THEN 1 ELSE 2 END,
			CASE WHEN rec.due_at IS NULL THEN 1 ELSE 0 END,
			rec.due_at ASC,
			rec.created_at DESC
		LIMIT 5
	`, userID)
	if err != nil {
		return nil, err
	}
	defer recordRows.Close()

	for recordRows.Next() {
		var item RecentRecord
		if err := recordRows.Scan(
			&item.ID,
			&item.WorkspaceID,
			&item.Title,
			&item.Status,
			&item.DueAt,
			&item.AssigneeID,
			&item.AssigneeName,
			&item.CreatedAt,
		); err != nil {
			return nil, err
		}

		result.RecentRecords = append(result.RecentRecords, item)
	}

	if err := recordRows.Err(); err != nil {
		return nil, err
	}

	return result, nil
}
