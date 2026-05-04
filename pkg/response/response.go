package response

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

const (
	CodeSuccess = 0

	CodeBadRequest   = 40000
	CodeUnauthorized = 40100
	CodeForbidden    = 40300
	CodeNotFound     = 40400

	CodeInternalError = 50000

	CodeUserExists      = 10001
	CodeUserNotFound    = 10002
	CodeInvalidPassword = 10003

	CodeWorkspaceNotFound     = 20001
	CodeNoWorkspaceRole       = 20002
	CodeInvalidRole           = 20003
	CodeMemberExists          = 20004
	CodeCannotRemoveOwner     = 20005
	CodeCannotChangeOwnerRole = 20006
	CodeMemberHasTasks        = 20007

	CodeRecordNotFound  = 30001
	CodeInvalidStatus   = 30002
	CodeInvalidAssignee = 30003
	CodeTransferFailed  = 30004
)

type Body struct {
	Code int    `json:"code"`
	Msg  string `json:"msg"`
	Data any    `json:"data,omitempty"`
}

func OK(c *gin.Context, data any) {
	c.JSON(http.StatusOK, Body{
		Code: CodeSuccess,
		Msg:  "success",
		Data: data,
	})
}

func Fail(c *gin.Context, httpStatus int, code int, msg string) {
	c.JSON(httpStatus, Body{
		Code: code,
		Msg:  msg,
	})
}

func BadRequest(c *gin.Context, msg string) {
	Fail(c, http.StatusBadRequest, CodeBadRequest, msg)
}

func Unauthorized(c *gin.Context, msg string) {
	Fail(c, http.StatusUnauthorized, CodeUnauthorized, msg)
}

func Forbidden(c *gin.Context, msg string) {
	Fail(c, http.StatusForbidden, CodeForbidden, msg)
}

func NotFound(c *gin.Context, msg string) {
	Fail(c, http.StatusNotFound, CodeNotFound, msg)
}

func Internal(c *gin.Context, msg string) {
	Fail(c, http.StatusInternalServerError, CodeInternalError, msg)
}
