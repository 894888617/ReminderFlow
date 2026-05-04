package reminder

import (
	"strconv"
	"strings"
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

type CreateReminderRequest struct {
	RemindAt   string `json:"remind_at"`
	RepeatType string `json:"repeat_type"`
}

func isValidRepeatType(repeatType string) bool {
	switch repeatType {
	case "NONE", "DAILY", "WEEKLY", "MONTHLY":
		return true
	default:
		return false
	}
}

func parseRecordID(c *gin.Context) (int64, bool) {
	recordID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || recordID <= 0 {
		response.BadRequest(c, "invalid record id")
		return 0, false
	}

	return recordID, true
}

func (h *Handler) Create(c *gin.Context) {
	currentUserID, ok := middleware.GetCurrentUserID(c)
	if !ok {
		response.Unauthorized(c, "unauthorized")
		return
	}

	recordID, ok := parseRecordID(c)
	if !ok {
		return
	}

	workspaceID, err := h.repo.GetRecordWorkspaceID(c.Request.Context(), recordID)
	if err != nil {
		response.Forbidden(c, "record not found")
		return
	}

	role, err := h.repo.GetWorkspaceMemberRole(c.Request.Context(), workspaceID, currentUserID)
	if err != nil {
		response.Forbidden(c, "no permission")
		return
	}

	if role == "viewer" {
		response.Forbidden(c, "viewer cannot create reminder")
		return
	}

	var req CreateReminderRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request")
		return
	}

	req.RemindAt = strings.TrimSpace(req.RemindAt)
	req.RepeatType = strings.ToUpper(strings.TrimSpace(req.RepeatType))

	if req.RemindAt == "" {
		response.BadRequest(c, "remind_at required")
		return
	}

	if req.RepeatType == "" {
		req.RepeatType = "NONE"
	}

	if !isValidRepeatType(req.RepeatType) {
		response.BadRequest(c, "invalid repeat_type")
		return
	}

	remindAt, err := time.Parse(time.RFC3339, req.RemindAt)
	if err != nil {
		response.BadRequest(c, "invalid remind_at format, use RFC3339")
		return
	}

	item, err := h.repo.Create(c.Request.Context(), CreateReminderParams{
		RecordID:   recordID,
		RemindAt:   remindAt,
		RepeatType: req.RepeatType,
	})

	if err != nil {
		response.Internal(c, "create reminder failed")
		return
	}

	response.OK(c, item)
}

func (h *Handler) ListToday(c *gin.Context) {
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

	list, err := h.repo.ListToday(c.Request.Context(), currentUserID, start, end)
	if err != nil {
		response.Internal(c, "query today reminders failed")
		return
	}

	response.OK(c, gin.H{
		"date":  start.Format("2006-01-02"),
		"items": list,
	})
}

func (h *Handler) ListUpcoming(c *gin.Context) {
	currentUserID, ok := middleware.GetCurrentUserID(c)
	if !ok {
		response.Unauthorized(c, "unauthorized")
		return
	}

	list, err := h.repo.ListUpcoming(c.Request.Context(), currentUserID, time.Now())
	if err != nil {
		response.Internal(c, "query upcoming reminders failed")
		return
	}

	response.OK(c, list)
}
