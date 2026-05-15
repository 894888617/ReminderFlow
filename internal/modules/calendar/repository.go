package calendar

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrNoPermission      = errors.New("no permission")
	ErrCannotManageOwner = errors.New("cannot manage owner")
	ErrMemberExists      = errors.New("member already exists")
)

type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

func (r *Repository) CreateCalendar(ctx context.Context, userID int64, params CreateCalendarParams) (*Calendar, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var cal Calendar
	err = tx.QueryRow(ctx, `
		INSERT INTO calendars (name, description, color, timezone, cover_url, owner_id)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, name, COALESCE(description, ''), COALESCE(color, ''), COALESCE(timezone, ''), COALESCE(cover_url, ''), owner_id, created_at, updated_at
	`, params.Name, params.Description, params.Color, params.Timezone, params.CoverURL, userID).Scan(
		&cal.ID,
		&cal.Name,
		&cal.Description,
		&cal.Color,
		&cal.Timezone,
		&cal.CoverURL,
		&cal.OwnerID,
		&cal.CreatedAt,
		&cal.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO calendar_members (calendar_id, user_id, role, status, joined_at)
		VALUES ($1, $2, $3, 'active', NOW())
	`, cal.ID, userID, RoleOwner)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	cal.CurrentUserRole = RoleOwner
	cal.MemberCount = 1
	return &cal, nil
}

func (r *Repository) ListMyCalendars(ctx context.Context, userID int64) ([]Calendar, error) {
	rows, err := r.db.Query(ctx, calendarSelectSQL()+`
		WHERE cm.user_id = $1
		  AND cm.status = 'active'
		  AND c.deleted_at IS NULL
		ORDER BY c.updated_at DESC, c.created_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]Calendar, 0)
	for rows.Next() {
		cal, err := scanCalendar(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, cal)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return items, nil
}

func (r *Repository) GetCalendarDetail(ctx context.Context, userID, calendarID int64) (*Calendar, error) {
	row := r.db.QueryRow(ctx, calendarSelectSQL()+`
		WHERE c.id = $1
		  AND cm.user_id = $2
		  AND cm.status = 'active'
		  AND c.deleted_at IS NULL
	`, calendarID, userID)

	cal, err := scanCalendar(row)
	if err != nil {
		return nil, err
	}
	return &cal, nil
}

func (r *Repository) UpdateCalendar(ctx context.Context, userID, calendarID int64, params UpdateCalendarParams) (*Calendar, error) {
	if err := r.EnsureCalendarOwner(ctx, userID, calendarID); err != nil {
		return nil, err
	}

	_, err := r.db.Exec(ctx, `
		UPDATE calendars
		SET name = $3,
		    description = $4,
		    color = $5,
		    timezone = $6,
		    cover_url = $7
		WHERE id = $1
		  AND owner_id = $2
		  AND deleted_at IS NULL
	`, calendarID, userID, params.Name, params.Description, params.Color, params.Timezone, params.CoverURL)
	if err != nil {
		return nil, err
	}

	return r.GetCalendarDetail(ctx, userID, calendarID)
}

func (r *Repository) DeleteCalendar(ctx context.Context, userID, calendarID int64) error {
	if err := r.EnsureCalendarOwner(ctx, userID, calendarID); err != nil {
		return err
	}

	_, err := r.db.Exec(ctx, `
		UPDATE calendars
		SET deleted_at = NOW()
		WHERE id = $1
		  AND owner_id = $2
		  AND deleted_at IS NULL
	`, calendarID, userID)
	return err
}

func (r *Repository) GetUserRole(ctx context.Context, userID, calendarID int64) (string, error) {
	var role string
	err := r.db.QueryRow(ctx, `
		SELECT cm.role
		FROM calendar_members cm
		INNER JOIN calendars c ON c.id = cm.calendar_id
		WHERE cm.calendar_id = $1
		  AND cm.user_id = $2
		  AND cm.status = 'active'
		  AND c.deleted_at IS NULL
	`, calendarID, userID).Scan(&role)
	return role, err
}

func (r *Repository) EnsureCalendarOwner(ctx context.Context, userID, calendarID int64) error {
	role, err := r.GetUserRole(ctx, userID, calendarID)
	if err != nil {
		return err
	}
	if role != RoleOwner {
		return ErrNoPermission
	}
	return nil
}

