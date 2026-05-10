package wechatmini

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"reminder-flow/internal/authutil"
	"reminder-flow/internal/config"
	"reminder-flow/pkg/response"
)

type Handler struct {
	cfg  *config.Config
	repo *Repository
}

func NewHandler(cfg *config.Config, repo *Repository) *Handler {
	return &Handler{
		cfg:  cfg,
		repo: repo,
	}
}

type MiniLoginRequest struct {
	Code      string `json:"code"`
	Nickname  string `json:"nickname"`
	AvatarURL string `json:"avatar_url"`
}

type MiniLoginResponse struct {
	Token string    `json:"token"`
	User  *MiniUser `json:"user"`
}

type Code2SessionResponse struct {
	OpenID     string `json:"openid"`
	SessionKey string `json:"session_key"`
	UnionID    string `json:"unionid"`
	ErrCode    int    `json:"errcode"`
	ErrMsg     string `json:"errmsg"`
}

func (h *Handler) Login(c *gin.Context) {
	var req MiniLoginRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request")
		return
	}

	req.Code = strings.TrimSpace(req.Code)
	req.Nickname = strings.TrimSpace(req.Nickname)
	req.AvatarURL = strings.TrimSpace(req.AvatarURL)

	if req.Code == "" {
		response.BadRequest(c, "code required")
		return
	}

	var sessionResp *Code2SessionResponse

	if h.cfg.WechatMiniMockLogin == "true" {
		log.Println("wechat mini mock login enabled")

		mockOpenID := req.Code
		if len(mockOpenID) > 32 {
			mockOpenID = mockOpenID[:32]
		}

		sessionResp = &Code2SessionResponse{
			OpenID:  "mock_openid_" + mockOpenID,
			UnionID: "",
		}

		/*		sessionResp = &Code2SessionResponse{
				OpenID:  "mock_openid_" + req.Code,
				UnionID: "",
			}*/
	} else {
		if h.cfg.WechatMiniAppID == "" || h.cfg.WechatMiniAppSecret == "" {
			response.Internal(c, "wechat mini app config missing")
			return
		}

		var err error
		sessionResp, err = h.code2Session(req.Code)
		if err != nil {
			log.Println("wechat code2session error:", err)
			response.Internal(c, err.Error())
			return
		}
	}

	if sessionResp.OpenID == "" {
		response.Internal(c, "wechat openid empty")
		return
	}

	user, err := h.repo.UpsertWechatUser(c.Request.Context(), UpsertWechatUserParams{
		OpenID:    sessionResp.OpenID,
		UnionID:   sessionResp.UnionID,
		Nickname:  req.Nickname,
		AvatarURL: req.AvatarURL,
	})
	if err != nil {
		log.Println("upsert wechat user error:", err)
		response.Internal(c, "upsert wechat user failed")
		return
	}

	token, err := authutil.GenerateToken(user.ID, user.Username, h.cfg.JWTSecret)
	if err != nil {
		response.Internal(c, "generate token failed")
		return
	}

	response.OK(c, MiniLoginResponse{
		Token: token,
		User:  user,
	})
}

func (h *Handler) code2Session(code string) (*Code2SessionResponse, error) {
	apiURL := "https://api.weixin.qq.com/sns/jscode2session"

	query := url.Values{}
	query.Set("appid", h.cfg.WechatMiniAppID)
	query.Set("secret", h.cfg.WechatMiniAppSecret)
	query.Set("js_code", code)
	query.Set("grant_type", "authorization_code")

	client := &http.Client{
		Timeout: 8 * time.Second,
	}

	resp, err := client.Get(apiURL + "?" + query.Encode())
	if err != nil {
		return nil, fmt.Errorf("request wechat code2session failed: %w", err)
	}
	defer resp.Body.Close()

	var result Code2SessionResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode wechat response failed: %w", err)
	}

	if result.ErrCode != 0 {
		return nil, fmt.Errorf("wechat code2session failed: %d %s", result.ErrCode, result.ErrMsg)
	}

	return &result, nil
}
