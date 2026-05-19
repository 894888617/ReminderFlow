package main

import (
	"log"

	"reminder-flow/internal/config"
	"reminder-flow/internal/db"
	"reminder-flow/internal/router"
)

func main() {
	cfg := config.Load()

	pool, err := db.NewPostgresPool(cfg.DatabaseDSN)
	if err != nil {
		log.Fatalf("connect database failed: %v", err)
	}
	defer pool.Close()

	migrationDir := db.ResolveMigrationDir()

	if err := db.RunMigrations(pool, migrationDir); err != nil {
		log.Fatalf("run migrations failed: %v", err)
	}

	log.Printf("migrations executed successfully: %s", migrationDir)


	r := router.NewRouter(pool, cfg)

	addr := ":" + cfg.ServerPort
	log.Printf("server started at %s", addr)

	if err := r.Run(addr); err != nil {
		log.Fatalf("server run failed: %v", err)
	}
}
