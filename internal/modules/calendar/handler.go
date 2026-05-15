package calendar

import (
	"errors"
	"net/http"
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

type addMemberRequest struct {
	Account string `json:"account"`
	Role    string `json:"role"`
}

type updateEventTimeRequest struct {
	StartAt string  `json:"start_at"`
	EndAt   *string `json:"end_at"`
	AllDay  bool    `json:"all_day"`
}

type createSpecialEventRequest struct {
	Date string `json:"date"`
	Type string `json:"type"`
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

func (h *Handler) AddMember(c *gin.Context) {
	operatorID, ok := currentUserID(c)
	if !ok {
		return
	}

	calendarID, ok := parseCalendarID(c)
	if !ok {
		return
	}

	var req addMemberRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request")
		return
	}

	account := strings.TrimSpace(req.Account)
	if account == "" {
		response.BadRequest(c, "account required")
		return
	}

	req.Role = strings.ToLower(strings.TrimSpace(req.Role))
	if req.Role == "" {
		req.Role = RoleMember
	}

	if req.Role != RoleMember && req.Role != RoleViewer {
		response.Fail(c, http.StatusBadRequest, response.CodeInvalidRole, "invalid role")
		return
	}

	member, err := h.repo.AddMemberByAccount(c.Request.Context(), operatorID, calendarID, account, req.Role)
	if err != nil {
		handleRepoError(c, err, "add member failed")
		return
	}

	response.OK(c, member)
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

func (h *Handler) ListEvents(c *gin.Context) {
	userID, ok := currentUserID(c)
	if !ok {
		return
	}

	calendarID, ok := parseCalendarID(c)
	if !ok {
		return
	}

	startAt, endAt, ok := parseDateRange(c)
	if !ok {
		return
	}

	filters, ok := parseEventFilters(c)
	if !ok {
		return
	}

	items, err := h.repo.ListCalendarEvents(c.Request.Context(), userID, calendarID, startAt, endAt, filters)
	if err != nil {
		handleRepoError(c, err, "query calendar events failed")
		return
	}

	response.OK(c, gin.H{"items": items})
}

func (h *Handler) CreateSpecialEvent(c *gin.Context) {
	userID, ok := currentUserID(c)
	if !ok {
		return
	}

	calendarID, ok := parseCalendarID(c)
	if !ok {
		return
	}

	var req createSpecialEventRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request")
		return
	}

	eventType := strings.ToLower(strings.TrimSpace(req.Type))
	if eventType != "rest" && eventType != "blocked" && eventType != "full" {
		response.BadRequest(c, "invalid special event type")
		return
	}

	date, err := time.ParseInLocation(time.DateOnly, strings.TrimSpace(req.Date), shanghaiLocation())
	if err != nil {
		response.BadRequest(c, "invalid date format, use YYYY-MM-DD")
		return
	}

	item, err := h.repo.CreateSpecialEvent(c.Request.Context(), userID, calendarID, CreateSpecialEventParams{Date: date, EventType: eventType})
	if err != nil {
		handleRepoError(c, err, "create special event failed")
		return
	}

	response.OK(c, item)
}

func (h *Handler) MonthlyStats(c *gin.Context) {
	userID, ok := currentUserID(c)
	if !ok {
		return
	}
	calendarID, ok := parseCalendarID(c)
	if !ok {
		return
	}
	month, startAt, endAt, ok := parseMonth(c)
	if !ok {
		return
	}
	stats, err := h.repo.MonthlyStats(c.Request.Context(), userID, calendarID, month, startAt, endAt)
	if err != nil {
		handleRepoError(c, err, "query monthly stats failed")
		return
	}
	response.OK(c, stats)
}

func (h *Handler) MemberWorkloadStats(c *gin.Context) {
	userID, ok := currentUserID(c)
	if !ok {
		return
	}
	calendarID, ok := parseCalendarID(c)
	if !ok {
		return
	}
	month, startAt, endAt, ok := parseMonth(c)
	if !ok {
		return
	}
	stats, err := h.repo.MemberWorkloadStats(c.Request.Context(), userID, calendarID, month, startAt, endAt)
	if err != nil {
		handleRepoError(c, err, "query member workload failed")
		return
	}
	response.OK(c, stats)
}

func (h *Handler) UpdateEventTime(c *gin.Context) {
	userID, ok := currentUserID(c)
	if !ok {
		return
	}

	eventID, ok := parseEventID(c)
	if !ok {
		return
	}

	var req updateEventTimeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request")
		return
	}

	params, ok := buildEventTimeParams(c, req)
	if !ok {
		return
	}

	if err := h.repo.UpdateCalendarEventTime(c.Request.Context(), userID, eventID, params); err != nil {
		handleRepoError(c, err, "update calendar event failed")
		return
	}

	response.OK(c, gin.H{"event_id": eventID, "updated": true})
}

