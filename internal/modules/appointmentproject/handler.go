package appointmentproject

import (
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"reminder-flow/internal/middleware"
	"reminder-flow/pkg/response"
	"strconv"
	"strings"
)

type Handler struct{ db *pgxpool.Pool }

func NewHandler(db *pgxpool.Pool) *Handler { return &Handler{db: db} }
func (h *Handler) ensure(c *gin.Context, cid, uid int64) bool {
	var cnt int
	err := h.db.QueryRow(c.Request.Context(), `SELECT COUNT(*) FROM calendar_members WHERE calendar_id=$1 AND user_id=$2 AND status='active'`, cid, uid).Scan(&cnt)
	return err == nil && cnt > 0
}
func (h *Handler) List(c *gin.Context) {
	uid, _ := middleware.GetCurrentUserID(c)
	cid, _ := strconv.ParseInt(c.Param("calendar_id"), 10, 64)
	if !h.ensure(c, cid, uid) {
		response.Forbidden(c, "no permission")
		return
	}
	kw := "%" + strings.TrimSpace(c.Query("keyword")) + "%"
	rows, err := h.db.Query(c.Request.Context(), `SELECT id,calendar_id,name,usage_count,last_used_at FROM appointment_projects WHERE calendar_id=$1 AND deleted_at IS NULL AND ($2='%%' OR name ILIKE $2) ORDER BY usage_count DESC,updated_at DESC`, cid, kw)
	if err != nil {
		response.Internal(c, "query projects failed")
		return
	}
	defer rows.Close()
	type item struct {
		ID         int64   `json:"id"`
		CalendarID int64   `json:"calendar_id"`
		Name       string  `json:"name"`
		UsageCount int     `json:"usage_count"`
		LastUsedAt *string `json:"last_used_at"`
	}
	var out []item
	for rows.Next() {
		var it item
		var t *string
		if err := rows.Scan(&it.ID, &it.CalendarID, &it.Name, &it.UsageCount, &t); err == nil {
			it.LastUsedAt = t
			out = append(out, it)
		}
	}
	response.OK(c, out)
}
func (h *Handler) Create(c *gin.Context) {
	uid, _ := middleware.GetCurrentUserID(c)
	cid, _ := strconv.ParseInt(c.Param("calendar_id"), 10, 64)
	if !h.ensure(c, cid, uid) {
		response.Forbidden(c, "no permission")
		return
	}
	var req struct {
		Name string `json:"name"`
	}
	if c.ShouldBindJSON(&req) != nil {
		response.BadRequest(c, "invalid request")
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		response.BadRequest(c, "name required")
		return
	}
	_, err := h.db.Exec(c.Request.Context(), `INSERT INTO appointment_projects(calendar_id,name,created_by,usage_count,last_used_at) VALUES($1,$2,$3,1,NOW()) ON CONFLICT DO NOTHING`, cid, name, uid)
	if err != nil {
		response.Internal(c, "create project failed")
		return
	}
	response.OK(c, gin.H{"name": name})
}
func (h *Handler) Update(c *gin.Context) { response.OK(c, gin.H{"todo": true}) }
func (h *Handler) Delete(c *gin.Context) {
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	_, err := h.db.Exec(c.Request.Context(), `UPDATE appointment_projects SET deleted_at=NOW(),updated_at=NOW() WHERE id=$1`, id)
	if err != nil {
		response.Internal(c, "delete project failed")
		return
	}
	response.OK(c, gin.H{"deleted": true})
}
