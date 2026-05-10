package config

import (
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	ServerPort  string
	DatabaseDSN string
	JWTSecret   string

	WechatMiniAppID     string
	WechatMiniAppSecret string
	WechatMiniMockLogin string

	WechatMiniTaskReminderTemplateID string
	WechatMiniOverdueTemplateID      string
	WechatMiniAssigneeTemplateID     string
}

func Load() *Config {
	_ = godotenv.Load()

	return &Config{
		ServerPort:  getEnv("SERVER_PORT", "8080"),
		DatabaseDSN: getEnv("DATABASE_DSN", ""),
		JWTSecret:   getEnv("JWT_SECRET", "reminder-flow-secret"),

		WechatMiniAppID:     getEnv("WECHAT_MINI_APP_ID", ""),
		WechatMiniAppSecret: getEnv("WECHAT_MINI_APP_SECRET", ""),
		WechatMiniMockLogin: getEnv("WECHAT_MINI_MOCK_LOGIN", "false"),

		WechatMiniTaskReminderTemplateID: getEnv("WECHAT_MINI_TASK_REMINDER_TEMPLATE_ID", ""),
		WechatMiniOverdueTemplateID:      getEnv("WECHAT_MINI_OVERDUE_TEMPLATE_ID", ""),
		WechatMiniAssigneeTemplateID:     getEnv("WECHAT_MINI_ASSIGNEE_TEMPLATE_ID", ""),
	}
}

func getEnv(key, defaultValue string) string {
	value := os.Getenv(key)
	if value == "" {
		return defaultValue
	}
	return value
}
