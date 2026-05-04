package auth

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

type User struct {
	ID           int64
	Username     string
	Email        string
	PasswordHash string
}

func (r *Repository) CreateUser(ctx context.Context, username, email, passwordHash string) (int64, error) {
	var id int64

	err := r.db.QueryRow(ctx, `
		INSERT INTO users (username, email, password_hash)
		VALUES ($1, $2, $3)
		RETURNING id
	`, username, email, passwordHash).Scan(&id)

	return id, err
}

func (r *Repository) FindByUsername(ctx context.Context, username string) (*User, error) {
	var u User

	err := r.db.QueryRow(ctx, `
		SELECT id, username, email, password_hash
		FROM users
		WHERE username = $1
	`, username).Scan(&u.ID, &u.Username, &u.Email, &u.PasswordHash)

	if err != nil {
		return nil, err
	}

	return &u, nil
}
