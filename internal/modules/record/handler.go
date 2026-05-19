package record

import (
	"errors"
	"fmt"
	"log"
	"reminder-flow/internal/modules/subscription"
	"reminder-flow/internal/permission"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"

	"reminder-flow/internal/middleware"
	"reminder-flow/pkg/response"
)

type errMeta interface {
	SQLState() string
}

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
	WorkspaceID       int64   `json:"workspace_id"`
	CalendarID        int64   `json:"calendar_id"`
	Title             string  `json:"title"`
	Content           string  `json:"content"`
	AssigneeID        *int64  `json:"assignee_id"`
	DueAt             string  `json:"due_at"`
	RemindAt          string  `json:"remind_at"`
	CalendarStartAt   string  `json:"calendar_start_at"`
	CalendarEndAt     *string `json:"calendar_end_at"`
	CalendarAllDay    *bool   `json:"calendar_all_day"`
	AppointmentStatus string  `json:"appointment_status"`
	CustomerID        *int64  `json:"customer_id"`
	CustomerName      string  `json:"customer_name"`
	CustomerPhone     string  `json:"customer_phone"`
	CustomerRemark    string  `json:"customer_remark"`
	SaveToLibrary     *bool   `json:"save_customer_to_library"`
	ProjectID         *int64  `json:"project_id"`
	ProjectName       string  `json:"project_name"`
	SaveToCustomer    *bool   `json:"save_to_customer"`
	ServiceName       string  `json:"service_name"`
	StartTime         string  `json:"start_time"`
	EndTime           string  `json:"end_time"`
	Status            string  `json:"status"`
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

	calendarID := req.CalendarID
	if calendarID <= 0 {
		calendarID = req.WorkspaceID
	}
	if calendarID <= 0 {
		response.BadRequest(c, "calendar_id required")
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

	currentRole, err := h.repo.GetCalendarMemberRole(c.Request.Context(), calendarID, currentUserID)
	if err != nil {
		response.Forbidden(c, "no permission")
		return
	}

	if !permission.CanWriteRecord(currentRole) {
		response.Forbidden(c, "no write permission")
		return
	}

	if req.AssigneeID != nil {
		isMember, err := h.repo.IsCalendarMember(c.Request.Context(), calendarID, *req.AssigneeID)
		if err != nil {
			response.Internal(c, "check assignee failed")
			return
		}

		if !isMember {
			response.BadRequest(c, "assignee is not calendar member")
			return
		}
	}

	dueAt := parseOptionalRFC3339Lenient(req.DueAt)

	remindAt, ok := parseOptionalRFC3339(c, req.RemindAt, "remind_at")
	if !ok {
		return
	}

	calendarStartAt := parseOptionalRFC3339Lenient(req.CalendarStartAt)
	if calendarStartAt == nil {
		calendarStartAt = dueAt
	}

	var calendarEndAt *time.Time
	if req.CalendarEndAt != nil {
		calendarEndAt = parseOptionalRFC3339Lenient(*req.CalendarEndAt)
	}
	if calendarStartAt != nil && calendarEndAt != nil && calendarEndAt.Before(*calendarStartAt) {
		calendarEndAt = nil
	}

	calendarAllDay := true
	if req.CalendarAllDay != nil {
		calendarAllDay = *req.CalendarAllDay
	}

	requestSaveToCustomer := (req.SaveToCustomer != nil && *req.SaveToCustomer) || (req.SaveToLibrary != nil && *req.SaveToLibrary)
	if req.CustomerID != nil {
		requestSaveToCustomer = false
	}

	if req.CustomerID == nil && requestSaveToCustomer {
		phone := strings.TrimSpace(req.CustomerPhone)
		if phone != "" {
			existing, findErr := h.repo.FindCustomerByPhone(c.Request.Context(), calendarID, phone)
			if findErr == nil && existing != nil {
				c.JSON(409, gin.H{"code": "CUSTOMER_PHONE_EXISTS", "message": "该手机号客户已存在", "customer": gin.H{"id": existing.ID, "name": existing.Name, "phone": existing.Phone, "remark": existing.Remark}})
				return
			}
		}
		createdCustomer, createCustomerErr := h.repo.CreateCustomer(c.Request.Context(), calendarID, req.CustomerName, req.CustomerPhone, req.CustomerRemark, currentUserID)
		if createCustomerErr == nil && createdCustomer != nil {
			req.CustomerID = &createdCustomer.ID
			req.CustomerName = createdCustomer.Name
			req.CustomerPhone = createdCustomer.Phone
			req.CustomerRemark = createdCustomer.Remark
		} else if createCustomerErr != nil {
			log.Printf("[record.create] create customer failed: calendar_id=%d user_id=%d err=%v", calendarID, currentUserID, createCustomerErr)
		}
	}

	rec, err := h.repo.Create(c.Request.Context(), CreateRecordParams{
		WorkspaceID:       0,
		CalendarID:        calendarID,
		Title:             req.Title,
		Content:           req.Content,
		CreatorID:         currentUserID,
		AssigneeID:        req.AssigneeID,
		DueAt:             dueAt,
		CalendarStartAt:   calendarStartAt,
		CalendarEndAt:     calendarEndAt,
		CalendarAllDay:    calendarAllDay,
		RemindAt:          remindAt,
		AppointmentStatus: strings.ToLower(NormalizeRecordStatus(req.AppointmentStatus)),
		CustomerID:        req.CustomerID,
		CustomerName:      req.CustomerName,
		CustomerPhone:     req.CustomerPhone,
		CustomerRemark:    req.CustomerRemark,
		ProjectID:         req.ProjectID,
		ProjectName:       strings.TrimSpace(firstNonEmpty(req.ProjectName, req.ServiceName)),
		ServiceName:       strings.TrimSpace(firstNonEmpty(req.ServiceName, req.ProjectName)),
	})

	if err != nil {
		if errors.Is(err, ErrScheduleConflict) {
			c.JSON(409, gin.H{"code": "SCHEDULE_CONFLICT", "message": "该负责人该时间段已有安排", "msg": "该负责人该时间段已有安排"})
			return
		}
		log.Printf("[create record failed] message=%v stack=%+v body=%+v user_id=%d calendar_id=%d sqlCode=%v detail=%v constraint=%v", err, err, req, currentUserID, calendarID, extractErrCode(err), extractErrDetail(err), extractErrConstraint(err))
		response.Internal(c, "create_record_failed")
		return
	}

	recordID := rec.ID
	userID := currentUserID

	_ = h.repo.CreateOperationLog(c.Request.Context(), CreateOperationLogParams{
		CalendarID: rec.CalendarID,
		RecordID:   &recordID,
		UserID:     &userID,
		Action:     "CREATE_RECORD",
		Detail:     "创建记录：" + rec.Title,
	})

	if err := h.repo.CreateNotification(
		c.Request.Context(),
		currentUserID,
		rec.ID,
		"RECORD_CREATED",
		"记录已创建",
		"你创建了记录："+rec.Title,
	); err != nil {
		log.Println("create record notification failed:", err)
	}

	if rec.AssigneeID != nil && *rec.AssigneeID != currentUserID {
		if err := h.repo.CreateNotification(
			c.Request.Context(),
			*rec.AssigneeID,
			rec.ID,
			"RECORD_ASSIGNED",
			"新的待办记录",
			"你被分配了记录："+rec.Title,
		); err != nil {
			log.Println("create assignee notification failed:", err)
		}
	}

	response.OK(c, rec)
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

func extractErrCode(err error) string {
	var e errMeta
	if errors.As(err, &e) {
		return e.SQLState()
	}
	return ""
}
func extractErrDetail(err error) string     { return "" }
func extractErrConstraint(err error) string { return "" }

func (h *Handler) List(c *gin.Context) {
	currentUserID, ok := middleware.GetCurrentUserID(c)
	if !ok {
		response.Unauthorized(c, "unauthorized")
		return
	}

	calendarID, ok := parseCalendarID(c)
	if !ok {
		return
	}

	currentRole, err := h.repo.GetCalendarMemberRole(c.Request.Context(), calendarID, currentUserID)
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

		isMember, err := h.repo.IsCalendarMember(c.Request.Context(), calendarID, id)
		if err != nil {
			response.Internal(c, "check assignee failed")
			return
		}

		if !isMember {
			response.BadRequest(c, "assignee is not calendar member")
			return
		}

		assigneeID = &id
	}

	keyword := strings.TrimSpace(c.Query("keyword"))
	if len(keyword) > 100 {
		response.BadRequest(c, "keyword too long")
		return
	}
	customerPhone := strings.TrimSpace(c.Query("customer_phone"))
	customerName := strings.TrimSpace(c.Query("customer_name"))
	if len(customerPhone) > 32 || len(customerName) > 128 {
		response.BadRequest(c, "customer query too long")
		return
	}

	startDate := strings.TrimSpace(c.Query("start_date"))
	endDate := strings.TrimSpace(c.Query("end_date"))

	result, err := h.repo.ListByCalendar(c.Request.Context(), ListRecordsParams{
		CalendarID:    calendarID,
		Page:          page,
		PageSize:      pageSize,
		Status:        status,
		AssigneeID:    assigneeID,
		Keyword:       keyword,
		CustomerName:  customerName,
		CustomerPhone: customerPhone,
		StartDate:     startDate,
		EndDate:       endDate,
	})

	if err != nil {
		response.Internal(c, "query records failed")
		return
	}

	response.OK(c, result)
}