func (r *Repository) EnsureCalendarEditable(ctx context.Context, userID, calendarID int64) error {
	role, err := r.GetUserRole(ctx, userID, calendarID)
	if err != nil {
		return err
	}
	if role != RoleOwner && role != RoleMember {
		return ErrNoPermission
	}
	return nil
}

func (r *Repository) ListCalendarMembers(ctx context.Context, userID, calendarID int64) ([]CalendarMember, error) {
	if _, err := r.GetUserRole(ctx, userID, calendarID); err != nil {
		return nil, err
	}

	rows, err := r.db.Query(ctx, `
		SELECT
			cm.id,
			cm.calendar_id,
			cm.user_id,
			COALESCE(NULLIF(u.nickname, ''), u.username, ''),
			COALESCE(u.avatar_url, ''),
			cm.role,
			cm.status,
			cm.joined_at
		FROM calendar_members cm
		INNER JOIN calendars c ON c.id = cm.calendar_id
		INNER JOIN users u ON u.id = cm.user_id
		WHERE cm.calendar_id = $1
		  AND cm.status = 'active'
		  AND c.deleted_at IS NULL
		ORDER BY
			CASE cm.role
				WHEN 'owner' THEN 1
				WHEN 'member' THEN 2
				WHEN 'viewer' THEN 3
				ELSE 4
			END,
			cm.joined_at ASC NULLS LAST,
			cm.id ASC
	`, calendarID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]CalendarMember, 0)
	for rows.Next() {
		var m CalendarMember
		if err := rows.Scan(&m.ID, &m.CalendarID, &m.UserID, &m.Nickname, &m.AvatarURL, &m.Role, &m.Status, &m.JoinedAt); err != nil {
			return nil, err
		}
		items = append(items, m)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return items, nil
}

func (r *Repository) AddMemberByAccount(
	ctx context.Context,
	operatorID int64,
	calendarID int64,
	account string,
	role string,
) (*CalendarMember, error) {
	if err := r.EnsureCalendarOwner(ctx, operatorID, calendarID); err != nil {
		return nil, err
	}

	account = strings.TrimSpace(account)
	if account == "" {
		return nil, pgx.ErrNoRows
	}

	var targetUserID int64
	err := r.db.QueryRow(ctx, `
		SELECT id
		FROM users
		WHERE username = $1
		   OR email = $1
		   OR nickname = $1
		LIMIT 1
	`, account).Scan(&targetUserID)
	if err != nil {
		return nil, err
	}

	if targetUserID == operatorID {
		return nil, ErrCannotManageOwner
	}

	existingRole, err := r.GetUserRole(ctx, targetUserID, calendarID)
	if err == nil && existingRole != "" {
		return nil, ErrMemberExists
	}
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}

	_, err = r.db.Exec(ctx, `
		INSERT INTO calendar_members (calendar_id, user_id, role, status, joined_at)
		VALUES ($1, $2, $3, 'active', NOW())
		ON CONFLICT (calendar_id, user_id)
		DO UPDATE SET
			role = EXCLUDED.role,
			status = 'active',
			joined_at = COALESCE(calendar_members.joined_at, NOW())
	`, calendarID, targetUserID, role)
	if err != nil {
		return nil, err
	}

	var member CalendarMember
	err = r.db.QueryRow(ctx, `
		SELECT
			cm.id,
			cm.calendar_id,
			cm.user_id,
			COALESCE(NULLIF(u.nickname, ''), u.username, ''),
			COALESCE(u.avatar_url, ''),
			cm.role,
			cm.status,
			cm.joined_at
		FROM calendar_members cm
		INNER JOIN users u ON u.id = cm.user_id
		WHERE cm.calendar_id = $1
		  AND cm.user_id = $2
		  AND cm.status = 'active'
	`, calendarID, targetUserID).Scan(
		&member.ID,
		&member.CalendarID,
		&member.UserID,
		&member.Nickname,
		&member.AvatarURL,
		&member.Role,
		&member.Status,
		&member.JoinedAt,
	)
	if err != nil {
		return nil, err
	}

	return &member, nil
}

