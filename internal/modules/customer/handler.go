package customer

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"reminder-flow/internal/middleware"
	"reminder-flow/pkg/response"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
)

type Handler struct{ repo *Repository }

func NewHandler(r *Repository) *Handler { return &Handler{repo: r} }
func (h *Handler) ensureMember(c *gin.Context, calendarID, userID int64) bool {
	var cnt int
	err := h.repo.db.QueryRow(c.Request.Context(), `SELECT COUNT(*) FROM calendar_members WHERE calendar_id=$1 AND user_id=$2 AND status='active'`, calendarID, userID).Scan(&cnt)
	return err == nil && cnt > 0
}

func (h *Handler) List(c *gin.Context) {
	uid, _ := middleware.GetCurrentUserID(c)
	cid, _ := strconv.ParseInt(c.Param("calendar_id"), 10, 64)
	if !h.ensureMember(c, cid, uid) {
		response.Forbidden(c, "no permission")
		return
	}
	items, err := h.repo.List(c.Request.Context(), cid, c.Query("keyword"))
	if err != nil {
		response.Internal(c, "query customers failed")
		return
	}
	response.OK(c, items)
}
func (h *Handler) Create(c *gin.Context) {
	uid, _ := middleware.GetCurrentUserID(c)
	cid, _ := strconv.ParseInt(c.Param("calendar_id"), 10, 64)
	if !h.ensureMember(c, cid, uid) {
		response.Forbidden(c, "no permission")
		return
	}
	var req Customer
	if c.ShouldBindJSON(&req) != nil || strings.TrimSpace(req.Name) == "" {
		response.BadRequest(c, "name required")
		return
	}
	if p := strings.TrimSpace(req.Phone); p != "" {
		if ex, _ := h.repo.FindByPhone(c.Request.Context(), cid, p, 0); ex != nil {
			c.JSON(http.StatusConflict, gin.H{"message": "手机号已存在"})
			return
		}
	}
	req.CalendarID = cid
	out, err := h.repo.Create(c.Request.Context(), req, uid)
	if err != nil {
		response.Internal(c, "create customer failed")
		return
	}
	response.OK(c, out)
}
func (h *Handler) Get(c *gin.Context) {
	uid, _ := middleware.GetCurrentUserID(c)
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	item, err := h.repo.Get(c.Request.Context(), id)
	if err != nil {
		response.NotFound(c, "customer not found")
		return
	}
	if !h.ensureMember(c, item.CalendarID, uid) {
		response.Forbidden(c, "no permission")
		return
	}
	response.OK(c, item)
}
func (h *Handler) Update(c *gin.Context) {
	uid, _ := middleware.GetCurrentUserID(c)
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	old, err := h.repo.Get(c.Request.Context(), id)
	if err != nil {
		response.NotFound(c, "customer not found")
		return
	}
	if !h.ensureMember(c, old.CalendarID, uid) {
		response.Forbidden(c, "no permission")
		return
	}
	var req Customer
	if c.ShouldBindJSON(&req) != nil || strings.TrimSpace(req.Name) == "" {
		response.BadRequest(c, "name required")
		return
	}
	if p := strings.TrimSpace(req.Phone); p != "" {
		if ex, err := h.repo.FindByPhone(c.Request.Context(), old.CalendarID, p, id); err == nil && ex != nil {
			c.JSON(http.StatusConflict, gin.H{"message": "手机号已存在"})
			return
		} else if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			response.Internal(c, "check phone failed")
			return
		}
	}
	out, err := h.repo.Update(c.Request.Context(), id, req)
	if err != nil {
		response.Internal(c, "update customer failed")
		return
	}
	response.OK(c, out)
}
func (h *Handler) Delete(c *gin.Context) {
	uid, _ := middleware.GetCurrentUserID(c)
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	old, err := h.repo.Get(c.Request.Context(), id)
	if err != nil {
		response.NotFound(c, "customer not found")
		return
	}
	if !h.ensureMember(c, old.CalendarID, uid) {
		response.Forbidden(c, "no permission")
		return
	}
	if err := h.repo.SoftDelete(c.Request.Context(), id); err != nil {
		response.Internal(c, "delete customer failed")
		return
	}
	response.OK(c, gin.H{"deleted": true})
}
