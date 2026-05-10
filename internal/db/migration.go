package db

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
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

func RunMigrations(pool *pgxpool.Pool, dir string) error {
	files, err := filepath.Glob(filepath.Join(dir, "*.sql"))
	if err != nil {
		return fmt.Errorf("find migration files failed: %w", err)
	}

	if len(files) == 0 {
		return fmt.Errorf("no migration files found in %s", dir)
	}

	sort.Strings(files)

	for _, file := range files {
		if err := RunMigration(pool, file); err != nil {
			return fmt.Errorf("run migration %s failed: %w", file, err)
		}
	}

	return nil
}

func ResolveMigrationDir() string {
	candidates := []string{
		"migrations",
		"./migrations",
		filepath.Join(".", "migrations"),
		filepath.Join("/app", "migrations"),
	}

	for _, path := range candidates {
		if stat, err := os.Stat(path); err == nil && stat.IsDir() {
			return path
		}
	}

	return "migrations"
}
