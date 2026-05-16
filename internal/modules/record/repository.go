package record

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrScheduleConflict = errors.New("schedule conflict")

type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{
		db: db,
	}
}

type Record struct {
	ID              int64      `json:"id"`
	WorkspaceID     int64      `json:"workspace_id"`
	CalendarID      int64      `json:"calendar_id"`
	Title           string     `json:"title"`
	Content         string     `json:"content"`
	CreatorID       int64      `json:"creator_id"`
	AssigneeID      *int64     `json:"assignee_id"`
	AssigneeName    string     `json:"assignee_name"`
	Status          string     `json:"status"`
	DueAt           *time.Time `json:"due_at"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
	CustomerName    string     `json:"customer_name"`
	CustomerPhone   string     `json:"customer_phone"`
	ServiceName     string     `json:"service_name"`
	CalendarStartAt *time.Time `json:"calendar_start_at"`
	CalendarEndAt   *time.Time `json:"calendar_end_at"`
	CalendarAllDay  *bool      `json:"calendar_all_day"`
	CurrentUserRole string     `json:"current_user_role"`
}

type CreateRecordParams struct {
	WorkspaceID       int64
	CalendarID        int64
	Title             string
	Content           string
	CreatorID         int64
	AssigneeID        *int64
	DueAt             *time.Time
	CalendarStartAt   *time.Time
	CalendarEndAt     *time.Time
	CalendarAllDay    bool
	RemindAt          *time.Time
	AppointmentStatus string
	CustomerName      string
	CustomerPhone     string
	ServiceName       string
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

func (r *Repository) IsCalendarMember(ctx context.Context, calendarID, userID int64) (bool, error) {
	var exists bool

	err := r.db.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM calendar_members
			WHERE calendar_id = $1
			  AND user_id = $2
			  AND status = 'active' 
		)
	`, calendarID, userID).Scan(&exists)

	return exists, err
}

