package main

import (
	"log"
	"reminder-flow/internal/modules/subscription"
	"reminder-flow/internal/scheduler"
	"reminder-flow/internal/wechat"

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

	subscriptionRepo := subscription.NewRepository(pool)

	wechatMiniService := wechat.NewMiniService(
		cfg.WechatMiniAppID,
		cfg.WechatMiniAppSecret,
	)

	subscriptionService := subscription.NewService(
		cfg,
		subscriptionRepo,
		wechatMiniService,
	)

	reminderScheduler := scheduler.NewReminderScheduler(pool, subscriptionService)
	reminderScheduler.Start()

	overdueScheduler := scheduler.NewOverdueScheduler(pool, subscriptionService)
	overdueScheduler.Start()

	r := router.NewRouter(pool, cfg)

	addr := ":" + cfg.ServerPort
	log.Printf("server started at %s", addr)

	if err := r.Run(addr); err != nil {
		log.Fatalf("server run failed: %v", err)
	}
}
