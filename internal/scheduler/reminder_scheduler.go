package scheduler

import (
	"context"
	"fmt"
	"log"
	"time"

	"reminder-flow/internal/modules/subscription"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/robfig/cron/v3"
)

type ReminderScheduler struct {
	db                  *pgxpool.Pool
	subscriptionService *subscription.Service
}

func NewReminderScheduler(
	db *pgxpool.Pool,
	subscriptionService *subscription.Service,
) *ReminderScheduler {
	return &ReminderScheduler{
		db:                  db,
		subscriptionService: subscriptionService,
	}
}

func (s *ReminderScheduler) Start() {
	c := cron.New(cron.WithSeconds())

	_, err := c.AddFunc("0 */1 * * * *", func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		if err := s.ScanDueReminders(ctx); err != nil {
			log.Printf("scan due reminders failed: %v", err)
		}
	})

	if err != nil {
		log.Printf("add reminder cron failed: %v", err)
		return
	}

	c.Start()
	log.Println("reminder scheduler started")
}

type DueReminder struct {
	ReminderID  int64
	RecordID    int64
	RecordTitle string
	AssigneeID  *int64
	CreatorID   int64
	RemindAt    time.Time
	RepeatType  string
}

func (s *ReminderScheduler) ScanDueReminders(ctx context.Context) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	rows, err := tx.Query(ctx, `
		SELECT
			rm.id,
			rm.record_id,
			rec.title,
			COALESCE(rec.assignee_id, 0),
			rec.creator_id,
			rm.remind_at,
			rm.repeat_type
		FROM reminders rm
		INNER JOIN records rec ON rec.id = rm.record_id
		WHERE rm.notified = false 
		  AND rm.remind_at <= NOW()
		  AND rec.status NOT IN ('DONE', 'CANCELLED')
		ORDER BY rm.remind_at ASC
		LIMIT 100
		FOR UPDATE SKIP LOCKED
	`)

	if err != nil {
		log.Println("scan due reminders failed:", err)
		return err
	}

	defer rows.Close()

	dueList := make([]DueReminder, 0)

	for rows.Next() {
		var item DueReminder

		if err := rows.Scan(
			&item.ReminderID,
			&item.RecordID,
			&item.RecordTitle,
			&item.AssigneeID,
			&item.CreatorID,
			&item.RemindAt,
			&item.RepeatType,
		); err != nil {
			log.Println("scan due reminder row failed:", err)
			continue
			//rows.Close()
			//return err
		}

		dueList = append(dueList, item)
	}

	if err := rows.Err(); err != nil {
		log.Println("iterate due reminders failed:", err)
		return err
	}

	for _, item := range dueList {
		notifyUserID := item.CreatorID
		if item.AssigneeID != nil {
			notifyUserID = *item.AssigneeID
		}

		tx, err := s.db.Begin(ctx)
		if err != nil {
			log.Println("begin reminder tx failed:", err)
			continue
		}

		title := "任务提醒"
		content := fmt.Sprintf("记录「%s」已到提醒时间，请及时处理。", item.RecordTitle)

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
		`, notifyUserID, item.RecordID, title, content)

		if err != nil {
			_ = tx.Rollback(ctx)
			log.Println("create reminder notification failed:", err)
			continue
		}

		if err := tx.Commit(ctx); err != nil {
			log.Println("commit reminder tx failed:", err)
			continue
		}

		if s.subscriptionService != nil {
			err := s.subscriptionService.SendTaskReminder(ctx, subscription.SendTaskReminderParams{
				UserID:      notifyUserID,
				RecordID:    item.RecordID,
				RecordTitle: item.RecordTitle,
				RemindTime:  item.RemindAt.Format("2006-01-02 15:04"),
			})
			if err != nil {
				log.Println("send wechat task reminder failed:", err)
			}
		}

		//if item.RepeatType == "NONE" {
		//	_, err = tx.Exec(ctx, `
		//		UPDATE reminders
		//		SET notified = true
		//		WHERE id = $1
		//	`, item.ReminderID)
		//
		//	if err != nil {
		//		return err
		//	}
		//} else {
		//	nextRemindAt := nextReminderTime(item.RemindAt, item.RepeatType)
		//
		//	_, err = tx.Exec(ctx, `
		//		UPDATE reminders
		//		SET remind_at = $2
		//		WHERE id = $1
		//	`, item.ReminderID, nextRemindAt)
		//
		//	if err != nil {
		//		return err
		//	}
		//}
	}

	if err := tx.Commit(ctx); err != nil {
		return err
	}

	if len(dueList) > 0 {
		log.Printf("processed due reminders: %d", len(dueList))
	}

	return nil
}

func nextReminderTime(current time.Time, repeatType string) time.Time {
	switch repeatType {
	case "DAILY":
		return current.AddDate(0, 0, 1)
	case "WEEKLY":
		return current.AddDate(0, 0, 7)
	case "MONTHLY":
		return current.AddDate(0, 1, 0)
	default:
		return current
	}
}
