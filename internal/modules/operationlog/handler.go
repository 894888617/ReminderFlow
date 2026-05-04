package operationlog

import (
	"strconv"

	"github.com/gin-gonic/gin"

	"reminder-flow/pkg/response"
)

type RecordPermissionChecker interface {
	FindByID(ctx interface{}, id int64) (any, error)
}

type Handler struct {
	repo *Repository
}

func NewHandler(repo *Repository) *Handler {
	return &Handler{repo: repo}
}

func (h *Handler) ListByRecord(c *gin.Context) {
	recordID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || recordID <= 0 {
		response.BadRequest(c, "invalid record id")
		return
	}

	list, err := h.repo.ListByRecordID(c.Request.Context(), recordID)
	if err != nil {
		response.Internal(c, "query operation logs failed")
		return
	}

	response.OK(c, list)
}