type UpdateRecordRequest struct {
	Title           string  `json:"title"`
	Content         string  `json:"content"`
	AssigneeID      *int64  `json:"assignee_id"`
	DueAt           string  `json:"due_at"`
	CalendarStartAt string  `json:"calendar_start_at"`
	CalendarEndAt   *string `json:"calendar_end_at"`
	CalendarAllDay  *bool   `json:"calendar_all_day"`
	CustomerID      *int64  `json:"customer_id"`
	CustomerName    string  `json:"customer_name"`
	CustomerPhone   string  `json:"customer_phone"`
	CustomerRemark  string  `json:"customer_remark"`
	ProjectID       *int64  `json:"project_id"`
	ProjectName     string  `json:"project_name"`
	ServiceName     string  `json:"service_name"`
}

type UpdateStatusRequest struct {
	Status string `json:"status"`
}

func parseCalendarID(c *gin.Context) (int64, bool) {
	value := strings.TrimSpace(c.Param("calendar_id"))
	if value == "" {
		value = strings.TrimSpace(c.Query("calendar_id"))
	}
	if value == "" {
		value = strings.TrimSpace(c.Query("workspace_id"))
	}

	calendarID, err := strconv.ParseInt(value, 10, 64)
	if err != nil || calendarID <= 0 {
		response.BadRequest(c, "invalid calendar id")
		return 0, false
	}

	return calendarID, true
}

