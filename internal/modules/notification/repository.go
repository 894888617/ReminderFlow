package notification

import (
	"context"
	"log"
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

type Notification struct {
	ID               int64      `json:"id"`
	CalendarID       *int64     `json:"calendar_id"`
	CalendarName     string     `json:"calendar_name"`
	UserID           int64      `json:"user_id"`
	RecordID         *int64     `json:"record_id"`
	NotificationType string     `json:"notification_type"`
	Title            string     `json:"title"`
	Content          string     `json:"content"`
	Read             bool       `json:"read"`
	ReadAt           *time.Time `json:"read_at"`
	CreatedAt        time.Time  `json:"created_at"`
}

type CreateParams struct {
	CalendarID       int64
	UserID           int64
	RecordID         *int64
	NotificationType string
	Title            string
	Content          string
}

func (r *Repository) Create(ctx context.Context, params CreateParams) error {
	if params.UserID <= 0 {
		log.Printf("warning: skip notification with invalid user_id=%d", params.UserID)
		return nil
	}

	tag, err := r.db.Exec(ctx, `
		INSERT INTO notifications (
			calendar_id,
			user_id,
			record_id,
			notification_type,
			title,
			content,
			read,
			created_at
		)
		SELECT NULLIF($1, 0), $2, $3, $4, $5, $6, false, NOW()
		WHERE EXISTS (SELECT 1 FROM users WHERE id = $2)
	`, params.CalendarID, params.UserID, params.RecordID, params.NotificationType, params.Title, params.Content)
	if err != nil {
		return err
	}

	if tag.RowsAffected() == 0 {
		log.Printf("warning: skip notification for missing user_id=%d", params.UserID)
	}

	return nil
}

func (r *Repository) CreateForRecord(ctx context.Context, userID int64, recordID int64, notificationType, title, content string) error {
	var calendarID int64
	err := r.db.QueryRow(ctx, `
		SELECT calendar_id
		FROM records
		WHERE id = $1
	`, recordID).Scan(&calendarID)
	if err != nil {
		return err
	}

	return r.Create(ctx, CreateParams{
		CalendarID:       calendarID,
		UserID:           userID,
		RecordID:         &recordID,
		NotificationType: notificationType,
		Title:            title,
		Content:          content,
	})
}

func (r *Repository) ListByUser(ctx context.Context, userID int64) ([]Notification, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
			n.id,
			n.calendar_id,
			COALESCE(c.name, ''),
			n.user_id,
			n.record_id,
			COALESCE(n.notification_type, ''),
			n.title,
			COALESCE(n.content, ''),
			n.read,
			n.read_at,
			n.created_at
		FROM notifications n
		LEFT JOIN calendars c ON c.id = n.calendar_id
		WHERE n.user_id = $1
		ORDER BY n.created_at DESC
		LIMIT 100
	`, userID)

	if err != nil {
		return nil, err
	}

	defer rows.Close()

	list := make([]Notification, 0)

	for rows.Next() {
		var item Notification

		if err := rows.Scan(
			&item.ID,
			&item.CalendarID,
			&item.CalendarName,
			&item.UserID,
			&item.RecordID,
			&item.NotificationType,
			&item.Title,
			&item.Content,
			&item.Read,
			&item.ReadAt,
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

func (r *Repository) MarkAsRead(ctx context.Context, notificationID, userID int64) error {
	_, err := r.db.Exec(ctx, `
		UPDATE notifications
		SET read = true,
			read_at = COALESCE(read_at, NOW())
		WHERE id = $1
		  AND user_id = $2
	`, notificationID, userID)

	return err
}

func (r *Repository) Delete(ctx context.Context, notificationID, userID int64) error {
	_, err := r.db.Exec(ctx, `
		DELETE FROM notifications
		WHERE id = $1
		  AND user_id = $2
	`, notificationID, userID)

	return err
}
