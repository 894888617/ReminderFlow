package todo

import (
	"time"

	"github.com/gin-gonic/gin"

	"reminder-flow/internal/middleware"
	"reminder-flow/pkg/response"
)

type Handler struct {
	repo *Repository
}

func NewHandler(repo *Repository) *Handler {
	return &Handler{
		repo: repo,
	}
}

func (h *Handler) Today(c *gin.Context) {
	currentUserID, ok := middleware.GetCurrentUserID(c)
	if !ok {
		response.Unauthorized(c, "unauthorized")
		return
	}

	now := time.Now()
	start := time.Date(
		now.Year(),
		now.Month(),
		now.Day(),
		0, 0, 0, 0,
		now.Location(),
	)
	end := start.AddDate(0, 0, 1)

	dueToday, err := h.repo.ListDueToday(c.Request.Context(), currentUserID, start, end)
	if err != nil {
		response.Internal(c, "query due today failed")
		return
	}

	remindersToday, err := h.repo.ListRemindersToday(c.Request.Context(), currentUserID, start, end)
	if err != nil {
		response.Internal(c, "query reminders today failed")
		return
	}

	unfinished, err := h.repo.ListUnfinished(c.Request.Context(), currentUserID)
	if err != nil {
		response.Internal(c, "query unfinished records failed")
		return
	}

	response.OK(c, gin.H{
		"date":            start.Format("2006-01-02"),
		"due_today":       dueToday,
		"reminders_today": remindersToday,
		"unfinished":      unfinished,
	})
}
