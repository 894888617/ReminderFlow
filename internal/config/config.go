package config

import (
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	ServerPort  string
	DatabaseDSN string
	JWTSecret   string
}

func Load() *Config {
	_ = godotenv.Load()

	return &Config{
		ServerPort:  getEnv("SERVER_PORT", "8080"),
		DatabaseDSN: getEnv("DATABASE_DSN", ""),
		JWTSecret:   getEnv("JWT_SECRET", "reminder-flow-secret"),
	}
}

func getEnv(key, defaultValue string) string {
	value := os.Getenv(key)
	if value == "" {
		return defaultValue
	}
	return value
}
