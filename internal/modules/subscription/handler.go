package subscription

import (
	"strings"

	"github.com/gin-gonic/gin"

	"reminder-flow/internal/middleware"
	"reminder-flow/pkg/response"
)

type Handler struct {
	repo *Repository
}

func NewHandler(repo *Repository) *Handler {
	return &Handler{repo: repo}
}

type RecordSubscriptionRequest struct {
	TemplateID string `json:"template_id"`
	Scene      string `json:"scene"`
	Accepted   bool   `json:"accepted"`
}

func (h *Handler) Record(c *gin.Context) {
	currentUserID, ok := middleware.GetCurrentUserID(c)
	if !ok {
		response.Unauthorized(c, "unauthorized")
		return
	}

	var req RecordSubscriptionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request")
		return
	}

	req.TemplateID = strings.TrimSpace(req.TemplateID)
	req.Scene = strings.TrimSpace(req.Scene)

	if req.TemplateID == "" {
		response.BadRequest(c, "template_id required")
		return
	}

	if req.Scene == "" {
		response.BadRequest(c, "scene required")
		return
	}

	item, err := h.repo.Upsert(c.Request.Context(), UpsertSubscriptionParams{
		UserID:     currentUserID,
		TemplateID: req.TemplateID,
		Scene:      req.Scene,
		Accepted:   req.Accepted,
	})
	if err != nil {
		response.Internal(c, "record subscription failed")
		return
	}

	response.OK(c, item)
}
