package db

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func RunMigration(pool *pgxpool.Pool, migrationPath string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	sqlBytes, err := os.ReadFile(migrationPath)
	if err != nil {
		return fmt.Errorf("read migration file failed: %w", err)
	}

	sqlContent := string(sqlBytes)
	if sqlContent == "" {
		return fmt.Errorf("migration file is empty: %s", migrationPath)
	}

	_, err = pool.Exec(ctx, sqlContent)
	if err != nil {
		return fmt.Errorf("execute migration failed: %w", err)
	}

	return nil
}

func ResolveMigrationPath() string {
	candidates := []string{
		"migrations/001_init.sql",
		"./migrations/001_init.sql",
		filepath.Join(".", "migrations", "001_init.sql"),
		filepath.Join("/app", "migrations", "001_init.sql"),
	}

	for _, path := range candidates {
		if _, err := os.Stat(path); err == nil {
			return path
		}
	}

	return "migrations/001_init.sql"
}
