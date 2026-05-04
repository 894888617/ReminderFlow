package scheduler

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/robfig/cron/v3"
)

type OverdueScheduler struct {
	db *pgxpool.Pool
}

func NewOverdueScheduler(db *pgxpool.Pool) *OverdueScheduler {
	return &OverdueScheduler{
		db: db,
	}
}

func (s *OverdueScheduler) Start() {
	c := cron.New(cron.WithSeconds())

	_, err := c.AddFunc("0 */1 * * * *", func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		if err := s.ScanAndMarkOverdue(ctx); err != nil {
			log.Printf("scan overdue records failed: %v", err)
		}
	})

	if err != nil {
		log.Printf("add overdue cron failed: %v", err)
		return
	}

	c.Start()
	log.Println("overdue scheduler started")
}

type OverdueRecord struct {
	ID          int64
	WorkspaceID int64
	Title       string
	CreatorID   int64
	AssigneeID  *int64
}

func (s *OverdueScheduler) ScanAndMarkOverdue(ctx context.Context) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	rows, err := tx.Query(ctx, `
		SELECT
			id,
			workspace_id,
			title,
			creator_id,
			assignee_id
		FROM records
		WHERE due_at IS NOT NULL
		  AND due_at < NOW()
		  AND status NOT IN ('DONE', 'CANCELLED', 'OVERDUE')
		ORDER BY due_at ASC
		LIMIT 100
		FOR UPDATE SKIP LOCKED
	`)

	if err != nil {
		return err
	}

	overdueList := make([]OverdueRecord, 0)

	for rows.Next() {
		var item OverdueRecord

		if err := rows.Scan(
			&item.ID,
			&item.WorkspaceID,
			&item.Title,
			&item.CreatorID,
			&item.AssigneeID,
		); err != nil {
			rows.Close()
			return err
		}

		overdueList = append(overdueList, item)
	}

	rows.Close()

	if err := rows.Err(); err != nil {
		return err
	}

	for _, item := range overdueList {
		_, err := tx.Exec(ctx, `
			UPDATE records
			SET
				status = 'OVERDUE',
				updated_at = NOW()
			WHERE id = $1
		`, item.ID)

		if err != nil {
			return err
		}

		notifyUserID := item.CreatorID
		if item.AssigneeID != nil {
			notifyUserID = *item.AssigneeID
		}

		notificationTitle := "任务已逾期"
		notificationContent := fmt.Sprintf("记录「%s」已超过截止时间，请尽快处理。", item.Title)

		_, err = tx.Exec(ctx, `
			INSERT INTO notifications (
				user_id,
				record_id,
				title,
				content,
				read,
				created_at
			)
			VALUES ($1, $2, $3, $4, false, NOW())
		`, notifyUserID, item.ID, notificationTitle, notificationContent)

		if err != nil {
			return err
		}

		detail := fmt.Sprintf("系统自动将记录「%s」标记为 OVERDUE", item.Title)

		_, err = tx.Exec(ctx, `
			INSERT INTO operation_logs (
				workspace_id,
				record_id,
				user_id,
				action,
				detail,
				created_at
			)
			VALUES ($1, $2, NULL, $3, $4, NOW())
		`, item.WorkspaceID, item.ID, "MARK_OVERDUE", detail)

		if err != nil {
			return err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return err
	}

	if len(overdueList) > 0 {
		log.Printf("marked overdue records and sent notifications: %d", len(overdueList))
	}

	return nil
}
