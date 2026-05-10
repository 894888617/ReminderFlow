package mobile

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

func (h *Handler) Home(c *gin.Context) {
	currentUserID, ok := middleware.GetCurrentUserID(c)
	if !ok {
		response.Unauthorized(c, "unauthorized")
		return
	}

	data, err := h.repo.GetHomeSummary(c.Request.Context(), currentUserID)
	if err != nil {
		response.Internal(c, "query mobile home failed")
		return
	}

	response.OK(c, data)
}
