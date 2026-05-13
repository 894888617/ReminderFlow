package calendar

import (
	"errors"
	"net/http"
	"strconv"
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

type calendarRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Color       string `json:"color"`
	Timezone    string `json:"timezone"`
	CoverURL    string `json:"cover_url"`
}

type updateMemberRoleRequest struct {
	Role string `json:"role"`
}

func (h *Handler) Create(c *gin.Context) {
	userID, ok := currentUserID(c)
	if !ok {
		return
	}

	var req calendarRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request")
		return
	}

	params, ok := buildCalendarParams(c, req)
	if !ok {
		return
	}

	cal, err := h.repo.CreateCalendar(c.Request.Context(), userID, params)
	if err != nil {
		response.Internal(c, "create calendar failed")
		return
	}

	response.OK(c, cal)
}

func (h *Handler) ListMine(c *gin.Context) {
	userID, ok := currentUserID(c)
	if !ok {
		return
	}

	items, err := h.repo.ListMyCalendars(c.Request.Context(), userID)
	if err != nil {
		response.Internal(c, "query calendars failed")
		return
	}

	response.OK(c, items)
}

func (h *Handler) Detail(c *gin.Context) {
	userID, ok := currentUserID(c)
	if !ok {
		return
	}

	calendarID, ok := parseCalendarID(c)
	if !ok {
		return
	}

	cal, err := h.repo.GetCalendarDetail(c.Request.Context(), userID, calendarID)
	if err != nil {
		handleRepoError(c, err, "calendar not found")
		return
	}

	response.OK(c, cal)
}

func (h *Handler) Update(c *gin.Context) {
	userID, ok := currentUserID(c)
	if !ok {
		return
	}

	calendarID, ok := parseCalendarID(c)
	if !ok {
		return
	}

	var req calendarRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request")
		return
	}

	params, ok := buildCalendarParams(c, req)
	if !ok {
		return
	}

	cal, err := h.repo.UpdateCalendar(c.Request.Context(), userID, calendarID, UpdateCalendarParams(params))
	if err != nil {
		handleRepoError(c, err, "update calendar failed")
		return
	}

	response.OK(c, cal)
}

func (h *Handler) Delete(c *gin.Context) {
	userID, ok := currentUserID(c)
	if !ok {
		return
	}

	calendarID, ok := parseCalendarID(c)
	if !ok {
		return
	}

	if err := h.repo.DeleteCalendar(c.Request.Context(), userID, calendarID); err != nil {
		handleRepoError(c, err, "delete calendar failed")
		return
	}

	response.OK(c, gin.H{"id": calendarID, "deleted": true})
}

func (h *Handler) ListMembers(c *gin.Context) {
	userID, ok := currentUserID(c)
	if !ok {
		return
	}

	calendarID, ok := parseCalendarID(c)
	if !ok {
		return
	}

	items, err := h.repo.ListCalendarMembers(c.Request.Context(), userID, calendarID)
	if err != nil {
		handleRepoError(c, err, "query members failed")
		return
	}

	response.OK(c, items)
}

func (h *Handler) UpdateMemberRole(c *gin.Context) {
	operatorID, ok := currentUserID(c)
	if !ok {
		return
	}

	calendarID, ok := parseCalendarID(c)
	if !ok {
		return
	}

	memberUserID, ok := parseUserID(c)
	if !ok {
		return
	}

	var req updateMemberRoleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request")
		return
	}

	req.Role = strings.ToLower(strings.TrimSpace(req.Role))
	if req.Role != RoleMember && req.Role != RoleViewer {
		response.Fail(c, http.StatusBadRequest, response.CodeInvalidRole, "invalid role")
		return
	}

	if err := h.repo.UpdateMemberRole(c.Request.Context(), operatorID, calendarID, memberUserID, req.Role); err != nil {
		handleRepoError(c, err, "update member role failed")
		return
	}

	response.OK(c, gin.H{"calendar_id": calendarID, "user_id": memberUserID, "role": req.Role})
}

func (h *Handler) RemoveMember(c *gin.Context) {
	operatorID, ok := currentUserID(c)
	if !ok {
		return
	}

	calendarID, ok := parseCalendarID(c)
	if !ok {
		return
	}

	memberUserID, ok := parseUserID(c)
	if !ok {
		return
	}

	if err := h.repo.RemoveMember(c.Request.Context(), operatorID, calendarID, memberUserID); err != nil {
		handleRepoError(c, err, "remove member failed")
		return
	}

	response.OK(c, gin.H{"calendar_id": calendarID, "user_id": memberUserID, "removed": true})
}

func currentUserID(c *gin.Context) (int64, bool) {
	userID, ok := middleware.GetCurrentUserID(c)
	if !ok {
		response.Unauthorized(c, "unauthorized")
		return 0, false
	}
	return userID, true
}

func parseCalendarID(c *gin.Context) (int64, bool) {
	calendarID, err := strconv.ParseInt(c.Param("calendar_id"), 10, 64)
	if err != nil || calendarID <= 0 {
		response.BadRequest(c, "invalid calendar id")
		return 0, false
	}
	return calendarID, true
}

func parseUserID(c *gin.Context) (int64, bool) {
	userID, err := strconv.ParseInt(c.Param("user_id"), 10, 64)
	if err != nil || userID <= 0 {
		response.BadRequest(c, "invalid user id")
		return 0, false
	}
	return userID, true
}

func buildCalendarParams(c *gin.Context, req calendarRequest) (CreateCalendarParams, bool) {
	params := CreateCalendarParams{
		Name:        strings.TrimSpace(req.Name),
		Description: strings.TrimSpace(req.Description),
		Color:       strings.TrimSpace(req.Color),
		Timezone:    strings.TrimSpace(req.Timezone),
		CoverURL:    strings.TrimSpace(req.CoverURL),
	}

	if params.Name == "" {
		response.BadRequest(c, "calendar name required")
		return params, false
	}
	if len(params.Name) > 128 {
		response.BadRequest(c, "calendar name too long")
		return params, false
	}
	if len(params.Color) > 32 {
		response.BadRequest(c, "calendar color too long")
		return params, false
	}
	if len(params.Timezone) > 64 {
		response.BadRequest(c, "calendar timezone too long")
		return params, false
	}

	return params, true
}

func handleRepoError(c *gin.Context, err error, fallback string) {
	switch {
	case IsNotFound(err):
		response.NotFound(c, "calendar not found or no permission")
	case errors.Is(err, ErrNoPermission):
		response.Forbidden(c, "no permission")
	case errors.Is(err, ErrCannotManageOwner):
		response.Fail(c, http.StatusBadRequest, response.CodeCannotRemoveOwner, "cannot manage owner")
	default:
		response.Internal(c, fallback)
	}
}
