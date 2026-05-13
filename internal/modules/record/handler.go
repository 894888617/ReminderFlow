package record

import (
	"fmt"
	"log"
	"reminder-flow/internal/modules/subscription"
	"reminder-flow/internal/permission"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"reminder-flow/internal/middleware"
	"reminder-flow/pkg/response"
)

type Handler struct {
	repo                *Repository
	subscriptionService *subscription.Service
}

func NewHandler(
	repo *Repository,
	subscriptionService *subscription.Service,
) *Handler {
	return &Handler{
		repo:                repo,
		subscriptionService: subscriptionService,
	}
}

type CreateRecordRequest struct {
	WorkspaceID     int64   `json:"workspace_id"`
	CalendarID      int64   `json:"calendar_id"`
	Title           string  `json:"title"`
	Content         string  `json:"content"`
	AssigneeID      *int64  `json:"assignee_id"`
	DueAt           string  `json:"due_at"`
	CalendarStartAt string  `json:"calendar_start_at"`
	CalendarEndAt   *string `json:"calendar_end_at"`
	CalendarAllDay  *bool   `json:"calendar_all_day"`
}

func (h *Handler) Create(c *gin.Context) {
	currentUserID, ok := middleware.GetCurrentUserID(c)
	if !ok {
		response.Unauthorized(c, "unauthorized")
		return
	}

	var req CreateRecordRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request")
		return
	}

	req.Title = strings.TrimSpace(req.Title)
	req.Content = strings.TrimSpace(req.Content)

	if req.WorkspaceID <= 0 {
		response.BadRequest(c, "workspace_id required")
		return
	}

	if req.Title == "" {
		response.BadRequest(c, "title required")
		return
	}

	if len(req.Title) > 200 {
		response.BadRequest(c, "title too long")
		return
	}

	currentRole, err := h.repo.GetWorkspaceMemberRole(c.Request.Context(), req.WorkspaceID, currentUserID)
	if err != nil {
		response.Forbidden(c, "no permission")
		return
	}

	if !permission.CanWriteRecord(currentRole) {
		response.Forbidden(c, "no write permission")
		return
	}

	if req.AssigneeID != nil {
		isMember, err := h.repo.IsWorkspaceMember(c.Request.Context(), req.WorkspaceID, *req.AssigneeID)
		if err != nil {
			response.Internal(c, "check assignee failed")
			return
		}

		if !isMember {
			response.BadRequest(c, "assignee is not workspace member")
			return
		}
	}

	var dueAt *time.Time

	if strings.TrimSpace(req.DueAt) != "" {
		parsed, err := time.Parse(time.RFC3339, req.DueAt)
		if err != nil {
			response.BadRequest(c, "invalid due_at format, use RFC3339")
			return
		}

		dueAt = &parsed
	}

	var calendarStartAt *time.Time
	if strings.TrimSpace(req.CalendarStartAt) != "" {
		parsed, err := time.Parse(time.RFC3339, req.CalendarStartAt)
		if err != nil {
			response.BadRequest(c, "invalid calendar_start_at format, use RFC3339")
			return
		}
		calendarStartAt = &parsed
	}

	var calendarEndAt *time.Time
	if req.CalendarEndAt != nil && strings.TrimSpace(*req.CalendarEndAt) != "" {
		parsed, err := time.Parse(time.RFC3339, strings.TrimSpace(*req.CalendarEndAt))
		if err != nil {
			response.BadRequest(c, "invalid calendar_end_at format, use RFC3339")
			return
		}
		if calendarStartAt != nil && parsed.Before(*calendarStartAt) {
			response.BadRequest(c, "calendar_end_at must not be before calendar_start_at")
			return
		}
		calendarEndAt = &parsed
	}

	calendarID := req.CalendarID
	if calendarID <= 0 {
		calendarID = req.WorkspaceID
	}
	calendarAllDay := true
	if req.CalendarAllDay != nil {
		calendarAllDay = *req.CalendarAllDay
	}

	rec, err := h.repo.Create(c.Request.Context(), CreateRecordParams{
		WorkspaceID:     req.WorkspaceID,
		CalendarID:      calendarID,
		Title:           req.Title,
		Content:         req.Content,
		CreatorID:       currentUserID,
		AssigneeID:      req.AssigneeID,
		DueAt:           dueAt,
		CalendarStartAt: calendarStartAt,
		CalendarEndAt:   calendarEndAt,
		CalendarAllDay:  calendarAllDay,
	})

	if err != nil {
		response.Internal(c, "create record failed")
		return
	}

	recordID := rec.ID
	userID := currentUserID

	_ = h.repo.CreateOperationLog(c.Request.Context(), CreateOperationLogParams{
		WorkspaceID: rec.WorkspaceID,
		RecordID:    &recordID,
		UserID:      &userID,
		Action:      "CREATE_RECORD",
		Detail:      "创建记录：" + rec.Title,
	})

	response.OK(c, rec)
}

