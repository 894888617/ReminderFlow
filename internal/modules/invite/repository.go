package invite

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

type WorkspaceInvite struct {
	ID            int64      `json:"id"`
	WorkspaceID   int64      `json:"workspace_id"`
	WorkspaceName string     `json:"workspace_name"`
	InviterID     int64      `json:"inviter_id"`
	InviterName   string     `json:"inviter_name"`
	InviteCode    string     `json:"invite_code"`
	Role          string     `json:"role"`
	ExpireAt      *time.Time `json:"expire_at"`
	UsedCount     int        `json:"used_count"`
	MaxUseCount   *int       `json:"max_use_count"`
	CreatedAt     time.Time  `json:"created_at"`
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
	workspaceID int64,
	inviterID int64,
	role string,
	expireAt *time.Time,
	maxUseCount *int,
) (*WorkspaceInvite, error) {
	code, err := GenerateInviteCode()
	if err != nil {
		return nil, err
	}

	var invite WorkspaceInvite

	err = r.db.QueryRow(ctx, `
		INSERT INTO workspace_invites (
			workspace_id,
			inviter_id,
			invite_code,
			role,
			expire_at,
			max_use_count,
			created_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, NOW())
		RETURNING
			id,
			workspace_id,
			inviter_id,
			invite_code,
			role,
			expire_at,
			used_count,
			max_use_count,
			created_at
	`, workspaceID, inviterID, code, role, expireAt, maxUseCount).Scan(
		&invite.ID,
		&invite.WorkspaceID,
		&invite.InviterID,
		&invite.InviteCode,
		&invite.Role,
		&invite.ExpireAt,
		&invite.UsedCount,
		&invite.MaxUseCount,
		&invite.CreatedAt,
	)

	if err != nil {
		return nil, err
	}

	return r.GetInviteByCode(ctx, code)
}

func (r *Repository) GetInviteByCode(ctx context.Context, code string) (*WorkspaceInvite, error) {
	var invite WorkspaceInvite

	err := r.db.QueryRow(ctx, `
		SELECT
			wi.id,
			wi.workspace_id,
			ws.name,
			wi.inviter_id,
			u.username,
			wi.invite_code,
			wi.role,
			wi.expire_at,
			wi.used_count,
			wi.max_use_count,
			wi.created_at
		FROM workspace_invites wi
		INNER JOIN workspaces ws ON ws.id = wi.workspace_id
		INNER JOIN users u ON u.id = wi.inviter_id
		WHERE wi.invite_code = $1
	`, code).Scan(
		&invite.ID,
		&invite.WorkspaceID,
		&invite.WorkspaceName,
		&invite.InviterID,
		&invite.InviterName,
		&invite.InviteCode,
		&invite.Role,
		&invite.ExpireAt,
		&invite.UsedCount,
		&invite.MaxUseCount,
		&invite.CreatedAt,
	)

	if err != nil {
		return nil, err
	}

	return &invite, nil
}

func (r *Repository) GetWorkspaceMemberRole(ctx context.Context, workspaceID int64, userID int64) (string, error) {
	var role string

	err := r.db.QueryRow(ctx, `
		SELECT role
		FROM workspace_members
		WHERE workspace_id = $1
		  AND user_id = $2
	`, workspaceID, userID).Scan(&role)

	if err != nil {
		return "", err
	}

	return role, nil
}

func (r *Repository) IsWorkspaceMember(ctx context.Context, workspaceID int64, userID int64) (bool, error) {
	var exists bool

	err := r.db.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM workspace_members
			WHERE workspace_id = $1
			  AND user_id = $2
		)
	`, workspaceID, userID).Scan(&exists)

	return exists, err
}

func (r *Repository) AcceptInvite(ctx context.Context, invite *WorkspaceInvite, userID int64) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx, `
		INSERT INTO workspace_members (
			workspace_id,
			user_id,
			role,
			created_at
		)
		VALUES ($1, $2, $3, NOW())
		ON CONFLICT (workspace_id, user_id)
		DO UPDATE SET role = workspace_members.role
	`, invite.WorkspaceID, userID, invite.Role)
	if err != nil {
		return err
	}

	_, err = tx.Exec(ctx, `
		UPDATE workspace_invites
		SET used_count = used_count + 1
		WHERE id = $1
	`, invite.ID)
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}