func (r *Repository) UpdateMemberRole(ctx context.Context, operatorID, calendarID, memberUserID int64, role string) error {
	if err := r.EnsureCalendarOwner(ctx, operatorID, calendarID); err != nil {
		return err
	}

	targetRole, err := r.GetUserRole(ctx, memberUserID, calendarID)
	if err != nil {
		return err
	}
	if targetRole == RoleOwner || memberUserID == operatorID {
		return ErrCannotManageOwner
	}

	_, err = r.db.Exec(ctx, `
		UPDATE calendar_members
		SET role = $3
		WHERE calendar_id = $1
		  AND user_id = $2
		  AND status = 'active'
	`, calendarID, memberUserID, role)
	return err
}

func (r *Repository) RemoveMember(ctx context.Context, operatorID, calendarID, memberUserID int64) error {
	if err := r.EnsureCalendarOwner(ctx, operatorID, calendarID); err != nil {
		return err
	}

	targetRole, err := r.GetUserRole(ctx, memberUserID, calendarID)
	if err != nil {
		return err
	}
	if targetRole == RoleOwner || memberUserID == operatorID {
		return ErrCannotManageOwner
	}

	_, err = r.db.Exec(ctx, `
		UPDATE calendar_members
		SET status = 'removed'
		WHERE calendar_id = $1
		  AND user_id = $2
		  AND status = 'active'
	`, calendarID, memberUserID)
	return err
}

func (r *Repository) ListCalendarEvents(ctx context.Context, userID, calendarID int64, startAt, endAt time.Time, filters CalendarEventFilters) ([]CalendarEvent, error) {
	role, err := r.GetUserRole(ctx, userID, calendarID)
	if err != nil {
		return nil, err
	}

	statusExpr := `CASE
		WHEN LOWER(CASE WHEN ce.status = 'active' AND rec.status IS NOT NULL THEN rec.status ELSE COALESCE(ce.status, rec.status, 'pending') END) IN ('completed', 'done') THEN 'completed'
		WHEN LOWER(CASE WHEN ce.status = 'active' AND rec.status IS NOT NULL THEN rec.status ELSE COALESCE(ce.status, rec.status, 'pending') END) = 'cancelled' THEN 'cancelled'
		WHEN LOWER(COALESCE(ce.event_type, 'record')) IN ('rest', 'blocked', 'full') THEN LOWER(COALESCE(ce.event_type, 'record'))
		ELSE 'pending'
	END`
	whereParts := []string{
		"ce.calendar_id = $1",
		"cm.user_id = $2",
		"c.deleted_at IS NULL",
		"ce.deleted_at IS NULL",
		"ce.start_at >= $3",
		"ce.start_at < $4",
		"(ce.record_id IS NULL OR (rec.id IS NOT NULL AND rec.deleted_at IS NULL))",
	}
	args := []any{calendarID, userID, startAt, endAt}
	argIndex := 5

	if filters.AssigneeID != nil {
		whereParts = append(whereParts, fmt.Sprintf("COALESCE(rec.assignee_id, ce.assignee_id) = $%d", argIndex))
		args = append(args, *filters.AssigneeID)
		argIndex++
	}
	if filters.Status != "" && filters.Status != "all" {
		whereParts = append(whereParts, fmt.Sprintf("%s = $%d", statusExpr, argIndex))
		args = append(args, strings.ToLower(filters.Status))
		argIndex++
	}
	if filters.EventType != "" && filters.EventType != "all" {
		whereParts = append(whereParts, fmt.Sprintf("LOWER(COALESCE(ce.event_type, 'record')) = $%d", argIndex))
		args = append(args, strings.ToLower(filters.EventType))
		argIndex++
	}

	sql := fmt.Sprintf(`
		SELECT
			ce.id,
			ce.calendar_id,
			ce.record_id,
			ce.title,
			COALESCE(rec.title, ''),
			COALESCE(rec.content, ''),
			%s,
			LOWER(COALESCE(ce.event_type, 'record')),
			COALESCE(rec.assignee_id, ce.assignee_id),
			COALESCE(NULLIF(u.nickname, ''), NULLIF(su.nickname, ''), u.username, su.username, ''),
			ce.start_at,
			ce.end_at,
			ce.all_day
		FROM calendar_events ce
		INNER JOIN calendars c ON c.id = ce.calendar_id
		INNER JOIN calendar_members cm
			ON cm.calendar_id = ce.calendar_id
			AND cm.status = 'active'
		LEFT JOIN records rec ON rec.id = ce.record_id
		LEFT JOIN users u ON u.id = rec.assignee_id
		LEFT JOIN users su ON su.id = ce.assignee_id
		WHERE %s
		ORDER BY
			CASE WHEN LOWER(COALESCE(ce.event_type, 'record')) IN ('rest', 'blocked', 'full') THEN 0 ELSE 1 END,
			ce.start_at ASC,
			ce.id ASC
	`, statusExpr, strings.Join(whereParts, " AND "))

	rows, err := r.db.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]CalendarEvent, 0)
	for rows.Next() {
		var item CalendarEvent
		var start time.Time
		var end *time.Time
		if err := rows.Scan(
			&item.EventID,
			&item.CalendarID,
			&item.RecordID,
			&item.Title,
			&item.RecordTitle,
			&item.RecordContent,
			&item.Status,
			&item.EventType,
			&item.AssigneeID,
			&item.AssigneeName,
			&start,
			&end,
			&item.AllDay,
		); err != nil {
			return nil, err
		}
		item.ID = item.EventID
		item.StartAt = formatShanghaiTimestamp(start)
		if end != nil {
			formatted := formatShanghaiTimestamp(*end)
			item.EndAt = &formatted
		}
		item.CurrentUserRole = role
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return items, nil
}