func (r *Repository) Create(ctx context.Context, params CreateRecordParams) (*Record, error) {
	if params.CalendarID <= 0 {
		params.CalendarID = params.WorkspaceID
	}
	var legacyWorkspaceID *int64
	if params.WorkspaceID > 0 {
		legacyWorkspaceID = &params.WorkspaceID
	}

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	if params.AppointmentStatus == "" {
		params.AppointmentStatus = "pending"
	}

	// Appointment times are advisory when creating records. Do not block creation on
	// schedule-overlap validation; users can resolve conflicts after the record is visible
	// on the calendar.

	var rec Record
	err = tx.QueryRow(ctx, `
		INSERT INTO records (
			workspace_id,
			calendar_id,
			title,
			content,
			creator_id,
			assignee_id,
			status,
			due_at,
			customer_name,
			customer_phone,
			service_name
		)
		VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', $7, $8, $9, $10)
		RETURNING
			id,
			COALESCE(workspace_id, calendar_id, 0),
			COALESCE(calendar_id, 0),
			title,
			COALESCE(content, ''),
			creator_id,
			assignee_id,
			status,
			due_at,
			COALESCE(customer_name, ''),
			COALESCE(customer_phone, ''),
			COALESCE(service_name, ''),
			created_at,
			updated_at
	`,
		legacyWorkspaceID,
		params.CalendarID,
		params.Title,
		params.Content,
		params.CreatorID,
		params.AssigneeID,
		params.DueAt,
		strings.TrimSpace(params.CustomerName),
		strings.TrimSpace(params.CustomerPhone),
		strings.TrimSpace(params.ServiceName),
	).Scan(
		&rec.ID,
		&rec.WorkspaceID,
		&rec.CalendarID,
		&rec.Title,
		&rec.Content,
		&rec.CreatorID,
		&rec.AssigneeID,
		&rec.Status,
		&rec.DueAt,
		&rec.CustomerName,
		&rec.CustomerPhone,
		&rec.ServiceName,
		&rec.CreatedAt,
		&rec.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	if params.RemindAt != nil {
		_, err = tx.Exec(ctx, `
			INSERT INTO reminders (
				calendar_id,
				record_id,
				remind_at,
				repeat_type,
				notified
			)
			VALUES ($1, $2, $3, 'NONE', false)
		`, params.CalendarID, rec.ID, params.RemindAt)
		if err != nil {
			return nil, err
		}
	}

	if params.CalendarStartAt != nil {
		_, err = tx.Exec(ctx, `
			INSERT INTO calendar_events (
				calendar_id,
				record_id,
				title,
				start_at,
				end_at,
				all_day,
				timezone,
				status,
				event_type,
				created_by,
				assignee_id
			)
			VALUES ($1, $2, $3, $4, $5, $6, 'Asia/Shanghai', $7, 'appointment', $8, $9)
		`, params.CalendarID, rec.ID, rec.Title, params.CalendarStartAt, params.CalendarEndAt, params.CalendarAllDay, params.AppointmentStatus, params.CreatorID, params.AssigneeID)
		if err != nil {
			return nil, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return &rec, nil
}

func shouldCheckScheduleConflict(calendarID int64, assigneeID *int64, startAt *time.Time, endAt *time.Time, allDay bool, status string) bool {
	if calendarID <= 0 || assigneeID == nil || startAt == nil || endAt == nil || allDay {
		return false
	}
	return !isTerminalRecordStatus(status)
}

func isTerminalRecordStatus(status string) bool {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "done", "cancelled", "completed":
		return true
	default:
		return false
	}
}

func (r *Repository) checkScheduleConflict(ctx context.Context, calendarID int64, ignoreRecordID int64, assigneeID *int64, startAt *time.Time, endAt *time.Time) error {
	if assigneeID == nil || startAt == nil || endAt == nil {
		return nil
	}
	dayStart := time.Date(startAt.Year(), startAt.Month(), startAt.Day(), 0, 0, 0, 0, startAt.Location())
	dayEnd := dayStart.AddDate(0, 0, 1)

	var conflictCount int64
	if err := r.db.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM calendar_events ce
		LEFT JOIN records rec ON rec.id = ce.record_id
		WHERE ce.calendar_id = $1
		  AND ce.deleted_at IS NULL
		  AND (rec.id IS NULL OR rec.deleted_at IS NULL)
		  AND ($5::bigint = 0 OR COALESCE(ce.record_id, 0) <> $5)
		  AND LOWER(COALESCE(ce.status, '')) NOT IN ('done', 'cancelled', 'completed')
		  AND LOWER(COALESCE(rec.status, '')) NOT IN ('done', 'cancelled', 'completed')
		  AND LOWER(COALESCE(ce.event_type, 'record')) IN ('record', 'appointment', 'blocked', 'rest', 'full')
		  AND (
		    (
		      LOWER(COALESCE(ce.event_type, 'record')) IN ('record', 'appointment')
		      AND COALESCE(ce.assignee_id, rec.assignee_id) = $2
		      AND ce.end_at IS NOT NULL
		      AND ce.start_at < $4
		      AND ce.end_at > $3
		    )
		    OR (
		      LOWER(COALESCE(ce.event_type, 'record')) = 'rest'
		      AND (COALESCE(ce.assignee_id, rec.assignee_id) = $2 OR COALESCE(ce.assignee_id, rec.assignee_id) IS NULL)
		      AND (
		        (ce.all_day = true AND ce.start_at < $7 AND COALESCE(ce.end_at, ce.start_at + INTERVAL '1 day') > $6)
		        OR (ce.all_day = false AND ce.end_at IS NOT NULL AND ce.start_at < $4 AND ce.end_at > $3)
		      )
		    )
		    OR (
		      LOWER(COALESCE(ce.event_type, 'record')) = 'blocked'
		      AND (COALESCE(ce.assignee_id, rec.assignee_id) = $2 OR COALESCE(ce.assignee_id, rec.assignee_id) IS NULL)
		      AND ce.end_at IS NOT NULL
		      AND ce.start_at < $4
		      AND ce.end_at > $3
		    )
		    OR (
		      LOWER(COALESCE(ce.event_type, 'record')) = 'full'
		      AND (COALESCE(ce.assignee_id, rec.assignee_id) = $2 OR COALESCE(ce.assignee_id, rec.assignee_id) IS NULL)
		      AND ce.start_at < $7
		      AND COALESCE(ce.end_at, ce.start_at + INTERVAL '1 day') > $6
		    )
		  )
	`, calendarID, *assigneeID, *startAt, *endAt, ignoreRecordID, dayStart, dayEnd).Scan(&conflictCount); err != nil {
		return err
	}
	if conflictCount > 0 {
		return ErrScheduleConflict
	}

	return nil
}

func (r *Repository) ListByCalendar(ctx context.Context, params ListRecordsParams) (*PageResult, error) {
	whereParts := []string{
		"rec.calendar_id = $1",
		"rec.deleted_at IS NULL",
	}

	args := []any{params.CalendarID}
	argIndex := 2

	if params.Status != "" {
		switch params.Status {
		case "COMPLETED":
			whereParts = append(whereParts, "rec.status IN ('COMPLETED', 'DONE')")
		case "CANCELLED":
			whereParts = append(whereParts, "rec.status = 'CANCELLED'")
		default:
			whereParts = append(whereParts, "rec.status NOT IN ('COMPLETED', 'DONE', 'CANCELLED')")
		}
	}

	if params.AssigneeID != nil {
		whereParts = append(whereParts, fmt.Sprintf("rec.assignee_id = $%d", argIndex))
		args = append(args, *params.AssigneeID)
		argIndex++
	}

	if params.StartDate != "" {
		whereParts = append(whereParts, fmt.Sprintf("rec.due_at >= $%d::date", argIndex))
		args = append(args, params.StartDate)
		argIndex++
	}

	if params.EndDate != "" {
		whereParts = append(whereParts, fmt.Sprintf("rec.due_at < ($%d::date + INTERVAL '1 day')", argIndex))
		args = append(args, params.EndDate)
		argIndex++
	}

	if params.CustomerPhone != "" {
		whereParts = append(whereParts, fmt.Sprintf("rec.customer_phone = $%d", argIndex))
		args = append(args, params.CustomerPhone)
		argIndex++
	} else if params.CustomerName != "" {
		whereParts = append(whereParts, fmt.Sprintf("rec.customer_name ILIKE $%d", argIndex))
		args = append(args, "%"+params.CustomerName+"%")
		argIndex++
	} else if params.Keyword != "" {
		whereParts = append(
			whereParts,
			fmt.Sprintf("(rec.title ILIKE $%d OR rec.content ILIKE $%d OR rec.customer_name ILIKE $%d OR rec.customer_phone ILIKE $%d OR rec.service_name ILIKE $%d)", argIndex, argIndex, argIndex, argIndex, argIndex),
		)
		args = append(args, "%"+params.Keyword+"%")
		argIndex++
	}

	whereSQL := strings.Join(whereParts, " AND ")

	countSQL := fmt.Sprintf(`
		SELECT COUNT(*)
		FROM records rec
		WHERE %s
	`, whereSQL)

	var total int64
	if err := r.db.QueryRow(ctx, countSQL, args...).Scan(&total); err != nil {
		return nil, err
	}

	offset := (params.Page - 1) * params.PageSize

	querySQL := fmt.Sprintf(`
		SELECT
			rec.id,
			COALESCE(rec.workspace_id, rec.calendar_id, 0),
			COALESCE(rec.calendar_id, 0),
			rec.title,
			COALESCE(rec.content, ''),
			rec.creator_id,
			rec.assignee_id,
			COALESCE(NULLIF(u.nickname, ''), u.username, ''),
			rec.status,
			rec.due_at,
			COALESCE(rec.customer_name, ''),
			COALESCE(rec.customer_phone, ''),
			COALESCE(rec.service_name, ''),
			ce.start_at,
			ce.end_at,
			ce.all_day,
			rec.created_at,
			rec.updated_at
		FROM records rec
		LEFT JOIN users u ON u.id = rec.assignee_id
		LEFT JOIN LATERAL (
			SELECT start_at, end_at, all_day
			FROM calendar_events
			WHERE record_id = rec.id AND deleted_at IS NULL
			ORDER BY start_at ASC, id ASC
			LIMIT 1
		) ce ON TRUE
		WHERE %s
		ORDER BY 
			CASE 
				WHEN rec.status IN ('PENDING', 'IN_PROGRESS', 'OVERDUE', 'PROCESSING', 'DOING') THEN 1
				WHEN rec.status IN ('COMPLETED', 'DONE') THEN 2
				WHEN rec.status = 'CANCELLED' THEN 3
				ELSE 4
			END,
			CASE WHEN rec.due_at IS NULL THEN 1 ELSE 0 END,
			rec.due_at ASC,
			rec.created_at DESC
		LIMIT $%d OFFSET $%d
	`, whereSQL, argIndex, argIndex+1)

	args = append(args, params.PageSize, offset)

	rows, err := r.db.Query(ctx, querySQL, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]Record, 0)

	for rows.Next() {
		var rec Record

		if err := rows.Scan(
			&rec.ID,
			&rec.WorkspaceID,
			&rec.CalendarID,
			&rec.Title,
			&rec.Content,
			&rec.CreatorID,
			&rec.AssigneeID,
			&rec.AssigneeName,
			&rec.Status,
			&rec.DueAt,
			&rec.CustomerName,
			&rec.CustomerPhone,
			&rec.ServiceName,
			&rec.CalendarStartAt,
			&rec.CalendarEndAt,
			&rec.CalendarAllDay,
			&rec.CreatedAt,
			&rec.UpdatedAt,
		); err != nil {
			return nil, err
		}

		rec.Status = NormalizeRecordStatus(rec.Status)
		items = append(items, rec)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	totalPages := 0
	if total > 0 {
		totalPages = int((total + int64(params.PageSize) - 1) / int64(params.PageSize))
	}

	return &PageResult{
		Items:      items,
		Page:       params.Page,
		PageSize:   params.PageSize,
		Total:      total,
		TotalPages: totalPages,
	}, nil
}
func NormalizeRecordStatus(status string) string {
	switch strings.ToUpper(strings.TrimSpace(status)) {
	case "COMPLETED", "DONE":
		return "COMPLETED"
	case "CANCELLED":
		return "CANCELLED"
	default:
		return "PENDING"
	}
}

func IsValidStatus(status string) bool {
	switch status {
	case "PENDING", "COMPLETED", "CANCELLED":
		return true
	default:
		return false
	}
}

func (r *Repository) FindByID(ctx context.Context, id int64) (*Record, error) {
	var rec Record

	err := r.db.QueryRow(ctx, `
		SELECT
			rec.id,
			COALESCE(rec.workspace_id, rec.calendar_id, 0),
			COALESCE(rec.calendar_id, 0),
			rec.title,
			COALESCE(rec.content, ''),
			rec.creator_id,
			rec.assignee_id,
			COALESCE(NULLIF(u.nickname, ''), u.username, ''),
			rec.status,
			rec.due_at,
			COALESCE(rec.customer_name, ''),
			COALESCE(rec.customer_phone, ''),
			COALESCE(rec.service_name, ''),
			ce.start_at,
			ce.end_at,
			ce.all_day,
			rec.created_at,
			rec.updated_at
		FROM records rec
		LEFT JOIN users u ON u.id = rec.assignee_id
		LEFT JOIN LATERAL (
			SELECT start_at, end_at, all_day
			FROM calendar_events
			WHERE record_id = rec.id AND deleted_at IS NULL
			ORDER BY start_at ASC, id ASC
			LIMIT 1
		) ce ON TRUE
		WHERE rec.id = $1
		  AND rec.deleted_at IS NULL
	`, id).Scan(
		&rec.ID,
		&rec.WorkspaceID,
		&rec.CalendarID,
		&rec.Title,
		&rec.Content,
		&rec.CreatorID,
		&rec.AssigneeID,
		&rec.AssigneeName,
		&rec.Status,
		&rec.DueAt,
		&rec.CustomerName,
		&rec.CustomerPhone,
		&rec.ServiceName,
		&rec.CalendarStartAt,
		&rec.CalendarEndAt,
		&rec.CalendarAllDay,
		&rec.CreatedAt,
		&rec.UpdatedAt,
	)

	if err != nil {
		return nil, err
	}

	return &rec, nil
}

func (r *Repository) GetDetailWithRole(ctx context.Context, recordID int64, userID int64) (*Record, error) {
	var item Record

	err := r.db.QueryRow(ctx, `
		SELECT
			rec.id,
			COALESCE(rec.workspace_id, rec.calendar_id, 0),
			COALESCE(rec.calendar_id, 0),
			rec.title,
			COALESCE(rec.content, ''),
			rec.creator_id,
			rec.assignee_id,
			COALESCE(NULLIF(u.nickname, ''), u.username, ''),
			rec.status,
			rec.due_at,
			COALESCE(rec.customer_name, ''),
			COALESCE(rec.customer_phone, ''),
			COALESCE(rec.service_name, ''),
			ce.start_at,
			ce.end_at,
			ce.all_day,
			rec.created_at,
			rec.updated_at,
			COALESCE(wm.role, '')
		FROM records rec
		LEFT JOIN users u ON u.id = rec.assignee_id
		LEFT JOIN LATERAL (
			SELECT start_at, end_at, all_day
			FROM calendar_events
			WHERE record_id = rec.id AND deleted_at IS NULL
			ORDER BY start_at ASC, id ASC
			LIMIT 1
		) ce ON TRUE
		LEFT JOIN calendar_members wm
			ON wm.calendar_id = rec.calendar_id
			AND wm.user_id = $2
			AND wm.status = 'active'
		WHERE rec.id = $1
		  AND rec.deleted_at IS NULL
	`, recordID, userID).Scan(
		&item.ID,
		&item.WorkspaceID,
		&item.CalendarID,
		&item.Title,
		&item.Content,
		&item.CreatorID,
		&item.AssigneeID,
		&item.AssigneeName,
		&item.Status,
		&item.DueAt,
		&item.CustomerName,
		&item.CustomerPhone,
		&item.ServiceName,
		&item.CalendarStartAt,
		&item.CalendarEndAt,
		&item.CalendarAllDay,
		&item.CreatedAt,
		&item.UpdatedAt,
		&item.CurrentUserRole,
	)

	if err != nil {
		return nil, err
	}

	return &item, nil
}

type UpdateRecordParams struct {
	ID               int64
	CalendarID       int64
	UpdatedBy        int64
	Title            string
	Content          string
	AssigneeID       *int64
	DueAt            *time.Time
	CalendarStartAt  *time.Time
	CalendarEndAt    *time.Time
	CalendarAllDay   bool
	Status           string
	UpdateCalendarAt bool
	CustomerName     string
	CustomerPhone    string
	ServiceName      string
}

func (r *Repository) Update(ctx context.Context, params UpdateRecordParams) (*Record, error) {
	// Appointment times are advisory when updating records. Do not block updates on
	// schedule-overlap validation; users can resolve conflicts after the record is visible
	// on the calendar.

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var id int64
	err = tx.QueryRow(ctx, `
		UPDATE records
		SET
			title = $2,
			content = $3,
			assignee_id = $4,
			due_at = $5,
			customer_name = $6,
			customer_phone = $7,
			service_name = $8,
			updated_at = NOW()
		WHERE id = $1
		  AND deleted_at IS NULL
		RETURNING id
	`, params.ID, params.Title, params.Content, params.AssigneeID, params.DueAt, strings.TrimSpace(params.CustomerName), strings.TrimSpace(params.CustomerPhone), strings.TrimSpace(params.ServiceName)).Scan(&id)
	if err != nil {
		return nil, err
	}

	if params.UpdateCalendarAt {
		if params.CalendarStartAt != nil {
			commandTag, err := tx.Exec(ctx, `
				UPDATE calendar_events
				SET title = $2,
					start_at = $3,
					end_at = $4,
					all_day = $5,
					assignee_id = $6,
					updated_at = NOW()
				WHERE record_id = $1
				  AND deleted_at IS NULL
			`, params.ID, params.Title, params.CalendarStartAt, params.CalendarEndAt, params.CalendarAllDay, params.AssigneeID)
			if err != nil {
				return nil, err
			}
			if commandTag.RowsAffected() == 0 {
				_, err = tx.Exec(ctx, `
					INSERT INTO calendar_events (
						calendar_id, record_id, title, start_at, end_at, all_day, timezone, status, event_type, created_by, assignee_id
					)
					VALUES ($1, $2, $3, $4, $5, $6, 'Asia/Shanghai', 'pending', 'appointment', $8, $7)
				`, params.CalendarID, params.ID, params.Title, params.CalendarStartAt, params.CalendarEndAt, params.CalendarAllDay, params.AssigneeID, params.UpdatedBy)
				if err != nil {
					return nil, err
				}
			}
		} else {
			_, err := tx.Exec(ctx, `
				UPDATE calendar_events
				SET deleted_at = NOW()
				WHERE record_id = $1
				  AND deleted_at IS NULL
			`, params.ID)
			if err != nil {
				return nil, err
			}
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return r.FindByID(ctx, id)
}

func (r *Repository) Delete(ctx context.Context, id int64) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// 1. 删除提醒
	_, err = tx.Exec(ctx, `
		DELETE FROM reminders
		WHERE record_id = $1
	`, id)
	if err != nil {
		return err
	}

	// 2. 删除或解绑通知
	// 如果你希望通知也删除，用 DELETE
	_, err = tx.Exec(ctx, `
		DELETE FROM notifications
		WHERE record_id = $1
	`, id)
	if err != nil {
		return err
	}

	// 3. 操作日志不建议删除，改成 record_id = NULL
	// 这样可以保留历史日志，不阻塞 records 删除
	_, err = tx.Exec(ctx, `
		UPDATE operation_logs
		SET record_id = NULL
		WHERE record_id = $1
	`, id)
	if err != nil {
		return err
	}

	// 4. 最后删除记录
	_, err = tx.Exec(ctx, `
		DELETE FROM records
		WHERE id = $1
	`, id)
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

func (r *Repository) UpdateStatus(ctx context.Context, id int64, status string) (*Record, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var recordID int64
	err = tx.QueryRow(ctx, `
		UPDATE records
		SET
			status = $2,
			updated_at = NOW()
		WHERE id = $1
		RETURNING id
	`, id, status).Scan(&recordID)
	if err != nil {
		return nil, err
	}

	_, err = tx.Exec(ctx, `
		UPDATE calendar_events
		SET status = $2
		WHERE record_id = $1
		  AND deleted_at IS NULL
	`, id, strings.ToLower(status))
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return r.FindByID(ctx, recordID)
}

func (r *Repository) ListOverdue(ctx context.Context, userID int64) ([]Record, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
			rec.id,
			COALESCE(rec.workspace_id, rec.calendar_id, 0),
			COALESCE(rec.calendar_id, 0),
			rec.title,
			COALESCE(rec.content, ''),
			rec.creator_id,
			rec.assignee_id,
			COALESCE(NULLIF(u.nickname, ''), u.username, ''),
			rec.status,
			rec.due_at,
			COALESCE(rec.customer_name, ''),
			COALESCE(rec.customer_phone, ''),
			COALESCE(rec.service_name, ''),
			ce.start_at,
			ce.end_at,
			ce.all_day,
			rec.created_at,
			rec.updated_at
		FROM records rec
		INNER JOIN calendar_members wm ON wm.calendar_id = rec.calendar_id
		LEFT JOIN users u ON u.id = rec.assignee_id
		WHERE wm.status = 'active'
		  AND wm.user_id = $1
		  AND rec.assignee_id = $1
		  AND FALSE
		ORDER BY rec.due_at ASC, rec.created_at DESC
		LIMIT 100
	`, userID)

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := make([]Record, 0)

	for rows.Next() {
		var rec Record

		if err := rows.Scan(
			&rec.ID,
			&rec.WorkspaceID,
			&rec.CalendarID,
			&rec.Title,
			&rec.Content,
			&rec.CreatorID,
			&rec.AssigneeID,
			&rec.AssigneeName,
			&rec.Status,
			&rec.DueAt,
			&rec.CustomerName,
			&rec.CustomerPhone,
			&rec.ServiceName,
			&rec.CalendarStartAt,
			&rec.CalendarEndAt,
			&rec.CalendarAllDay,
			&rec.CreatedAt,
			&rec.UpdatedAt,
		); err != nil {
			return nil, err
		}

		list = append(list, rec)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return list, nil
}

type CreateOperationLogParams struct {
	CalendarID int64
	RecordID   *int64
	UserID     *int64
	Action     string
	Detail     string
}

func (r *Repository) CreateOperationLog(ctx context.Context, params CreateOperationLogParams) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO operation_logs (
			calendar_id,
			record_id,
			user_id,
			action,
			detail,
			created_at
		)
		VALUES ($1, $2, $3, $4, $5, NOW())
	`,
		params.CalendarID,
		params.RecordID,
		params.UserID,
		params.Action,
		params.Detail,
	)

	return err
}

type OperationLog struct {
	ID         int64     `json:"id"`
	CalendarID int64     `json:"calendar_id"`
	RecordID   *int64    `json:"record_id"`
	UserID     *int64    `json:"user_id"`
	Username   string    `json:"username"`
	Action     string    `json:"action"`
	Detail     string    `json:"detail"`
	CreatedAt  time.Time `json:"created_at"`
}

func (r *Repository) ListOperationLogsByRecordID(ctx context.Context, recordID int64) ([]OperationLog, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
			ol.id,
			ol.calendar_id,
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
			&item.CalendarID,
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

func (r *Repository) UpdateAssignee(ctx context.Context, recordID int64, assigneeID int64) (*Record, error) {
	var id int64

	err := r.db.QueryRow(ctx, `
		UPDATE records
		SET
			assignee_id = $2,
			updated_at = NOW()
		WHERE id = $1
		RETURNING id
	`, recordID, assigneeID).Scan(&id)

	if err != nil {
		return nil, err
	}

	return r.FindByID(ctx, id)
}

func (r *Repository) CreateNotification(ctx context.Context, userID int64, recordID int64, notificationType, title, content string) error {
	if userID <= 0 {
		log.Printf("warning: skip notification with invalid user_id=%d", userID)
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
		SELECT rec.calendar_id, $1, $2, $3, $4, $5, false, NOW()
		FROM records rec
		WHERE rec.id = $2
		  AND EXISTS (SELECT 1 FROM users WHERE id = $1)
	`, userID, recordID, notificationType, title, content)
	if err != nil {
		return err
	}

	if tag.RowsAffected() == 0 {
		log.Printf("warning: skip notification for missing user_id=%d record_id=%d", userID, recordID)
	}

	return nil
}