func (h *Handler) List(c *gin.Context) {
	currentUserID, ok := middleware.GetCurrentUserID(c)
	if !ok {
		response.Unauthorized(c, "unauthorized")
		return
	}

	workspaceID, err := strconv.ParseInt(c.Query("workspace_id"), 10, 64)
	if err != nil || workspaceID <= 0 {
		response.BadRequest(c, "workspace_id required")
		return
	}

	currentRole, err := h.repo.GetWorkspaceMemberRole(c.Request.Context(), workspaceID, currentUserID)
	if err != nil {
		response.Forbidden(c, "no permission")
		return
	}

	if currentRole == "" {
		response.Forbidden(c, "no permission")
		return
	}

	page := parsePositiveInt(c.Query("page"), 1)
	pageSize := parsePositiveInt(c.Query("page_size"), 10)

	if pageSize > 100 {
		pageSize = 100
	}

	status := strings.ToUpper(strings.TrimSpace(c.Query("status")))
	if status != "" && !IsValidStatus(status) {
		response.BadRequest(c, "invalid status")
		return
	}

	var assigneeID *int64
	if strings.TrimSpace(c.Query("assignee_id")) != "" {
		id, err := strconv.ParseInt(c.Query("assignee_id"), 10, 64)
		if err != nil || id <= 0 {
			response.BadRequest(c, "invalid assignee_id")
			return
		}

		isMember, err := h.repo.IsWorkspaceMember(c.Request.Context(), workspaceID, id)
		if err != nil {
			response.Internal(c, "check assignee failed")
			return
		}

		if !isMember {
			response.BadRequest(c, "assignee is not workspace member")
			return
		}

		assigneeID = &id
	}

	keyword := strings.TrimSpace(c.Query("keyword"))
	if len(keyword) > 100 {
		response.BadRequest(c, "keyword too long")
		return
	}

	result, err := h.repo.ListByWorkspace(c.Request.Context(), ListRecordsParams{
		WorkspaceID: workspaceID,
		Page:        page,
		PageSize:    pageSize,
		Status:      status,
		AssigneeID:  assigneeID,
		Keyword:     keyword,
	})

	if err != nil {
		response.Internal(c, "query records failed")
		return
	}

	response.OK(c, result)
}

type UpdateRecordRequest struct {
	Title      string `json:"title"`
	Content    string `json:"content"`
	AssigneeID *int64 `json:"assignee_id"`
	DueAt      string `json:"due_at"`
}

type UpdateStatusRequest struct {
	Status string `json:"status"`
}

func parseRecordID(c *gin.Context) (int64, bool) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		response.BadRequest(c, "invalid record id")
		return 0, false
	}

	return id, true
}

func (h *Handler) Detail(c *gin.Context) {
	currentUserID, ok := middleware.GetCurrentUserID(c)
	if !ok {
		response.Unauthorized(c, "unauthorized")
		return
	}

	recordID, ok := parseRecordID(c)
	if !ok {
		return
	}

	record, err := h.repo.GetDetailWithRole(c.Request.Context(), recordID, currentUserID)
	if err != nil {
		response.Internal(c, "get record detail failed")
		return
	}

	if record.CurrentUserRole == "" {
		response.Forbidden(c, "no permission to view record")
		return
	}

	response.OK(c, record)
}

