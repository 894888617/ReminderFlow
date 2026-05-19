package router

import (
	"reminder-flow/internal/modules/appointmentproject"
	"reminder-flow/internal/modules/calendar"
	"reminder-flow/internal/modules/customer"
	"reminder-flow/internal/modules/invite"
	"reminder-flow/internal/modules/mobile"
	"reminder-flow/internal/modules/notification"
	"reminder-flow/internal/modules/record"
	"reminder-flow/internal/modules/subscription"
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


	notificationRepo := notification.NewRepository(db)
	notificationHandler := notification.NewHandler(notificationRepo)


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
	customerHandler := customer.NewHandler(customer.NewRepository(db))
	projectHandler := appointmentproject.NewHandler(db)

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

			authGroup.GET("/calendars/:calendar_id/customers", customerHandler.List)
			authGroup.POST("/calendars/:calendar_id/customers", customerHandler.Create)
			authGroup.GET("/customers/:id", customerHandler.Get)
			authGroup.PUT("/customers/:id", customerHandler.Update)
			authGroup.DELETE("/customers/:id", customerHandler.Delete)

			authGroup.GET("/calendars/:calendar_id/appointment-projects", projectHandler.List)
			authGroup.POST("/calendars/:calendar_id/appointment-projects", projectHandler.Create)
			authGroup.PUT("/appointment-projects/:id", projectHandler.Update)
			authGroup.DELETE("/appointment-projects/:id", projectHandler.Delete)
			authGroup.POST("/records", recordHandler.Create)
			authGroup.GET("/records", recordHandler.List)

			authGroup.PUT("/records/:id/assignee", recordHandler.TransferAssignee)

			authGroup.GET("/records/:id", recordHandler.Detail)
			authGroup.PUT("/records/:id", recordHandler.Update)
			authGroup.DELETE("/records/:id", recordHandler.Delete)
			authGroup.PUT("/records/:id/status", recordHandler.UpdateStatus)

			authGroup.GET("/notifications", notificationHandler.List)
			authGroup.PUT("/notifications/:id/read", notificationHandler.MarkAsRead)
			authGroup.DELETE("/notifications/:id", notificationHandler.Delete)

			authGroup.GET("/mobile/home", mobileHandler.Home)
		}
	}

	return r
}
