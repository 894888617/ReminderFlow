package workspace

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

type Workspace struct {
	ID        int64     `json:"id"`
	Name      string    `json:"name"`
	OwnerID   int64     `json:"owner_id"`
	Role      string    `json:"role"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (r *Repository) Create(ctx context.Context, name string, ownerID int64) (*Workspace, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var w Workspace

	err = tx.QueryRow(ctx, `
		INSERT INTO workspaces (name, owner_id)
		VALUES ($1, $2)
		RETURNING id, name, owner_id, created_at, updated_at
	`, name, ownerID).Scan(
		&w.ID,
		&w.Name,
		&w.OwnerID,
		&w.CreatedAt,
		&w.UpdatedAt,
	)

	if err != nil {
		return nil, err
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO workspace_members (workspace_id, user_id, role)
		VALUES ($1, $2, $3)
	`, w.ID, ownerID, "owner")

	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	w.Role = "owner"

	return &w, nil
}

func (r *Repository) FindMyWorkspaces(ctx context.Context, userID int64) ([]Workspace, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
			w.id,
			w.name,
			w.owner_id,
			wm.role,
			w.created_at,
			w.updated_at
		FROM workspaces w
		INNER JOIN workspace_members wm ON wm.workspace_id = w.id
		WHERE wm.user_id = $1
		ORDER BY w.created_at DESC
	`, userID)

	if err != nil {
		return nil, err
	}

	defer rows.Close()

	list := make([]Workspace, 0)

	for rows.Next() {
		var w Workspace

		if err := rows.Scan(
			&w.ID,
			&w.Name,
			&w.OwnerID,
			&w.Role,
			&w.CreatedAt,
			&w.UpdatedAt,
		); err != nil {
			return nil, err
		}

		list = append(list, w)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return list, nil
}

type WorkspaceMember struct {
	ID          int64  `json:"id"`
	WorkspaceID int64  `json:"workspace_id"`
	UserID      int64  `json:"user_id"`
	Username    string `json:"username"`
	Email       string `json:"email"`
	Role        string `json:"role"`
	CreatedAt   string `json:"created_at"`
}

func (r *Repository) FindUserByUsernameOrEmail(ctx context.Context, keyword string) (int64, error) {
	var userID int64

	err := r.db.QueryRow(ctx, `
		SELECT id
		FROM users
		WHERE username = $1 OR email = $1
	`, keyword).Scan(&userID)

	return userID, err
}

func (r *Repository) GetMemberRole(ctx context.Context, workspaceID, userID int64) (string, error) {
	var role string

	err := r.db.QueryRow(ctx, `
		SELECT role
		FROM workspace_members
		WHERE workspace_id = $1
		AND user_id = $2
	`, workspaceID, userID).Scan(&role)

	return role, err
}

func (r *Repository) AddMember(ctx context.Context, workspaceID, userID int64, role string) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO workspace_members (workspace_id, user_id, role)
		VALUES ($1, $2, $3)
	`, workspaceID, userID, role)

	return err
}

func (r *Repository) ListMembers(ctx context.Context, workspaceID int64) ([]WorkspaceMember, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
			wm.id,
			wm.workspace_id,
			wm.user_id,
			u.username,
			COALESCE(u.email, ''),
			wm.role,
			wm.created_at::text
		FROM workspace_members wm
		INNER JOIN users u ON u.id = wm.user_id
		WHERE wm.workspace_id = $1
		ORDER BY 
			CASE wm.role
				WHEN 'owner' THEN 1
				WHEN 'member' THEN 2
				WHEN 'viewer' THEN 3
				ELSE 4
			END,
			wm.created_at ASC
	`, workspaceID)

	if err != nil {
		return nil, err
	}

	defer rows.Close()

	list := make([]WorkspaceMember, 0)

	for rows.Next() {
		var m WorkspaceMember

		if err := rows.Scan(
			&m.ID,
			&m.WorkspaceID,
			&m.UserID,
			&m.Username,
			&m.Email,
			&m.Role,
			&m.CreatedAt,
		); err != nil {
			return nil, err
		}

		list = append(list, m)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return list, nil
}

func (r *Repository) ExistsWorkspace(ctx context.Context, workspaceID int64) (bool, error) {
	var exists bool

	err := r.db.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM workspaces
			WHERE id = $1
		)
	`, workspaceID).Scan(&exists)

	return exists, err
}

func (r *Repository) ExistsMember(ctx context.Context, workspaceID, userID int64) (bool, error) {
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

func (r *Repository) RemoveMember(ctx context.Context, workspaceID, userID int64) error {
	_, err := r.db.Exec(ctx, `
		DELETE FROM workspace_members
		WHERE workspace_id = $1
		  AND user_id = $2
	`, workspaceID, userID)

	return err
}

func (r *Repository) GetTargetMemberRole(ctx context.Context, workspaceID, targetUserID int64) (string, error) {
	var role string

	err := r.db.QueryRow(ctx, `
		SELECT role
		FROM workspace_members
		WHERE workspace_id = $1
		  AND user_id = $2
	`, workspaceID, targetUserID).Scan(&role)

	return role, err
}

func (r *Repository) CountUnfinishedRecordsByAssignee(ctx context.Context, workspaceID, userID int64) (int64, error) {
	var count int64

	err := r.db.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM records
		WHERE workspace_id = $1
		  AND assignee_id = $2
		  AND status NOT IN ('DONE', 'CANCELLED')
	`, workspaceID, userID).Scan(&count)

	return count, err
}

func (r *Repository) UpdateMemberRole(ctx context.Context, workspaceID, userID int64, role string) error {
	_, err := r.db.Exec(ctx, `
		UPDATE workspace_members
		SET role = $3
		WHERE workspace_id = $1
		  AND user_id = $2
	`, workspaceID, userID, role)

	return err
}