func (h *Handler) Update(c *gin.Context) {
	currentUserID, ok := middleware.GetCurrentUserID(c)
	if !ok {
		response.Unauthorized(c, "unauthorized")
		return
	}

	recordID, ok := parseRecordID(c)
	if !ok {
		return
	}

	oldRec, err := h.repo.FindByID(c.Request.Context(), recordID)
	if err != nil {
		response.NotFound(c, "record not found")
		return
	}

	currentRole, err := h.repo.GetWorkspaceMemberRole(c.Request.Context(), oldRec.WorkspaceID, currentUserID)
	if err != nil {
		response.Forbidden(c, "no permission")
		return
	}

	if !permission.CanWriteRecord(currentRole) {
		response.Forbidden(c, "no write permission")
		return
	}

	var req UpdateRecordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request")
		return
	}

	req.Title = strings.TrimSpace(req.Title)
	req.Content = strings.TrimSpace(req.Content)

	if req.Title == "" {
		response.BadRequest(c, "title required")
		return
	}

	if len(req.Title) > 200 {
		response.BadRequest(c, "title too long")
		return
	}

	if req.AssigneeID != nil {
		isMember, err := h.repo.IsWorkspaceMember(c.Request.Context(), oldRec.WorkspaceID, *req.AssigneeID)
		if err != nil {
			response.Internal(c, "check assignee failed")
			return
		}

		if !isMember {
			response.BadRequest(c, "assignee is not workspace member")
			return
		}
	}

	var dueAt *time.Time
	if strings.TrimSpace(req.DueAt) != "" {
		parsed, err := time.Parse(time.RFC3339, req.DueAt)
		if err != nil {
			response.BadRequest(c, "invalid due_at format, use RFC3339")
			return
		}
		dueAt = &parsed
	}

	rec, err := h.repo.Update(c.Request.Context(), UpdateRecordParams{
		ID:         recordID,
		Title:      req.Title,
		Content:    req.Content,
		AssigneeID: req.AssigneeID,
		DueAt:      dueAt,
	})

	if err != nil {
		response.Internal(c, "update record failed")
		return
	}

	recordID = rec.ID
	userID := currentUserID

	_ = h.repo.CreateOperationLog(c.Request.Context(), CreateOperationLogParams{
		WorkspaceID: rec.WorkspaceID,
		RecordID:    &recordID,
		UserID:      &userID,
		Action:      "UPDATE_RECORD",
		Detail:      "更新记录：" + rec.Title,
	})

	response.OK(c, rec)
}

func (h *Handler) Delete(c *gin.Context) {
	currentUserID, ok := middleware.GetCurrentUserID(c)
	if !ok {
		response.Unauthorized(c, "unauthorized")
		return
	}

	recordID, ok := parseRecordID(c)
	if !ok {
		return
	}

	rec, err := h.repo.FindByID(c.Request.Context(), recordID)
	if err != nil {
		response.NotFound(c, "record not found")
		return
	}

	currentRole, err := h.repo.GetWorkspaceMemberRole(c.Request.Context(), rec.WorkspaceID, currentUserID)
	if err != nil {
		response.Forbidden(c, "no permission")
		return
	}

	if currentRole != "owner" && rec.CreatorID != currentUserID {
		response.Forbidden(c, "only owner or creator can delete record")
		return
	}

	recordIDValue := rec.ID
	userID := currentUserID

	_ = h.repo.CreateOperationLog(c.Request.Context(), CreateOperationLogParams{
		WorkspaceID: rec.WorkspaceID,
		RecordID:    &recordIDValue,
		UserID:      &userID,
		Action:      "DELETE_RECORD",
		Detail:      "删除记录：" + rec.Title,
	})

	if err := h.repo.Delete(c.Request.Context(), recordID); err != nil {
		fmt.Println("delete record error:", err)
		response.Internal(c, "delete record failed")
		return
	}

	response.OK(c, gin.H{
		"deleted": true,
		"id":      recordID,
	})
}

func (h *Handler) UpdateStatus(c *gin.Context) {
	currentUserID, ok := middleware.GetCurrentUserID(c)
	if !ok {
		response.Unauthorized(c, "unauthorized")
		return
	}

	recordID, ok := parseRecordID(c)
	if !ok {
		return
	}

	oldRec, err := h.repo.FindByID(c.Request.Context(), recordID)
	if err != nil {
		response.NotFound(c, "record not found")
		return
	}

	currentRole, err := h.repo.GetWorkspaceMemberRole(c.Request.Context(), oldRec.WorkspaceID, currentUserID)
	if err != nil {
		response.Forbidden(c, "no permission")
		return
	}

	if !permission.CanWriteRecord(currentRole) {
		response.Forbidden(c, "no write permission")
		return
	}

	var req UpdateStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request")
		return
	}

	req.Status = strings.ToUpper(strings.TrimSpace(req.Status))

	if !IsValidStatus(req.Status) {
		response.BadRequest(c, "invalid status")
		return
	}

	rec, err := h.repo.UpdateStatus(c.Request.Context(), recordID, req.Status)
	if err != nil {
		response.Internal(c, "update status failed")
		return
	}

	recordID = rec.ID
	userID := currentUserID

	_ = h.repo.CreateOperationLog(c.Request.Context(), CreateOperationLogParams{
		WorkspaceID: rec.WorkspaceID,
		RecordID:    &recordID,
		UserID:      &userID,
		Action:      "UPDATE_STATUS",
		Detail:      "更新状态为：" + rec.Status,
	})

	response.OK(c, rec)
}