func (r *Repository) CreateSpecialEvent(ctx context.Context, userID, calendarID int64, params CreateSpecialEventParams) (*CalendarEvent, error) {
	if err := r.EnsureCalendarEditable(ctx, userID, calendarID); err != nil {
		return nil, err
	}
	if _, err := r.GetUserRole(ctx, params.AssigneeID, calendarID); err != nil {
		return nil, err
	}

	titleMap := map[string]string{"rest": "休息", "blocked": "不接", "full": "已满"}
	title := titleMap[params.EventType]
	if title == "" {
		return nil, ErrNoPermission
	}

	startAt := params.Date
	var endAt *time.Time
	allDay := true
	if params.EventType == "blocked" {
		parsedStart, err := time.Parse("15:04", params.StartTime)
		if err != nil {
			return nil, err
		}
		parsedEnd, err := time.Parse("15:04", params.EndTime)
		if err != nil {
			return nil, err
		}
		startAt = time.Date(params.Date.Year(), params.Date.Month(), params.Date.Day(), parsedStart.Hour(), parsedStart.Minute(), 0, 0, params.Date.Location())
		end := time.Date(params.Date.Year(), params.Date.Month(), params.Date.Day(), parsedEnd.Hour(), parsedEnd.Minute(), 0, 0, params.Date.Location())
		endAt = &end
		allDay = false
	}

	var item CalendarEvent
	var start time.Time
	var end *time.Time
	err := r.db.QueryRow(ctx, `
		INSERT INTO calendar_events (
			calendar_id, title, start_at, end_at, all_day, timezone, status, event_type, created_by, assignee_id, content
		)
		VALUES ($1, $2, $3, $4, $5, 'Asia/Shanghai', $6, $6, $7, $8, $9)
		RETURNING id, calendar_id, title, status, event_type, assignee_id, start_at, end_at, all_day
	`, calendarID, title, startAt, endAt, allDay, params.EventType, userID, params.AssigneeID, strings.TrimSpace(params.Remark)).Scan(
		&item.EventID,
		&item.CalendarID,
		&item.Title,
		&item.Status,
		&item.EventType,
		&item.AssigneeID,
		&start,
		&end,
		&item.AllDay,
	)
	if err != nil {
		return nil, err
	}
	item.ID = item.EventID
	item.StartAt = formatShanghaiTimestamp(start)
	if end != nil {
		formatted := formatShanghaiTimestamp(*end)
		item.EndAt = &formatted
	}
	item.CurrentUserRole = RoleMember
	return &item, nil
}

