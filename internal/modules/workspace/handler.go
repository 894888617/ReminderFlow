package workspace

import (
	"net/http"
	"reminder-flow/internal/permission"
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
	return &Handler{
		repo: repo,
	}
}

type CreateWorkspaceRequest struct {
	Name string `json:"name"`
}

func (h *Handler) Create(c *gin.Context) {
	userID, ok := middleware.GetCurrentUserID(c)
	if !ok {
		response.Unauthorized(c, "unauthorized")
		return
	}

	var req CreateWorkspaceRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request")
		return
	}

	req.Name = strings.TrimSpace(req.Name)

	if req.Name == "" {
		response.BadRequest(c, "workspace name required")
		return
	}

	if len(req.Name) > 128 {
		response.BadRequest(c, "workspace name too long")
		return
	}

	w, err := h.repo.Create(c.Request.Context(), req.Name, userID)
	if err != nil {
		response.Internal(c, "create workspace failed")
		return
	}

	response.OK(c, w)
}

func (h *Handler) ListMine(c *gin.Context) {
	userID, ok := middleware.GetCurrentUserID(c)
	if !ok {
		response.Unauthorized(c, "unauthorized")
		return
	}

	list, err := h.repo.FindMyWorkspaces(c.Request.Context(), userID)
	if err != nil {
		response.Internal(c, "query workspaces failed")
		return
	}

	response.OK(c, list)
}

type AddMemberRequest struct {
	Keyword string `json:"keyword"`
	Role    string `json:"role"`
}

func isValidMemberRole(role string) bool {
	return role == "member" || role == "viewer"
}

func (h *Handler) AddMember(c *gin.Context) {
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

	currentRole, err := h.repo.GetMemberRole(c.Request.Context(), workspaceID, currentUserID)
	if err != nil {
		response.Forbidden(c, "no permission")
		return
	}

	if !permission.CanManageMembers(currentRole) {
		response.Forbidden(c, "only owner can remove member")
		return
	}

	var req AddMemberRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request")
		return
	}

	req.Keyword = strings.TrimSpace(req.Keyword)
	req.Role = strings.TrimSpace(req.Role)

	if req.Keyword == "" {
		response.BadRequest(c, "keyword required")
		return
	}

	if req.Role == "" {
		req.Role = "member"
	}

	if !isValidMemberRole(req.Role) {
		response.BadRequest(c, "invalid role")
		return
	}

	targetUserID, err := h.repo.FindUserByUsernameOrEmail(c.Request.Context(), req.Keyword)
	if err != nil {
		response.NotFound(c, "user not found")
		return
	}

	exists, err := h.repo.ExistsMember(c.Request.Context(), workspaceID, targetUserID)
	if err != nil {
		response.Internal(c, "check member failed")
		return
	}

	if exists {
		response.Fail(c, http.StatusBadRequest, response.CodeMemberExists, "user already in workspace")
		return
	}

	err = h.repo.AddMember(c.Request.Context(), workspaceID, targetUserID, req.Role)
	if err != nil {
		response.Internal(c, "add member failed")
		return
	}

	response.OK(c, gin.H{
		"workspace_id": workspaceID,
		"user_id":      targetUserID,
		"role":         req.Role,
	})
}

func (h *Handler) ListMembers(c *gin.Context) {
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

	_, err = h.repo.GetMemberRole(c.Request.Context(), workspaceID, currentUserID)
	if err != nil {
		response.Forbidden(c, "no permission")
		return
	}

	list, err := h.repo.ListMembers(c.Request.Context(), workspaceID)
	if err != nil {
		response.Internal(c, "query members failed")
		return
	}

	response.OK(c, list)
}

func parseWorkspaceID(c *gin.Context) (int64, bool) {
	workspaceID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || workspaceID <= 0 {
		response.BadRequest(c, "invalid workspace id")
		return 0, false
	}

	return workspaceID, true
}

