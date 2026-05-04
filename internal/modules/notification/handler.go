package notification

import (
	"strconv"

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

func (h *Handler) List(c *gin.Context) {
	currentUserID, ok := middleware.GetCurrentUserID(c)
	if !ok {
		response.Unauthorized(c, "unauthorized")
		return
	}

	list, err := h.repo.ListByUser(c.Request.Context(), currentUserID)
	if err != nil {
		response.Internal(c, "query notifications failed")
		return
	}

	response.OK(c, list)
}

func (h *Handler) MarkAsRead(c *gin.Context) {
	currentUserID, ok := middleware.GetCurrentUserID(c)
	if !ok {
		response.Unauthorized(c, "unauthorized")
		return
	}

	notificationID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || notificationID <= 0 {
		response.BadRequest(c, "invalid notification id")
		return
	}

	if err := h.repo.MarkAsRead(c.Request.Context(), notificationID, currentUserID); err != nil {
		response.Internal(c, "mark notification read failed")
		return
	}

	response.OK(c, gin.H{
		"id":   notificationID,
		"read": true,
	})
}