func parseOptionalRFC3339(c *gin.Context, value string, field string) (*time.Time, bool) {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil, true
	}

	parsed, err := time.Parse(time.RFC3339, value)
	if err != nil {
		response.BadRequest(c, "invalid "+field+" format, use RFC3339")
		return nil, false
	}

	return &parsed, true
}

func parseOptionalRFC3339Lenient(value string) *time.Time {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}

	parsed, err := time.Parse(time.RFC3339, value)
	if err != nil {
		return nil
	}

	return &parsed
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
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(c, "record not found")
			return
		}
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

	currentRole, err := h.repo.GetCalendarMemberRole(c.Request.Context(), oldRec.CalendarID, currentUserID)
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
	req.CustomerName = strings.TrimSpace(req.CustomerName)
	req.CustomerPhone = strings.TrimSpace(req.CustomerPhone)
	req.ServiceName = strings.TrimSpace(req.ServiceName)
	if req.CustomerName == "" && req.CustomerPhone == "" && req.ServiceName == "" {
		req.CustomerName = oldRec.CustomerName
		req.CustomerPhone = oldRec.CustomerPhone
		req.ServiceName = oldRec.ServiceName
	}

	if req.Title == "" {
		response.BadRequest(c, "title required")
		return
	}

	if len(req.Title) > 200 {
		response.BadRequest(c, "title too long")
		return
	}

	if req.AssigneeID != nil {
		isMember, err := h.repo.IsCalendarMember(c.Request.Context(), oldRec.CalendarID, *req.AssigneeID)
		if err != nil {
			response.Internal(c, "check assignee failed")
			return
		}

		if !isMember {
			response.BadRequest(c, "assignee is not calendar member")
			return
		}
	}

	dueAt := parseOptionalRFC3339Lenient(req.DueAt)

	calendarStartAt := parseOptionalRFC3339Lenient(req.CalendarStartAt)
	updateCalendarAt := req.CalendarAllDay != nil || strings.TrimSpace(req.CalendarStartAt) != "" || req.CalendarEndAt != nil
	if calendarStartAt == nil && dueAt != nil {
		calendarStartAt = dueAt
		updateCalendarAt = true
	}

	var calendarEndAt *time.Time
	if req.CalendarEndAt != nil {
		calendarEndAt = parseOptionalRFC3339Lenient(*req.CalendarEndAt)
	}
	if calendarStartAt != nil && calendarEndAt != nil && calendarEndAt.Before(*calendarStartAt) {
		calendarEndAt = nil
	}

	calendarAllDay := false
	if req.CalendarAllDay != nil {
		calendarAllDay = *req.CalendarAllDay
	}

	rec, err := h.repo.Update(c.Request.Context(), UpdateRecordParams{
		ID:               recordID,
		CalendarID:       oldRec.CalendarID,
		UpdatedBy:        currentUserID,
		Title:            req.Title,
		Content:          req.Content,
		AssigneeID:       req.AssigneeID,
		DueAt:            dueAt,
		CalendarStartAt:  calendarStartAt,
		CalendarEndAt:    calendarEndAt,
		CalendarAllDay:   calendarAllDay,
		Status:           oldRec.Status,
		UpdateCalendarAt: updateCalendarAt,
		CustomerID:       req.CustomerID,
		CustomerName:     req.CustomerName,
		CustomerPhone:    req.CustomerPhone,
		CustomerRemark:   req.CustomerRemark,
		ProjectID:        req.ProjectID,
		ProjectName:      req.ProjectName,
		ServiceName:      req.ServiceName,
	})

	if err != nil {
		if errors.Is(err, ErrScheduleConflict) {
			c.JSON(409, gin.H{"code": "SCHEDULE_CONFLICT", "message": "该负责人该时间段已有安排", "msg": "该负责人该时间段已有安排"})
			return
		}
		response.Internal(c, "update record failed")
		return
	}

	recordID = rec.ID
	userID := currentUserID

	_ = h.repo.CreateOperationLog(c.Request.Context(), CreateOperationLogParams{
		CalendarID: rec.CalendarID,
		RecordID:   &recordID,
		UserID:     &userID,
		Action:     "UPDATE_RECORD",
		Detail:     "更新记录：" + rec.Title,
	})

	if req.AssigneeID != nil && *req.AssigneeID != currentUserID && (oldRec.AssigneeID == nil || *oldRec.AssigneeID != *req.AssigneeID) {
		if err := h.repo.CreateNotification(
			c.Request.Context(),
			*req.AssigneeID,
			rec.ID,
			"ASSIGNEE_CHANGED",
			"负责人已变更",
			"你被设置为记录负责人："+rec.Title,
		); err != nil {
			log.Println("create update assignee notification failed:", err)
		}
	}

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

	currentRole, err := h.repo.GetCalendarMemberRole(c.Request.Context(), rec.CalendarID, currentUserID)
	if err != nil {
		response.Forbidden(c, "no permission")
		return
	}

	if currentRole != "owner" {
		response.Forbidden(c, "only calendar owner can delete record")
		return
	}

	recordIDValue := rec.ID
	userID := currentUserID

	_ = h.repo.CreateOperationLog(c.Request.Context(), CreateOperationLogParams{
		CalendarID: rec.CalendarID,
		RecordID:   &recordIDValue,
		UserID:     &userID,
		Action:     "DELETE_RECORD",
		Detail:     "删除记录：" + rec.Title,
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

	currentRole, err := h.repo.GetCalendarMemberRole(c.Request.Context(), oldRec.CalendarID, currentUserID)
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

	req.Status = NormalizeRecordStatus(req.Status)

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
		CalendarID: rec.CalendarID,
		RecordID:   &recordID,
		UserID:     &userID,
		Action:     "UPDATE_STATUS",
		Detail:     "更新状态为：" + rec.Status,
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

	_, err = h.repo.GetCalendarMemberRole(c.Request.Context(), rec.CalendarID, currentUserID)
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

	currentRole, err := h.repo.GetCalendarMemberRole(c.Request.Context(), oldRec.CalendarID, currentUserID)
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

	isMember, err := h.repo.IsCalendarMember(c.Request.Context(), oldRec.CalendarID, req.AssigneeID)
	if err != nil {
		response.Internal(c, "check assignee failed")
		return
	}

	if !isMember {
		response.BadRequest(c, "assignee is not calendar member")
		return
	}

	if _, err := h.repo.UpdateAssignee(c.Request.Context(), recordID, req.AssigneeID); err != nil {
		response.Internal(c, "update assignee failed")
		return
	}

	if err := h.repo.CreateNotification(
		c.Request.Context(),
		req.AssigneeID,
		recordID,
		"ASSIGNEE_CHANGED",
		"负责人已变更",
		"你被设置为记录负责人："+oldRec.Title,
	); err != nil {
		log.Println("create assignee changed notification failed:", err)
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
				CalendarName: recordInfo.CalendarName,
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
