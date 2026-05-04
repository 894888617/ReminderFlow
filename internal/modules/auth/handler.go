package auth

import (
	"github.com/gin-gonic/gin"

	"reminder-flow/pkg/jwtutil"
	"reminder-flow/pkg/password"
	"reminder-flow/pkg/response"
)

type Handler struct {
	repo      *Repository
	jwtSecret string
}

func NewHandler(repo *Repository, jwtSecret string) *Handler {
	return &Handler{
		repo:      repo,
		jwtSecret: jwtSecret,
	}
}

type RegisterRequest struct {
	Username string `json:"username"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func (h *Handler) Register(c *gin.Context) {
	var req RegisterRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request")
		return
	}

	if req.Username == "" || req.Password == "" {
		response.BadRequest(c, "username and password required")
		return
	}

	hash, err := password.Hash(req.Password)
	if err != nil {
		response.Internal(c, "hash password failed")
		return
	}

	userID, err := h.repo.CreateUser(c.Request.Context(), req.Username, req.Email, hash)
	if err != nil {
		response.Internal(c, "create user failed")
		return
	}

	response.OK(c, gin.H{
		"user_id": userID,
	})
}

func (h *Handler) Login(c *gin.Context) {
	var req LoginRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request")
		return
	}

	u, err := h.repo.FindByUsername(c.Request.Context(), req.Username)
	if err != nil {
		response.Unauthorized(c, "username or password incorrect")
		return
	}

	if !password.Check(req.Password, u.PasswordHash) {
		response.Unauthorized(c, "username or password incorrect")
		return
	}

	token, err := jwtutil.GenerateToken(u.ID, h.jwtSecret)
	if err != nil {
		response.Internal(c, "generate token failed")
		return
	}

	response.OK(c, gin.H{
		"token": token,
		"user": gin.H{
			"id":       u.ID,
			"username": u.Username,
			"email":    u.Email,
		},
	})
}
