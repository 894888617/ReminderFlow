package invite

import (
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"reminder-flow/internal/middleware"
	"reminder-flow/pkg/response"
)

const (
	RoleOwner  = "owner"
	RoleMember = "member"
	RoleViewer = "viewer"
)

var ErrInviteExpired = errors.New("invite expired")

type Handler struct {
	repo *Repository
}

func NewHandler(repo *Repository) *Handler {
	return &Handler{repo: repo}
}

type CreateInviteRequest struct {
	Role       string `json:"role"`
	ExpireDays int    `json:"expire_days"`
	MaxUses    int    `json:"max_uses"`
}

type CreateInviteResponse struct {
	Code         string    `json:"code"`
	CalendarID   int64     `json:"calendar_id"`
	CalendarName string    `json:"calendar_name"`
	Role         string    `json:"role"`
	ExpireAt     time.Time `json:"expire_at"`
	SharePath    string    `json:"share_path"`
}

type InviteDetailResponse struct {
	Code         string `json:"code"`
	CalendarID   int64  `json:"calendar_id"`
	CalendarName string `json:"calendar_name"`
	InviterName  string `json:"inviter_name"`
	Role         string `json:"role"`
	Expired      bool   `json:"expired"`
	Accepted     bool   `json:"accepted"`
}

type AcceptInviteResponse struct {
	CalendarID int64 `json:"calendar_id"`
}

func (h *Handler) Create(c *gin.Context) {
	currentUserID, ok := middleware.GetCurrentUserID(c)
	if !ok {
		response.Unauthorized(c, "未登录")
		return
	}

	calendarID, ok := parseCalendarID(c)
	if !ok {
		return
	}

	var req CreateInviteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request")
		return
	}

	req.Role = strings.ToLower(strings.TrimSpace(req.Role))
	if req.Role == "" {
		req.Role = RoleMember
	}
	if req.Role != RoleMember && req.Role != RoleViewer {
		response.BadRequest(c, "invalid role")
		return
	}
	if req.ExpireDays <= 0 {
		req.ExpireDays = 7
	}
	if req.MaxUses <= 0 {
		req.MaxUses = 1
	}

	currentRole, err := h.repo.GetCalendarMemberRole(c.Request.Context(), calendarID, currentUserID)
	if err != nil || (currentRole != RoleOwner && currentRole != RoleMember) {
		response.Forbidden(c, "无权限创建邀请")
		return
	}

	expireAt := time.Now().AddDate(0, 0, req.ExpireDays)
	invite, err := h.repo.CreateInvite(
		c.Request.Context(),
		calendarID,
		currentUserID,
		req.Role,
		expireAt,
		req.MaxUses,
	)
	if err != nil {
		response.Internal(c, "create invite failed")
		return
	}

	response.OK(c, CreateInviteResponse{
		Code:         invite.Code,
		CalendarID:   invite.CalendarID,
		CalendarName: invite.CalendarName,
		Role:         invite.Role,
		ExpireAt:     invite.ExpireAt,
		SharePath:    "/pages/invite-accept/index?code=" + invite.Code,
	})
}

func (h *Handler) Detail(c *gin.Context) {
	code := strings.TrimSpace(c.Param("code"))
	if code == "" {
		response.BadRequest(c, "invite code required")
		return
	}

	invite, err := h.repo.GetInviteByCode(c.Request.Context(), code)
	if err != nil {
		if IsNotFound(err) {
			response.NotFound(c, "邀请不存在")
			return
		}
		response.Internal(c, "get invite failed")
		return
	}

	response.OK(c, InviteDetailResponse{
		Code:         invite.Code,
		CalendarID:   invite.CalendarID,
		CalendarName: invite.CalendarName,
		InviterName:  invite.InviterName,
		Role:         invite.Role,
		Expired:      invite.ExpireAt.Before(time.Now()),
		Accepted:     invite.MaxUses > 0 && invite.UsedCount >= invite.MaxUses,
	})
}

func (h *Handler) Accept(c *gin.Context) {
	currentUserID, ok := middleware.GetCurrentUserID(c)
	if !ok {
		response.Unauthorized(c, "未登录")
		return
	}

	code := strings.TrimSpace(c.Param("code"))
	if code == "" {
		response.BadRequest(c, "invite code required")
		return
	}

	invite, err := h.repo.GetInviteByCode(c.Request.Context(), code)
	if err != nil {
		if IsNotFound(err) {
			response.NotFound(c, "邀请不存在")
			return
		}
		response.Internal(c, "get invite failed")
		return
	}

	if invite.ExpireAt.Before(time.Now()) {
		response.Fail(c, http.StatusGone, 41000, "邀请已过期")
		return
	}

	result, err := h.repo.AcceptInvite(c.Request.Context(), code, currentUserID)
	if err != nil {
		switch {
		case IsNotFound(err):
			response.NotFound(c, "邀请不存在")
		case errors.Is(err, ErrInviteExpired):
			response.Fail(c, http.StatusGone, 41000, "邀请已过期")
		case errors.Is(err, ErrInviteLimitReached):
			response.Fail(c, http.StatusConflict, 40900, "邀请次数已用完")
		default:
			response.Internal(c, "accept invite failed")
		}
		return
	}

	if !result.AlreadyJoined {
		if err := h.repo.CreateNotification(
			c.Request.Context(),
			result.CalendarID,
			currentUserID,
			"INVITE_ACCEPTED",
			"已加入日历",
			"你已加入日历："+result.CalendarName,
		); err != nil {
			log.Println("create invite accepted notification failed:", err)
		}

		if err := h.repo.CreateNotification(
			c.Request.Context(),
			invite.CalendarID,
			invite.InviterID,
			"INVITE_JOINED",
			"成员加入日历",
			"有新成员通过邀请加入日历："+invite.CalendarName,
		); err != nil {
			log.Println("create invite joined notification failed:", err)
		}
	}

	response.OK(c, AcceptInviteResponse{CalendarID: result.CalendarID})
}

func parseCalendarID(c *gin.Context) (int64, bool) {
	calendarID, err := strconv.ParseInt(c.Param("calendar_id"), 10, 64)
	if err != nil || calendarID <= 0 {
		response.BadRequest(c, "invalid calendar id")
		return 0, false
	}
	return calendarID, true
}
