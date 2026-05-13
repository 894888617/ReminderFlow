package invite

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"log"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrInviteLimitReached = errors.New("invite usage limit reached")

type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

type CalendarInvite struct {
	ID           int64     `json:"id"`
	CalendarID   int64     `json:"calendar_id"`
	CalendarName string    `json:"calendar_name"`
	InviterID    int64     `json:"inviter_id"`
	InviterName  string    `json:"inviter_name"`
	Code         string    `json:"code"`
	Role         string    `json:"role"`
	ExpireAt     time.Time `json:"expire_at"`
	UsedCount    int       `json:"used_count"`
	MaxUses      int       `json:"max_uses"`
	CreatedAt    time.Time `json:"created_at"`
}

type AcceptResult struct {
	CalendarID    int64
	CalendarName  string
	Role          string
	AlreadyJoined bool
}

func GenerateInviteCode() (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}

	return hex.EncodeToString(buf), nil
}

func (r *Repository) CreateInvite(
	ctx context.Context,
	calendarID int64,
	inviterID int64,
	role string,
	expireAt time.Time,
	maxUses int,
) (*CalendarInvite, error) {
	code, err := GenerateInviteCode()
	if err != nil {
		return nil, err
	}

	err = r.db.QueryRow(ctx, `
		INSERT INTO calendar_invites (
			calendar_id,
			created_by,
			code,
			role,
			expire_at,
			max_uses,
			created_at,
			updated_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
		RETURNING code
	`, calendarID, inviterID, code, role, expireAt, maxUses).Scan(&code)
	if err != nil {
		return nil, err
	}

	return r.GetInviteByCode(ctx, code)
}

func (r *Repository) GetInviteByCode(ctx context.Context, code string) (*CalendarInvite, error) {
	var invite CalendarInvite

	err := r.db.QueryRow(ctx, `
		SELECT
			ci.id,
			ci.calendar_id,
			c.name,
			ci.created_by,
			COALESCE(NULLIF(u.nickname, ''), u.username, ''),
			ci.code,
			ci.role,
			ci.expire_at,
			COALESCE(ci.used_count, 0),
			COALESCE(ci.max_uses, 1),
			ci.created_at
		FROM calendar_invites ci
		INNER JOIN calendars c ON c.id = ci.calendar_id
		INNER JOIN users u ON u.id = ci.created_by
		WHERE ci.code = $1
		  AND ci.deleted_at IS NULL
		  AND c.deleted_at IS NULL
	`, code).Scan(
		&invite.ID,
		&invite.CalendarID,
		&invite.CalendarName,
		&invite.InviterID,
		&invite.InviterName,
		&invite.Code,
		&invite.Role,
		&invite.ExpireAt,
		&invite.UsedCount,
		&invite.MaxUses,
		&invite.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	return &invite, nil
}

func (r *Repository) GetCalendarMemberRole(ctx context.Context, calendarID int64, userID int64) (string, error) {
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

func (r *Repository) IsCalendarMember(ctx context.Context, calendarID int64, userID int64) (bool, error) {
	var exists bool

	err := r.db.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM calendar_members cm
			INNER JOIN calendars c ON c.id = cm.calendar_id
			WHERE cm.calendar_id = $1
			  AND cm.user_id = $2
			  AND cm.status = 'active'
			  AND c.deleted_at IS NULL
		)
	`, calendarID, userID).Scan(&exists)

	return exists, err
}

func (r *Repository) AcceptInvite(ctx context.Context, code string, userID int64) (*AcceptResult, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var invite CalendarInvite
	err = tx.QueryRow(ctx, `
		SELECT
			ci.id,
			ci.calendar_id,
			c.name,
			ci.role,
			ci.expire_at,
			COALESCE(ci.used_count, 0),
			COALESCE(ci.max_uses, 1)
		FROM calendar_invites ci
		INNER JOIN calendars c ON c.id = ci.calendar_id
		WHERE ci.code = $1
		  AND ci.deleted_at IS NULL
		  AND c.deleted_at IS NULL
		FOR UPDATE OF ci
	`, code).Scan(
		&invite.ID,
		&invite.CalendarID,
		&invite.CalendarName,
		&invite.Role,
		&invite.ExpireAt,
		&invite.UsedCount,
		&invite.MaxUses,
	)
	if err != nil {
		return nil, err
	}

	var existingRole string
	err = tx.QueryRow(ctx, `
		SELECT role
		FROM calendar_members
		WHERE calendar_id = $1
		  AND user_id = $2
		  AND status = 'active'
	`, invite.CalendarID, userID).Scan(&existingRole)
	if err == nil {
		if err := tx.Commit(ctx); err != nil {
			return nil, err
		}
		return &AcceptResult{CalendarID: invite.CalendarID, CalendarName: invite.CalendarName, Role: existingRole, AlreadyJoined: true}, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}

	if invite.ExpireAt.Before(time.Now()) {
		return nil, ErrInviteExpired
	}
	if invite.MaxUses > 0 && invite.UsedCount >= invite.MaxUses {
		return nil, ErrInviteLimitReached
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO calendar_members (
			calendar_id,
			user_id,
			role,
			status,
			joined_at,
			created_at,
			updated_at
		)
		VALUES ($1, $2, $3, 'active', NOW(), NOW(), NOW())
		ON CONFLICT (calendar_id, user_id)
		DO UPDATE SET
			role = EXCLUDED.role,
			status = 'active',
			joined_at = NOW(),
			updated_at = NOW()
	`, invite.CalendarID, userID, invite.Role)
	if err != nil {
		return nil, err
	}

	_, err = tx.Exec(ctx, `
		UPDATE calendar_invites
		SET used_count = used_count + 1,
		    updated_at = NOW()
		WHERE id = $1
	`, invite.ID)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return &AcceptResult{CalendarID: invite.CalendarID, CalendarName: invite.CalendarName, Role: invite.Role}, nil
}

func (r *Repository) CreateNotification(ctx context.Context, calendarID, userID int64, notificationType, title, content string) error {
	if userID <= 0 {
		log.Printf("warning: skip notification with invalid user_id=%d", userID)
		return nil
	}

	tag, err := r.db.Exec(ctx, `
		INSERT INTO notifications (
			calendar_id,
			user_id,
			notification_type,
			title,
			content,
			read,
			created_at
		)
		SELECT NULLIF($1, 0), $2, $3, $4, $5, false, NOW()
		WHERE EXISTS (SELECT 1 FROM users WHERE id = $2)
	`, calendarID, userID, notificationType, title, content)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		log.Printf("warning: skip notification for missing user_id=%d calendar_id=%d", userID, calendarID)
	}
	return nil
}

func IsNotFound(err error) bool {
	return errors.Is(err, pgx.ErrNoRows)
}