func (h *Handler) DeleteEvent(c *gin.Context) {
	userID, ok := currentUserID(c)
	if !ok {
		return
	}

	eventID, ok := parseEventID(c)
	if !ok {
		return
	}

	if err := h.repo.DeleteCalendarEvent(c.Request.Context(), userID, eventID); err != nil {
		handleRepoError(c, err, "delete calendar event failed")
		return
	}

	response.OK(c, gin.H{"event_id": eventID, "deleted": true})
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

func parseEventID(c *gin.Context) (int64, bool) {
	eventID, err := strconv.ParseInt(c.Param("event_id"), 10, 64)
	if err != nil || eventID <= 0 {
		response.BadRequest(c, "invalid event id")
		return 0, false
	}
	return eventID, true
}

func parseEventFilters(c *gin.Context) (CalendarEventFilters, bool) {
	filters := CalendarEventFilters{
		Status:    strings.ToLower(strings.TrimSpace(c.Query("status"))),
		EventType: strings.ToLower(strings.TrimSpace(c.Query("event_type"))),
	}
	if text := strings.TrimSpace(c.Query("assignee_id")); text != "" {
		id, err := strconv.ParseInt(text, 10, 64)
		if err != nil || id <= 0 {
			response.BadRequest(c, "invalid assignee_id")
			return CalendarEventFilters{}, false
		}
		filters.AssigneeID = &id
	}
	return filters, true
}

func parseMonth(c *gin.Context) (string, time.Time, time.Time, bool) {
	month := strings.TrimSpace(c.Query("month"))
	if month == "" {
		month = time.Now().In(shanghaiLocation()).Format("2006-01")
	}
	startAt, err := time.ParseInLocation("2006-01", month, shanghaiLocation())
	if err != nil {
		response.BadRequest(c, "invalid month format, use YYYY-MM")
		return "", time.Time{}, time.Time{}, false
	}
	return month, startAt, startAt.AddDate(0, 1, 0), true
}

func shanghaiLocation() *time.Location {
	loc, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		return time.FixedZone("Asia/Shanghai", 8*60*60)
	}
	return loc
}

func parseDateRange(c *gin.Context) (time.Time, time.Time, bool) {
	startText := strings.TrimSpace(c.Query("start"))
	endText := strings.TrimSpace(c.Query("end"))
	if startText == "" || endText == "" {
		response.BadRequest(c, "start and end required")
		return time.Time{}, time.Time{}, false
	}

	loc, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		loc = time.FixedZone("Asia/Shanghai", 8*60*60)
	}
	startAt, err := time.ParseInLocation(time.DateOnly, startText, loc)
	if err != nil {
		response.BadRequest(c, "invalid start format, use YYYY-MM-DD")
		return time.Time{}, time.Time{}, false
	}
	endAt, err := time.ParseInLocation(time.DateOnly, endText, loc)
	if err != nil {
		response.BadRequest(c, "invalid end format, use YYYY-MM-DD")
		return time.Time{}, time.Time{}, false
	}
	if !endAt.After(startAt) {
		response.BadRequest(c, "end must be after start")
		return time.Time{}, time.Time{}, false
	}
	return startAt, endAt, true
}

func buildEventTimeParams(c *gin.Context, req updateEventTimeRequest) (CalendarEventTimeParams, bool) {
	startText := strings.TrimSpace(req.StartAt)
	if startText == "" {
		response.BadRequest(c, "start_at required")
		return CalendarEventTimeParams{}, false
	}
	startAt, err := time.Parse(time.RFC3339, startText)
	if err != nil {
		response.BadRequest(c, "invalid start_at format, use RFC3339")
		return CalendarEventTimeParams{}, false
	}

	var endAt *time.Time
	if req.EndAt != nil && strings.TrimSpace(*req.EndAt) != "" {
		parsed, err := time.Parse(time.RFC3339, strings.TrimSpace(*req.EndAt))
		if err != nil {
			response.BadRequest(c, "invalid end_at format, use RFC3339")
			return CalendarEventTimeParams{}, false
		}
		if parsed.Before(startAt) {
			response.BadRequest(c, "end_at must not be before start_at")
			return CalendarEventTimeParams{}, false
		}
		endAt = &parsed
	}

	return CalendarEventTimeParams{
		StartAt: startAt,
		EndAt:   endAt,
		AllDay:  req.AllDay,
	}, true
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
		response.NotFound(c, "用户不存在或日历不存在")
	case errors.Is(err, ErrNoPermission):
		response.Forbidden(c, "no permission")
	case errors.Is(err, ErrCannotManageOwner):
		response.Fail(c, http.StatusBadRequest, response.CodeCannotRemoveOwner, "cannot manage owner")
	case errors.Is(err, ErrMemberExists):
		response.Fail(c, http.StatusBadRequest, response.CodeCannotChangeOwnerRole, "成员已存在")
	default:
		response.Internal(c, fallback)
	}
}