func (h *Handler) RemoveMember(c *gin.Context) {
	currentUserID, ok := middleware.GetCurrentUserID(c)
	if !ok {
		response.Unauthorized(c, "unauthorized")
		return
	}

	workspaceID, ok := parseWorkspaceID(c)
	if !ok {
		return
	}

	targetUserID, err := strconv.ParseInt(c.Param("user_id"), 10, 64)
	if err != nil || targetUserID <= 0 {
		response.BadRequest(c, "invalid user id")
		return
	}

	currentRole, err := h.repo.GetMemberRole(c.Request.Context(), workspaceID, currentUserID)
	if err != nil {
		response.Forbidden(c, "no permission")
		return
	}

	if !permission.CanManageMembers(currentRole) {
		response.Forbidden(c, "only owner can remove member")
		return
	}

	targetRole, err := h.repo.GetTargetMemberRole(c.Request.Context(), workspaceID, targetUserID)
	if err != nil {
		response.NotFound(c, "member not found")
		return
	}

	if targetRole == "owner" {
		response.Fail(c, http.StatusBadRequest, response.CodeCannotRemoveOwner, "cannot remove owner")
		return
	}

	if targetUserID == currentUserID {
		response.BadRequest(c, "cannot remove yourself")
		return
	}

	unfinishedCount, err := h.repo.CountUnfinishedRecordsByAssignee(c.Request.Context(), workspaceID, targetUserID)
	if err != nil {
		response.Internal(c, "check unfinished records failed")
		return
	}

	if unfinishedCount > 0 {
		response.BadRequest(c, "member has unfinished records, please transfer or complete them first")
		return
	}

	if err := h.repo.RemoveMember(c.Request.Context(), workspaceID, targetUserID); err != nil {
		response.Internal(c, "remove member failed")
		return
	}

	response.OK(c, gin.H{
		"workspace_id": workspaceID,
		"user_id":      targetUserID,
		"removed":      true,
	})
}

type UpdateMemberRoleRequest struct {
	Role string `json:"role"`
}

func (h *Handler) UpdateMemberRole(c *gin.Context) {
	currentUserID, ok := middleware.GetCurrentUserID(c)
	if !ok {
		response.Unauthorized(c, "unauthorized")
		return
	}

	workspaceID, ok := parseWorkspaceID(c)
	if !ok {
		return
	}

	targetUserID, err := strconv.ParseInt(c.Param("user_id"), 10, 64)
	if err != nil || targetUserID <= 0 {
		response.BadRequest(c, "invalid user id")
		return
	}

	currentRole, err := h.repo.GetMemberRole(c.Request.Context(), workspaceID, currentUserID)
	if err != nil {
		response.Forbidden(c, "no permission")
		return
	}

	if currentRole != "owner" {
		response.Forbidden(c, "only owner can update member role")
		return
	}

	targetRole, err := h.repo.GetTargetMemberRole(c.Request.Context(), workspaceID, targetUserID)
	if err != nil {
		response.NotFound(c, "member not found")
		return
	}

	if targetRole == "owner" {
		response.BadRequest(c, "cannot change owner role")
		return
	}

	if targetUserID == currentUserID {
		response.BadRequest(c, "cannot change your own role")
		return
	}

	var req UpdateMemberRoleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request")
		return
	}

	req.Role = strings.ToLower(strings.TrimSpace(req.Role))

	if req.Role != "member" && req.Role != "viewer" {
		response.Fail(c, http.StatusBadRequest, response.CodeInvalidRole, "invalid role")
		return
	}

	if err := h.repo.UpdateMemberRole(c.Request.Context(), workspaceID, targetUserID, req.Role); err != nil {
		response.Internal(c, "update member role failed")
		return
	}

	response.OK(c, gin.H{
		"workspace_id": workspaceID,
		"user_id":      targetUserID,
		"role":         req.Role,
	})
}

func (h *Handler) Delete(c *gin.Context) {
	currentUserID, ok := middleware.GetCurrentUserID(c)
	if !ok {
		response.Unauthorized(c, "unauthorized")
		return
	}

	workspaceID, ok := parseWorkspaceID(c)
	if !ok {
		return
	}

	currentRole, err := h.repo.GetMemberRole(c.Request.Context(), workspaceID, currentUserID)
	if err != nil {
		response.Forbidden(c, "no permission")
		return
	}

	if currentRole != "owner" {
		response.Forbidden(c, "only owner can delete workspace")
		return
	}

	if err := h.repo.Delete(c.Request.Context(), workspaceID); err != nil {
		response.Internal(c, "delete workspace failed")
		return
	}

	response.OK(c, gin.H{
		"id":      workspaceID,
		"deleted": true,
	})
}