func (r *Repository) MonthlyStats(ctx context.Context, userID, calendarID int64, month string, startAt, endAt time.Time) (*MonthlyStats, error) {
	if _, err := r.GetUserRole(ctx, userID, calendarID); err != nil {
		return nil, err
	}
	stats := MonthlyStats{Month: month}
	statusExpr := `CASE
		WHEN LOWER(CASE WHEN ce.status = 'active' AND rec.status IS NOT NULL THEN rec.status ELSE COALESCE(ce.status, rec.status, 'pending') END) IN ('completed', 'done') THEN 'completed'
		WHEN LOWER(CASE WHEN ce.status = 'active' AND rec.status IS NOT NULL THEN rec.status ELSE COALESCE(ce.status, rec.status, 'pending') END) = 'cancelled' THEN 'cancelled'
		WHEN LOWER(COALESCE(ce.event_type, 'record')) IN ('rest', 'blocked', 'full') THEN LOWER(COALESCE(ce.event_type, 'record'))
		ELSE 'pending'
	END`
	err := r.db.QueryRow(ctx, fmt.Sprintf(`
		SELECT
			COUNT(*) FILTER (WHERE LOWER(COALESCE(ce.event_type, 'record')) NOT IN ('rest','blocked','full')),
			COUNT(*) FILTER (WHERE %s = 'pending'),
			COUNT(*) FILTER (WHERE %s = 'completed'),
			COUNT(*) FILTER (WHERE %s = 'cancelled'),
			COUNT(DISTINCT ce.start_at::date) FILTER (WHERE LOWER(COALESCE(ce.event_type, 'record')) = 'rest'),
			COUNT(DISTINCT ce.start_at::date) FILTER (WHERE LOWER(COALESCE(ce.event_type, 'record')) = 'full')
		FROM calendar_events ce
		INNER JOIN calendar_members cm ON cm.calendar_id = ce.calendar_id AND cm.user_id = $2 AND cm.status = 'active'
		LEFT JOIN records rec ON rec.id = ce.record_id
		WHERE ce.calendar_id = $1
		  AND ce.deleted_at IS NULL
		  AND ce.start_at >= $3
		  AND ce.start_at < $4
		  AND (ce.record_id IS NULL OR (rec.id IS NOT NULL AND rec.deleted_at IS NULL))
	`, statusExpr, statusExpr, statusExpr), calendarID, userID, startAt, endAt).Scan(&stats.Total, &stats.Pending, &stats.Completed, &stats.Cancelled, &stats.RestDays, &stats.FullDays)
	if err != nil {
		return nil, err
	}
	return &stats, nil
}

