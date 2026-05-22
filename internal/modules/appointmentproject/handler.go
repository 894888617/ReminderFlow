package appointmentproject

import (
	"errors"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"reminder-flow/internal/middleware"
	"reminder-flow/pkg/response"
)

type Handler struct{ db *pgxpool.Pool }
func NewHandler(db *pgxpool.Pool) *Handler { return &Handler{db: db} }
func (h *Handler) ensure(c *gin.Context, cid, uid int64) bool { var cnt int; err := h.db.QueryRow(c.Request.Context(), `SELECT COUNT(*) FROM calendar_members WHERE calendar_id=$1 AND user_id=$2 AND status='active'`, cid, uid).Scan(&cnt); return err == nil && cnt > 0 }

func (h *Handler) List(c *gin.Context) {
	uid, _ := middleware.GetCurrentUserID(c); cid, _ := strconv.ParseInt(c.Param("calendar_id"), 10, 64)
	if !h.ensure(c, cid, uid) { response.Forbidden(c, "no permission"); return }
	kw := "%" + strings.TrimSpace(c.Query("keyword")) + "%"
	rows, err := h.db.Query(c.Request.Context(), `SELECT id,calendar_id,name,usage_count,last_used_at FROM appointment_projects WHERE calendar_id=$1 AND deleted_at IS NULL AND ($2='%%' OR name ILIKE $2) ORDER BY last_used_at DESC NULLS LAST, usage_count DESC, created_at DESC`, cid, kw)
	if err != nil { response.Internal(c, "query projects failed"); return }
	defer rows.Close(); out := make([]gin.H, 0)
	for rows.Next() { var id,cid2 int64; var name string; var usage int; var t *string; if err:=rows.Scan(&id,&cid2,&name,&usage,&t); err==nil { out=append(out,gin.H{"id":id,"calendar_id":cid2,"name":name,"usage_count":usage,"last_used_at":t}) } }
	response.OK(c, out)
}

func (h *Handler) Create(c *gin.Context) {
	uid,_:=middleware.GetCurrentUserID(c); cid,_:=strconv.ParseInt(c.Param("calendar_id"),10,64); if !h.ensure(c,cid,uid){response.Forbidden(c,"no permission");return}
	var req struct{Name string `json:"name"`}; if c.ShouldBindJSON(&req)!=nil{response.BadRequest(c,"invalid request");return}
	name:=strings.TrimSpace(req.Name); if name=="" {response.BadRequest(c,"name required");return}
	var id int64
	err:=h.db.QueryRow(c.Request.Context(), `INSERT INTO appointment_projects(calendar_id,name,created_by,usage_count,last_used_at) VALUES($1,$2,$3,1,NOW()) ON CONFLICT (calendar_id,name) WHERE deleted_at IS NULL DO UPDATE SET updated_at=NOW() RETURNING id`, cid,name,uid).Scan(&id)
	if err!=nil { var pgErr *pgconn.PgError; if errors.As(err,&pgErr)&&pgErr.Code=="23505" {response.BadRequest(c,"该服务项目已存在"); return}; response.Internal(c,"create project failed");return }
	response.OK(c, gin.H{"id":id,"calendar_id":cid,"name":name})
}
func (h *Handler) Update(c *gin.Context) {
	uid,_:=middleware.GetCurrentUserID(c); id,_:=strconv.ParseInt(c.Param("id"),10,64)
	var cid int64; if err:=h.db.QueryRow(c.Request.Context(),`SELECT calendar_id FROM appointment_projects WHERE id=$1 AND deleted_at IS NULL`,id).Scan(&cid); err!=nil { if errors.Is(err,pgx.ErrNoRows){response.NotFound(c,"project not found");return}; response.Internal(c,"query project failed");return }
	if !h.ensure(c,cid,uid){response.Forbidden(c,"no permission");return}
	var req struct{Name string `json:"name"`}; if c.ShouldBindJSON(&req)!=nil{response.BadRequest(c,"invalid request");return}
	name:=strings.TrimSpace(req.Name); if name=="" {response.BadRequest(c,"name required");return}
	_,err:=h.db.Exec(c.Request.Context(),`UPDATE appointment_projects SET name=$2,updated_at=NOW() WHERE id=$1 AND deleted_at IS NULL`,id,name)
	if err!=nil { var pgErr *pgconn.PgError; if errors.As(err,&pgErr)&&pgErr.Code=="23505" {response.BadRequest(c,"该服务项目已存在"); return}; response.Internal(c,"update project failed");return }
	response.OK(c, gin.H{"id":id,"calendar_id":cid,"name":name})
}
func (h *Handler) Delete(c *gin.Context) { uid,_:=middleware.GetCurrentUserID(c); id,_:=strconv.ParseInt(c.Param("id"),10,64); var cid int64; if err:=h.db.QueryRow(c.Request.Context(),`SELECT calendar_id FROM appointment_projects WHERE id=$1 AND deleted_at IS NULL`,id).Scan(&cid); err!=nil {response.NotFound(c,"project not found");return}; if !h.ensure(c,cid,uid){response.Forbidden(c,"no permission");return}; _,err:=h.db.Exec(c.Request.Context(), `UPDATE appointment_projects SET deleted_at=NOW(),updated_at=NOW() WHERE id=$1 AND deleted_at IS NULL`, id); if err != nil { response.Internal(c, "delete project failed"); return }; response.OK(c, gin.H{"deleted": true}) }
