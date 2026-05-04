package middleware

import (
	"strings"

	"github.com/gin-gonic/gin"

	"reminder-flow/pkg/jwtutil"
	"reminder-flow/pkg/response"
)

const CurrentUserIDKey = "current_user_id"

func JWTAuthMiddleware(jwtSecret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			response.Unauthorized(c, "missing authorization header")
			c.Abort()
			return
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
			response.Unauthorized(c, "invalid authorization format")
			c.Abort()
			return
		}

		tokenStr := strings.TrimSpace(parts[1])
		if tokenStr == "" {
			response.Unauthorized(c, "empty token")
			c.Abort()
			return
		}

		claims, err := jwtutil.ParseToken(tokenStr, jwtSecret)
		if err != nil {
			response.Unauthorized(c, "invalid or expired token")
			c.Abort()
			return
		}

		c.Set(CurrentUserIDKey, claims.UserID)
		c.Next()
	}
}

func GetCurrentUserID(c *gin.Context) (int64, bool) {
	value, exists := c.Get(CurrentUserIDKey)
	if !exists {
		return 0, false
	}

	userID, ok := value.(int64)
	return userID, ok
}
