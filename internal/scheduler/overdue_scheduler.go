package scheduler

import (
	"context"
	"fmt"
	"log"
	"reminder-flow/internal/modules/subscription"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/robfig/cron/v3"
)

type OverdueScheduler struct {
	db                  *pgxpool.Pool
	subscriptionService *subscription.Service
}

func NewOverdueScheduler(
	db *pgxpool.Pool,
	subscriptionService *subscription.Service,
) *OverdueScheduler {
	return &OverdueScheduler{
		db:                  db,
		subscriptionService: subscriptionService,
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
	ID         int64
	CalendarID int64
	Title      string
	CreatorID  int64
	AssigneeID *int64
	DueAt      time.Time
}

type overduePush struct {
	UserID      int64
	RecordID    int64
	RecordTitle string
	DueAt       time.Time
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
			calendar_id,
			title,
			creator_id,
			assignee_id,
			due_at
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
	defer rows.Close()

	overdueList := make([]OverdueRecord, 0)

	for rows.Next() {
		var item OverdueRecord

		if err := rows.Scan(
			&item.ID,
			&item.CalendarID,
			&item.Title,
			&item.CreatorID,
			&item.AssigneeID,
			&item.DueAt,
		); err != nil {
			log.Println("scan overdue record row failed:", err)
			continue
		}

		overdueList = append(overdueList, item)
	}

	if err := rows.Err(); err != nil {
		log.Println("iterate overdue records failed:", err)
		return err
	}

	pendingPushes := make([]overduePush, 0, len(overdueList))

	for _, item := range overdueList {
		_, err := tx.Exec(ctx, `
			UPDATE records
			SET
				status = 'OVERDUE',
				updated_at = NOW()
			WHERE id = $1
			  AND status NOT IN ('DONE', 'CANCELLED', 'OVERDUE')
		`, item.ID)

		if err != nil {
			_ = tx.Rollback(ctx)
			log.Println("mark record overdue failed:", err)
			continue
		}

		notifyUserID := item.CreatorID
		if item.AssigneeID != nil {
			notifyUserID = *item.AssigneeID
		}

		notificationTitle := "任务已逾期"
		notificationContent := fmt.Sprintf("记录「%s」已超过截止时间，请尽快处理。", item.Title)

		_, err = tx.Exec(ctx, `
			INSERT INTO notifications (
				calendar_id,
				user_id,
				record_id,
				title,
				content,
				read,
				created_at
			)
			VALUES ($1, $2, $3, $4, $5, false, NOW())
		`, item.CalendarID, notifyUserID, item.ID, notificationTitle, notificationContent)

		if err != nil {
			_ = tx.Rollback(ctx)
			log.Println("create overdue notification failed:", err)
			continue
		}

		detail := fmt.Sprintf("系统自动将记录「%s」标记为 OVERDUE", item.Title)

		_, err = tx.Exec(ctx, `
			INSERT INTO operation_logs (
				calendar_id,
				record_id,
				user_id,
				action,
				detail,
				created_at
			)
			VALUES ($1, $2, NULL, $3, $4, NOW())
		`, item.CalendarID, item.ID, "SYSTEM_OVERDUE", detail)

		if err != nil {
			_ = tx.Rollback(ctx)
			log.Println("create overdue operation log failed:", err)
			continue
		}

		pendingPushes = append(pendingPushes, overduePush{
			UserID:      notifyUserID,
			RecordID:    item.ID,
			RecordTitle: item.Title,
			DueAt:       item.DueAt,
		})
	}

	if err := tx.Commit(ctx); err != nil {
		log.Println("commit overdue tx failed:", err)
		return err
	}

	if len(overdueList) > 0 {
		log.Printf("marked overdue records and sent notifications: %d", len(overdueList))
	}

	for _, item := range pendingPushes {
		if s.subscriptionService == nil || item.UserID <= 0 {
			continue
		}

		err := s.subscriptionService.SendOverdue(ctx, subscription.SendOverdueParams{
			UserID:      item.UserID,
			RecordID:    item.RecordID,
			RecordTitle: item.RecordTitle,
			DueTime:     item.DueAt.Format("2006-01-02 15:04"),
		})
		if err != nil {
			log.Println("send wechat overdue message failed:", err)
		}
	}

	return nil
}