func (h *Handler) ListOverdue(c *gin.Context) {
	currentUserID, ok := middleware.GetCurrentUserID(c)
	if !ok {
		response.Unauthorized(c, "unauthorized")
		return
	}

	list, err := h.repo.ListOverdue(c.Request.Context(), currentUserID)
	if err != nil {
		response.Internal(c, "query overdue records failed")
		return
	}

	response.OK(c, list)
}

func (h *Handler) ListOperationLogs(c *gin.Context) {
	currentUserID, ok := middleware.GetCurrentUserID(c)
	if !ok {
		response.Unauthorized(c, "unauthorized")
		return
	}

	recordID, ok := parseRecordID(c)
	if !ok {
		return
	}

	rec, err := h.repo.FindByID(c.Request.Context(), recordID)
	if err != nil {
		response.NotFound(c, "record not found")
		return
	}

	_, err = h.repo.GetWorkspaceMemberRole(c.Request.Context(), rec.WorkspaceID, currentUserID)
	if err != nil {
		response.Forbidden(c, "no permission")
		return
	}

	list, err := h.repo.ListOperationLogsByRecordID(c.Request.Context(), recordID)
	if err != nil {
		response.Internal(c, "query operation logs failed")
		return
	}

	response.OK(c, list)
}

type TransferAssigneeRequest struct {
	AssigneeID int64 `json:"assignee_id"`
}

func (h *Handler) TransferAssignee(c *gin.Context) {
	currentUserID, ok := middleware.GetCurrentUserID(c)
	if !ok {
		response.Unauthorized(c, "unauthorized")
		return
	}

	recordID, ok := parseRecordID(c)
	if !ok {
		return
	}

	oldRec, err := h.repo.FindByID(c.Request.Context(), recordID)
	if err != nil {
		response.NotFound(c, "record not found")
		return
	}

	currentRole, err := h.repo.GetWorkspaceMemberRole(c.Request.Context(), oldRec.WorkspaceID, currentUserID)
	if err != nil {
		response.Forbidden(c, "no permission")
		return
	}

	if currentRole == "viewer" {
		response.Forbidden(c, "viewer cannot transfer assignee")
		return
	}

	var req TransferAssigneeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request")
		return
	}

	if req.AssigneeID <= 0 {
		response.BadRequest(c, "assignee_id required")
		return
	}

	isMember, err := h.repo.IsWorkspaceMember(c.Request.Context(), oldRec.WorkspaceID, req.AssigneeID)
	if err != nil {
		response.Internal(c, "check assignee failed")
		return
	}

	if !isMember {
		response.BadRequest(c, "assignee is not workspace member")
		return
	}

	if _, err := h.repo.UpdateAssignee(c.Request.Context(), recordID, req.AssigneeID); err != nil {
		response.Internal(c, "update assignee failed")
		return
	}

	recordInfo, err := h.repo.GetBasicInfo(c.Request.Context(), recordID)
	if err != nil {
		log.Println("get record basic info failed:", err)
	} else if h.subscriptionService != nil && req.AssigneeID > 0 {
		operatorName := "系统"

		if usernameValue, exists := c.Get("username"); exists {
			if username, ok := usernameValue.(string); ok && username != "" {
				operatorName = username
			}
		}

		if err := h.subscriptionService.SendAssigneeChanged(
			c.Request.Context(),
			subscription.SendAssigneeChangedParams{
				UserID:       req.AssigneeID,
				RecordID:     recordID,
				RecordTitle:  recordInfo.Title,
				OperatorName: operatorName,
			},
		); err != nil {
			log.Println("send wechat assignee changed message failed:", err)
		}
	}

	response.OK(c, nil)
}

func parsePositiveInt(value string, defaultValue int) int {
	value = strings.TrimSpace(value)
	if value == "" {
		return defaultValue
	}

	n, err := strconv.Atoi(value)
	if err != nil || n <= 0 {
		return defaultValue
	}

	return n
}