func (r *Repository) MemberWorkloadStats(ctx context.Context, userID, calendarID int64, month string, startAt, endAt time.Time) (*MemberWorkloadStats, error) {
	if _, err := r.GetUserRole(ctx, userID, calendarID); err != nil {
		return nil, err
	}
	statusExpr := `CASE
		WHEN LOWER(CASE WHEN ce.status = 'active' AND rec.status IS NOT NULL THEN rec.status ELSE COALESCE(ce.status, rec.status, 'pending') END) IN ('completed', 'done') THEN 'completed'
		WHEN LOWER(CASE WHEN ce.status = 'active' AND rec.status IS NOT NULL THEN rec.status ELSE COALESCE(ce.status, rec.status, 'pending') END) = 'cancelled' THEN 'cancelled'
		WHEN LOWER(COALESCE(ce.event_type, 'record')) IN ('rest', 'blocked', 'full') THEN LOWER(COALESCE(ce.event_type, 'record'))
		ELSE 'pending'
	END`
	rows, err := r.db.Query(ctx, fmt.Sprintf(`
		SELECT
			u.id,
			COALESCE(NULLIF(u.nickname, ''), u.username, ''),
			COUNT(*),
			COUNT(*) FILTER (WHERE %s = 'completed'),
			COUNT(*) FILTER (WHERE %s = 'cancelled'),
			COUNT(*) FILTER (WHERE %s = 'pending')
		FROM calendar_events ce
		INNER JOIN calendar_members cm ON cm.calendar_id = ce.calendar_id AND cm.user_id = $2 AND cm.status = 'active'
		INNER JOIN records rec ON rec.id = ce.record_id AND rec.deleted_at IS NULL
		LEFT JOIN users u ON u.id = rec.assignee_id
		WHERE ce.calendar_id = $1
		  AND ce.deleted_at IS NULL
		  AND ce.start_at >= $3
		  AND ce.start_at < $4
		  AND LOWER(COALESCE(ce.event_type, 'record')) NOT IN ('rest','blocked','full')
		  AND rec.assignee_id IS NOT NULL
		GROUP BY u.id, COALESCE(NULLIF(u.nickname, ''), u.username, '')
		ORDER BY COUNT(*) DESC, u.id ASC
	`, statusExpr, statusExpr, statusExpr), calendarID, userID, startAt, endAt)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	stats := MemberWorkloadStats{Month: month, Items: []MemberWorkloadItem{}}
	for rows.Next() {
		var item MemberWorkloadItem
		if err := rows.Scan(&item.UserID, &item.Name, &item.Total, &item.Completed, &item.Cancelled, &item.Pending); err != nil {
			return nil, err
		}
		stats.Items = append(stats.Items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return &stats, nil
}

func (r *Repository) UpdateCalendarEventTime(ctx context.Context, userID, eventID int64, params CalendarEventTimeParams) error {
	calendarID, err := r.getEventCalendarID(ctx, eventID)
	if err != nil {
		return err
	}
	if err := r.EnsureCalendarEditable(ctx, userID, calendarID); err != nil {
		return err
	}

	_, err = r.db.Exec(ctx, `
		UPDATE calendar_events
		SET start_at = $2,
		    end_at = $3,
		    all_day = $4,
		    timezone = 'Asia/Shanghai',
		    updated_at = NOW()
		WHERE id = $1
		  AND deleted_at IS NULL
	`, eventID, params.StartAt, params.EndAt, params.AllDay)
	return err
}

func (r *Repository) DeleteCalendarEvent(ctx context.Context, userID, eventID int64) error {
	calendarID, err := r.getEventCalendarID(ctx, eventID)
	if err != nil {
		return err
	}
	if err := r.EnsureCalendarEditable(ctx, userID, calendarID); err != nil {
		return err
	}

	_, err = r.db.Exec(ctx, `
		UPDATE calendar_events
		SET deleted_at = NOW(),
		    updated_at = NOW()
		WHERE id = $1
		  AND deleted_at IS NULL
	`, eventID)
	return err
}

func (r *Repository) getEventCalendarID(ctx context.Context, eventID int64) (int64, error) {
	var calendarID int64
	err := r.db.QueryRow(ctx, `
		SELECT ce.calendar_id
		FROM calendar_events ce
		INNER JOIN calendars c ON c.id = ce.calendar_id
		WHERE ce.id = $1
		  AND ce.deleted_at IS NULL
		  AND c.deleted_at IS NULL
	`, eventID).Scan(&calendarID)
	return calendarID, err
}

func formatShanghaiTimestamp(t time.Time) string {
	loc, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		loc = time.FixedZone("Asia/Shanghai", 8*60*60)
	}
	return time.Date(t.Year(), t.Month(), t.Day(), t.Hour(), t.Minute(), t.Second(), t.Nanosecond(), loc).Format(time.RFC3339)
}

func calendarSelectSQL() string {
	return `
		SELECT
			c.id,
			c.name,
			COALESCE(c.description, ''),
			COALESCE(c.color, ''),
			COALESCE(c.timezone, ''),
			COALESCE(c.cover_url, ''),
			c.owner_id,
			cm.role,
			(
				SELECT COUNT(*)
				FROM calendar_members m
				WHERE m.calendar_id = c.id
				  AND m.status = 'active'
			),
			(
				SELECT COUNT(*)
				FROM records rec
				WHERE rec.calendar_id = c.id
			),
			(
				SELECT COUNT(*)
				FROM records rec
				WHERE rec.calendar_id = c.id
				  AND rec.created_at >= CURRENT_DATE
				  AND rec.created_at < CURRENT_DATE + INTERVAL '1 day'
			),
			c.created_at,
			c.updated_at
		FROM calendars c
		INNER JOIN calendar_members cm ON cm.calendar_id = c.id
	`
}

type calendarScanner interface {
	Scan(dest ...any) error
}

func scanCalendar(row calendarScanner) (Calendar, error) {
	var cal Calendar
	err := row.Scan(
		&cal.ID,
		&cal.Name,
		&cal.Description,
		&cal.Color,
		&cal.Timezone,
		&cal.CoverURL,
		&cal.OwnerID,
		&cal.CurrentUserRole,
		&cal.MemberCount,
		&cal.RecordCount,
		&cal.TodayRecordCount,
		&cal.CreatedAt,
		&cal.UpdatedAt,
	)
	return cal, err
}

func IsNotFound(err error) bool {
	return errors.Is(err, pgx.ErrNoRows)
}
