package main

import (
	"log"
	"reminder-flow/internal/scheduler"

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

	migrationPath := db.ResolveMigrationPath()

	if err := db.RunMigration(pool, migrationPath); err != nil {
		log.Fatalf("run migration failed: %v", err)
	}

	log.Printf("migration executed successfully: %s", migrationPath)

	reminderScheduler := scheduler.NewReminderScheduler(pool)
	reminderScheduler.Start()

	overdueScheduler := scheduler.NewOverdueScheduler(pool)
	overdueScheduler.Start()

	r := router.NewRouter(pool, cfg)

	addr := ":" + cfg.ServerPort
	log.Printf("server started at %s", addr)

	if err := r.Run(addr); err != nil {
		log.Fatalf("server run failed: %v", err)
	}
}
