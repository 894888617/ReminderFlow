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

	if params.CalendarStartAt != nil {
		if err := r.checkScheduleConflict(ctx, params.CalendarID, params.CalendarStartAt, params.CalendarEndAt); err != nil {
			return nil, err
		}
	}

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
				created_by
			)
			VALUES ($1, $2, $3, $4, $5, $6, 'Asia/Shanghai', $7, 'appointment', $8)
		`, params.CalendarID, rec.ID, rec.Title, params.CalendarStartAt, params.CalendarEndAt, params.CalendarAllDay, params.AppointmentStatus, params.CreatorID)
		if err != nil {
			return nil, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return &rec, nil
}

func (r *Repository) checkScheduleConflict(ctx context.Context, calendarID int64, startAt *time.Time, endAt *time.Time) error {
	if startAt == nil {
		return nil
	}
	_ = endAt
	dayStart := time.Date(startAt.Year(), startAt.Month(), startAt.Day(), 0, 0, 0, 0, startAt.Location())
	dayEnd := dayStart.AddDate(0, 0, 1)

	var blockedCount int64
	if err := r.db.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM calendar_events ce
		WHERE ce.calendar_id = $1
		  AND ce.deleted_at IS NULL
		  AND ce.start_at >= $2
		  AND ce.start_at < $3
		  AND (
		    LOWER(COALESCE(ce.event_type, 'record')) IN ('rest', 'full')
		    OR (LOWER(COALESCE(ce.event_type, 'record')) = 'blocked' AND ce.all_day = true)
		  )
	`, calendarID, dayStart, dayEnd).Scan(&blockedCount); err != nil {
		return err
	}
	if blockedCount > 0 {
		return ErrScheduleConflict
	}

	return nil
}

func (r *Repository) ListByCalendar(ctx context.Context, params ListRecordsParams) (*PageResult, error) {
	whereParts := []string{
		"rec.calendar_id = $1",
	}

	args := []any{params.CalendarID}
	argIndex := 2

	if params.Status != "" {
		whereParts = append(whereParts, fmt.Sprintf("rec.status = $%d", argIndex))
		args = append(args, params.Status)
		argIndex++
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

	if params.Keyword != "" {
		whereParts = append(
			whereParts,
			fmt.Sprintf("(rec.title ILIKE $%d OR rec.content ILIKE $%d)", argIndex, argIndex),
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
			rec.created_at,
			rec.updated_at
		FROM records rec
		LEFT JOIN users u ON u.id = rec.assignee_id
		WHERE %s
		ORDER BY 
			CASE 
				WHEN rec.status = 'OVERDUE' THEN 1
				WHEN rec.status = 'PENDING' THEN 2
				WHEN rec.status = 'IN_PROGRESS' THEN 3
				WHEN rec.status = 'DONE' THEN 4
				WHEN rec.status = 'CANCELLED' THEN 5
				ELSE 6
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
			&rec.CreatedAt,
			&rec.UpdatedAt,
		); err != nil {
			return nil, err
		}

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
func IsValidStatus(status string) bool {
	switch status {
	case "PENDING", "IN_PROGRESS", "DONE", "OVERDUE", "CANCELLED":
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
			rec.created_at,
			rec.updated_at
		FROM records rec
		LEFT JOIN users u ON u.id = rec.assignee_id
		WHERE rec.id = $1
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
			rec.created_at,
			rec.updated_at,
			COALESCE(wm.role, '')
		FROM records rec
		LEFT JOIN users u ON u.id = rec.assignee_id
		LEFT JOIN calendar_members wm
			ON wm.calendar_id = rec.calendar_id
			AND wm.user_id = $2
			AND wm.status = 'active'
		WHERE rec.id = $1
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
	ID         int64
	Title      string
	Content    string
	AssigneeID *int64
	DueAt      *time.Time
}

func (r *Repository) Update(ctx context.Context, params UpdateRecordParams) (*Record, error) {
	var id int64

	err := r.db.QueryRow(ctx, `
		UPDATE records
		SET
			title = $2,
			content = $3,
			assignee_id = $4,
			due_at = $5,
			updated_at = NOW()
		WHERE id = $1
		RETURNING id
	`, params.ID, params.Title, params.Content, params.AssigneeID, params.DueAt).Scan(&id)

	if err != nil {
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
	var recordID int64

	err := r.db.QueryRow(ctx, `
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
			rec.created_at,
			rec.updated_at
		FROM records rec
		INNER JOIN calendar_members wm ON wm.calendar_id = rec.calendar_id
		LEFT JOIN users u ON u.id = rec.assignee_id
		WHERE wm.status = 'active'
		  AND wm.user_id = $1
		  AND rec.assignee_id = $1
		  AND rec.status = 'OVERDUE'
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
	CalendarID int64
	Page       int
	PageSize   int
	Status     string
	AssigneeID *int64
	Keyword    string
	StartDate  string
	EndDate    string
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
