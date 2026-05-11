package notification

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

type Notification struct {
	ID        int64     `json:"id"`
	UserID    int64     `json:"user_id"`
	RecordID  *int64    `json:"record_id"`
	Title     string    `json:"title"`
	Content   string    `json:"content"`
	Read      bool      `json:"read"`
	CreatedAt time.Time `json:"created_at"`
}

func (r *Repository) Create(ctx context.Context, userID int64, recordID int64, title, content string) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO notifications (
			user_id,
			record_id,
			title,
			content,
			read,
			created_at
		)
		VALUES ($1, $2, $3, $4, false, NOW())
	`, userID, recordID, title, content)

	return err
}

func (r *Repository) ListByUser(ctx context.Context, userID int64) ([]Notification, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
			id,
			user_id,
			record_id,
			title,
			COALESCE(content, ''),
			read,
			created_at
		FROM notifications
		WHERE user_id = $1
		ORDER BY created_at DESC
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
			&item.UserID,
			&item.RecordID,
			&item.Title,
			&item.Content,
			&item.Read,
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
		SET read = true
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
