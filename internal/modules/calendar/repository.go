package calendar

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrNoPermission      = errors.New("no permission")
	ErrCannotManageOwner = errors.New("cannot manage owner")
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
