package user

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

type UserDTO struct {
	ID        int64  `json:"id"`
	Username  string `json:"username"`
	Email     string `json:"email"`
	CreatedAt string `json:"created_at"`
}

func (r *Repository) FindByID(ctx context.Context, id int64) (*UserDTO, error) {
	var u UserDTO

	err := r.db.QueryRow(ctx, `
		SELECT 
			id,
			username,
			COALESCE(email, ''),
			created_at::text
		FROM users
		WHERE id = $1
	`, id).Scan(
		&u.ID,
		&u.Username,
		&u.Email,
		&u.CreatedAt,
	)

	if err != nil {
		return nil, err
	}

	return &u, nil
}