type ListRecordsParams struct {
	CalendarID    int64
	Page          int
	PageSize      int
	Status        string
	AssigneeID    *int64
	Keyword       string
	CustomerName  string
	CustomerPhone string
	StartDate     string
	EndDate       string
}

type PageResult struct {
	Items      []Record `json:"items"`
	Page       int      `json:"page"`
	PageSize   int      `json:"page_size"`
	Total      int64    `json:"total"`
	TotalPages int      `json:"total_pages"`
}

type BasicRecordInfo struct {
	ID           int64
	CalendarID   int64
	CalendarName string
	Title        string
	AssigneeID   int64
}

func (r *Repository) GetBasicInfo(ctx context.Context, id int64) (*BasicRecordInfo, error) {
	var item BasicRecordInfo

	err := r.db.QueryRow(ctx, `
		SELECT
			rec.id,
			rec.calendar_id,
			COALESCE(c.name, ''),
			rec.title,
			COALESCE(rec.assignee_id, 0)
		FROM records rec
		LEFT JOIN calendars c ON c.id = rec.calendar_id
		WHERE rec.id = $1
	`, id).Scan(
		&item.ID,
		&item.CalendarID,
		&item.CalendarName,
		&item.Title,
		&item.AssigneeID,
	)

	if err != nil {
		return nil, err
	}

	return &item, nil
}
