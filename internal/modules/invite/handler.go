package invite

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
	return &Handler{repo: repo}
}

type CreateInviteRequest struct {
	Role        string `json:"role"`
	ExpireHours int    `json:"expire_hours"`
	MaxUseCount *int   `json:"max_use_count"`
}

type CreateInviteResponse struct {
	InviteCode string           `json:"invite_code"`
	Path       string           `json:"path"`
	Invite     *WorkspaceInvite `json:"invite"`
}

type AcceptInviteResponse struct {
	WorkspaceID   int64  `json:"workspace_id"`
	WorkspaceName string `json:"workspace_name"`
	Role          string `json:"role"`
	Message       string `json:"message"`
}

func (h *Handler) Create(c *gin.Context) {
	currentUserID, ok := middleware.GetCurrentUserID(c)
	if !ok {
		response.Unauthorized(c, "unauthorized")
		return
	}

	workspaceID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || workspaceID <= 0 {
		response.BadRequest(c, "invalid workspace id")
		return
	}

	var req CreateInviteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request")
		return
	}

	req.Role = strings.TrimSpace(req.Role)
	if req.Role == "" {
		req.Role = "member"
	}

	if req.Role != "member" && req.Role != "viewer" {
		response.BadRequest(c, "invalid role")
		return
	}

	currentRole, err := h.repo.GetWorkspaceMemberRole(c.Request.Context(), workspaceID, currentUserID)
	if err != nil || currentRole != "owner" {
		response.Forbidden(c, "only owner can create invite")
		return
	}

	var expireAt *time.Time
	if req.ExpireHours > 0 {
		t := time.Now().Add(time.Duration(req.ExpireHours) * time.Hour)
		expireAt = &t
	}

	invite, err := h.repo.CreateInvite(
		c.Request.Context(),
		workspaceID,
		currentUserID,
		req.Role,
		expireAt,
		req.MaxUseCount,
	)
	if err != nil {
		response.Internal(c, "create invite failed")
		return
	}

	response.OK(c, CreateInviteResponse{
		InviteCode: invite.InviteCode,
		Path:       "/pages/invite/index?code=" + invite.InviteCode,
		Invite:     invite,
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
		response.BadRequest(c, "invite not found")
		return
	}

	if invite.ExpireAt != nil && invite.ExpireAt.Before(time.Now()) {
		response.BadRequest(c, "invite expired")
		return
	}

	if invite.MaxUseCount != nil && invite.UsedCount >= *invite.MaxUseCount {
		response.BadRequest(c, "invite usage limit reached")
		return
	}

	response.OK(c, invite)
}

func (h *Handler) Accept(c *gin.Context) {
	currentUserID, ok := middleware.GetCurrentUserID(c)
	if !ok {
		response.Unauthorized(c, "unauthorized")
		return
	}

	code := strings.TrimSpace(c.Param("code"))
	if code == "" {
		response.BadRequest(c, "invite code required")
		return
	}

	invite, err := h.repo.GetInviteByCode(c.Request.Context(), code)
	if err != nil {
		response.BadRequest(c, "invite not found")
		return
	}

	if invite.ExpireAt != nil && invite.ExpireAt.Before(time.Now()) {
		response.BadRequest(c, "invite expired")
		return
	}

	if invite.MaxUseCount != nil && invite.UsedCount >= *invite.MaxUseCount {
		response.BadRequest(c, "invite usage limit reached")
		return
	}

	exists, err := h.repo.IsWorkspaceMember(c.Request.Context(), invite.WorkspaceID, currentUserID)
	if err != nil {
		response.Internal(c, "check member failed")
		return
	}

	if exists {
		currentRole, err := h.repo.GetWorkspaceMemberRole(c.Request.Context(), invite.WorkspaceID, currentUserID)
		if err != nil {
			response.Internal(c, "get member role failed")
			return
		}

		response.OK(c, AcceptInviteResponse{
			WorkspaceID:   invite.WorkspaceID,
			WorkspaceName: invite.WorkspaceName,
			Role:          currentRole,
			Message:       "already joined",
		})
		return
	}

	if err := h.repo.AcceptInvite(c.Request.Context(), invite, currentUserID); err != nil {
		response.Internal(c, "accept invite failed")
		return
	}

	response.OK(c, AcceptInviteResponse{
		WorkspaceID:   invite.WorkspaceID,
		WorkspaceName: invite.WorkspaceName,
		Role:          invite.Role,
		Message:       "joined",
	})
}
