package user

import (
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

func (h *Handler) Me(c *gin.Context) {
	userID, ok := middleware.GetCurrentUserID(c)
	if !ok {
		response.Unauthorized(c, "unauthorized")
		return
	}

	u, err := h.repo.FindByID(c.Request.Context(), userID)
	if err != nil {
		response.NotFound(c, "user not found")
		return
	}

	response.OK(c, u)
}
