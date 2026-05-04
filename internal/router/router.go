package router

import (
	"reminder-flow/internal/modules/notification"
	"reminder-flow/internal/modules/record"
	"reminder-flow/internal/modules/reminder"
	"reminder-flow/internal/modules/todo"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"

	"reminder-flow/internal/config"
	"reminder-flow/internal/middleware"
	"reminder-flow/internal/modules/auth"
	"reminder-flow/internal/modules/user"
	"reminder-flow/internal/modules/workspace"
	"reminder-flow/pkg/response"
)

func NewRouter(db *pgxpool.Pool, cfg *config.Config) *gin.Engine {
	r := gin.Default()

	r.Use(cors.New(cors.Config{
		AllowOrigins: []string{
			"http://localhost:5173",
			"http://127.0.0.1:5173",
		},
		AllowMethods: []string{
			"GET",
			"POST",
			"PUT",
			"PATCH",
			"DELETE",
			"OPTIONS",
		},
		AllowHeaders: []string{
			"Origin",
			"Content-Type",
			"Accept",
			"Authorization",
		},
		ExposeHeaders: []string{
			"Content-Length",
		},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	r.GET("/health", func(c *gin.Context) {
		response.OK(c, gin.H{
			"status": "ok",
		})
	})

	authRepo := auth.NewRepository(db)
	authHandler := auth.NewHandler(authRepo, cfg.JWTSecret)

	userRepo := user.NewRepository(db)
	userHandler := user.NewHandler(userRepo)

	workspaceRepo := workspace.NewRepository(db)
	workspaceHandler := workspace.NewHandler(workspaceRepo)

	recordRepo := record.NewRepository(db)
	recordHandler := record.NewHandler(recordRepo)

	reminderRepo := reminder.NewRepository(db)
	reminderHandler := reminder.NewHandler(reminderRepo)

	notificationRepo := notification.NewRepository(db)
	notificationHandler := notification.NewHandler(notificationRepo)

	todoRepo := todo.NewRepository(db)
	todoHandler := todo.NewHandler(todoRepo)

	api := r.Group("/api")
	{
		api.POST("/auth/register", authHandler.Register)
		api.POST("/auth/login", authHandler.Login)

		authGroup := api.Group("")
		authGroup.Use(middleware.JWTAuthMiddleware(cfg.JWTSecret))
		{
			authGroup.GET("/users/me", userHandler.Me)

			authGroup.POST("/workspaces", workspaceHandler.Create)
			authGroup.GET("/workspaces", workspaceHandler.ListMine)

			authGroup.POST("/workspaces/:id/members", workspaceHandler.AddMember)
			authGroup.GET("/workspaces/:id/members", workspaceHandler.ListMembers)
			authGroup.DELETE("/workspaces/:id/members/:user_id", workspaceHandler.RemoveMember)
			authGroup.PUT("/workspaces/:id/members/:user_id/role", workspaceHandler.UpdateMemberRole)

			authGroup.POST("/records", recordHandler.Create)
			authGroup.GET("/records", recordHandler.List)

			authGroup.GET("/records/overdue", recordHandler.ListOverdue)

			authGroup.GET("/records/:id/logs", recordHandler.ListOperationLogs)

			authGroup.PUT("/records/:id/assignee", recordHandler.TransferAssignee)

			authGroup.GET("/records/:id", recordHandler.Detail)
			authGroup.PUT("/records/:id", recordHandler.Update)
			authGroup.DELETE("/records/:id", recordHandler.Delete)
			authGroup.PUT("/records/:id/status", recordHandler.UpdateStatus)

			authGroup.POST("/records/:id/reminders", reminderHandler.Create)
			authGroup.GET("/reminders/today", reminderHandler.ListToday)
			authGroup.GET("/reminders/upcoming", reminderHandler.ListUpcoming)

			authGroup.GET("/notifications", notificationHandler.List)
			authGroup.PUT("/notifications/:id/read", notificationHandler.MarkAsRead)

			authGroup.GET("/todos/today", todoHandler.Today)
		}
	}

	return r
}
