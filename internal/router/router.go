package router

import (
	"reminder-flow/internal/modules/calendar"
	"reminder-flow/internal/modules/invite"
	"reminder-flow/internal/modules/mobile"
	"reminder-flow/internal/modules/notification"
	"reminder-flow/internal/modules/record"
	"reminder-flow/internal/modules/reminder"
	"reminder-flow/internal/modules/subscription"
	"reminder-flow/internal/modules/todo"
	"reminder-flow/internal/modules/wechatmini"
	"reminder-flow/internal/wechat"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"

	"reminder-flow/internal/config"
	"reminder-flow/internal/middleware"
	"reminder-flow/internal/modules/auth"
	"reminder-flow/internal/modules/user"
	"reminder-flow/pkg/response"
)

func NewRouter(db *pgxpool.Pool, cfg *config.Config) *gin.Engine {
	r := gin.Default()

	r.Use(cors.New(cors.Config{
		AllowOrigins: []string{
			"http://localhost:5173",
			"http://127.0.0.1:5173",
			//"https://你的管理端域名",
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

	calendarRepo := calendar.NewRepository(db)
	calendarHandler := calendar.NewHandler(calendarRepo)

	reminderRepo := reminder.NewRepository(db)
	reminderHandler := reminder.NewHandler(reminderRepo)

	notificationRepo := notification.NewRepository(db)
	notificationHandler := notification.NewHandler(notificationRepo)

	todoRepo := todo.NewRepository(db)
	todoHandler := todo.NewHandler(todoRepo)

	wechatMiniRepo := wechatmini.NewRepository(db)
	wechatMiniHandler := wechatmini.NewHandler(cfg, wechatMiniRepo)

	mobileRepo := mobile.NewRepository(db)
	mobileHandler := mobile.NewHandler(mobileRepo)

	inviteRepo := invite.NewRepository(db)
	inviteHandler := invite.NewHandler(inviteRepo)

	subscriptionRepo := subscription.NewRepository(db)
	subscriptionHandler := subscription.NewHandler(subscriptionRepo)

	wechatMiniService := wechat.NewMiniService(
		cfg.WechatMiniAppID,
		cfg.WechatMiniAppSecret,
	)

	subscriptionService := subscription.NewService(
		cfg,
		subscriptionRepo,
		wechatMiniService,
	)

	recordRepo := record.NewRepository(db)
	recordHandler := record.NewHandler(recordRepo, subscriptionService)

	api := r.Group("/api")
	{
		api.POST("/auth/register", authHandler.Register)
		api.POST("/auth/login", authHandler.Login)

		api.POST("/wechat/mini/login", wechatMiniHandler.Login)

		api.GET("/invites/:code", inviteHandler.Detail)

		authGroup := api.Group("")
		authGroup.Use(middleware.JWTAuthMiddleware(cfg.JWTSecret))
		{
			authGroup.POST("/invites/:code/accept", inviteHandler.Accept)
			authGroup.POST("/wechat/mini/subscriptions", subscriptionHandler.Record)

			authGroup.GET("/users/me", userHandler.Me)

			authGroup.GET("/calendars", calendarHandler.ListMine)
			authGroup.POST("/calendars", calendarHandler.Create)
			authGroup.GET("/calendars/:calendar_id", calendarHandler.Detail)
			authGroup.PUT("/calendars/:calendar_id", calendarHandler.Update)
			authGroup.DELETE("/calendars/:calendar_id", calendarHandler.Delete)
			authGroup.GET("/calendars/:calendar_id/events", calendarHandler.ListEvents)
			authGroup.POST("/calendars/:calendar_id/events/special", calendarHandler.CreateSpecialEvent)
			authGroup.GET("/calendars/:calendar_id/stats/monthly", calendarHandler.MonthlyStats)
			authGroup.GET("/calendars/:calendar_id/stats/member-workload", calendarHandler.MemberWorkloadStats)

			authGroup.GET("/calendars/:calendar_id/members", calendarHandler.ListMembers)
			authGroup.POST("/calendars/:calendar_id/members", calendarHandler.AddMember)
			authGroup.PUT("/calendars/:calendar_id/members/:user_id/role", calendarHandler.UpdateMemberRole)
			authGroup.DELETE("/calendars/:calendar_id/members/:user_id", calendarHandler.RemoveMember)

			authGroup.PUT("/calendar-events/:event_id/time", calendarHandler.UpdateEventTime)
			authGroup.DELETE("/calendar-events/:event_id", calendarHandler.DeleteEvent)

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
			authGroup.GET("/records/:id/reminders", reminderHandler.ListByRecord)
			authGroup.GET("/reminders/today", reminderHandler.ListToday)
			authGroup.GET("/reminders/upcoming", reminderHandler.ListUpcoming)

			authGroup.GET("/notifications", notificationHandler.List)
			authGroup.PUT("/notifications/:id/read", notificationHandler.MarkAsRead)
			authGroup.DELETE("/notifications/:id", notificationHandler.Delete)

			authGroup.GET("/todos/today", todoHandler.Today)

			authGroup.GET("/mobile/home", mobileHandler.Home)
		}
	}

	return r
}
