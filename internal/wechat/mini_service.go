package wechat

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"
)

type MiniService struct {
	appID     string
	appSecret string

	mu                  sync.Mutex
	accessToken         string
	accessTokenExpireAt time.Time
}

func NewMiniService(appID string, appSecret string) *MiniService {
	return &MiniService{
		appID:     appID,
		appSecret: appSecret,
	}
}

type AccessTokenResponse struct {
	AccessToken string `json:"access_token"`
	ExpiresIn   int    `json:"expires_in"`
	ErrCode     int    `json:"errcode"`
	ErrMsg      string `json:"errmsg"`
}

func (s *MiniService) GetAccessToken(ctx context.Context) (string, error) {
	if s.appID == "" || s.appSecret == "" {
		return "", fmt.Errorf("wechat mini app config missing")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if s.accessToken != "" && time.Now().Before(s.accessTokenExpireAt) {
		return s.accessToken, nil
	}

	apiURL := fmt.Sprintf(
		"https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=%s&secret=%s",
		s.appID,
		s.appSecret,
	)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, apiURL, nil)
	if err != nil {
		return "", err
	}

	client := &http.Client{
		Timeout: 8 * time.Second,
	}

	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("request wechat access_token failed: %w", err)
	}
	defer resp.Body.Close()

	var result AccessTokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("decode access_token response failed: %w", err)
	}

	if result.ErrCode != 0 {
		return "", fmt.Errorf("wechat access_token failed: %d %s", result.ErrCode, result.ErrMsg)
	}

	if result.AccessToken == "" {
		return "", fmt.Errorf("wechat access_token empty")
	}

	s.accessToken = result.AccessToken

	// 微信 access_token 通常有效期 7200 秒，这里提前 5 分钟刷新
	expireSeconds := result.ExpiresIn
	if expireSeconds <= 0 {
		expireSeconds = 7200
	}
	s.accessTokenExpireAt = time.Now().Add(time.Duration(expireSeconds-300) * time.Second)

	return s.accessToken, nil
}

type SubscribeMessageRequest struct {
	ToUser           string                 `json:"touser"`
	TemplateID       string                 `json:"template_id"`
	Page             string                 `json:"page,omitempty"`
	Data             map[string]interface{} `json:"data"`
	MiniprogramState string                 `json:"miniprogram_state,omitempty"`
	Lang             string                 `json:"lang,omitempty"`
}

type SubscribeMessageResponse struct {
	ErrCode int    `json:"errcode"`
	ErrMsg  string `json:"errmsg"`
}

func (s *MiniService) SendSubscribeMessage(ctx context.Context, reqBody SubscribeMessageRequest) error {
	accessToken, err := s.GetAccessToken(ctx)
	if err != nil {
		return err
	}

	apiURL := fmt.Sprintf(
		"https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=%s",
		accessToken,
	)

	if reqBody.MiniprogramState == "" {
		reqBody.MiniprogramState = "developer"
	}

	if reqBody.Lang == "" {
		reqBody.Lang = "zh_CN"
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return err
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, apiURL, bytes.NewReader(bodyBytes))
	if err != nil {
		return err
	}

	httpReq.Header.Set("Content-Type", "application/json")

	client := &http.Client{
		Timeout: 8 * time.Second,
	}

	resp, err := client.Do(httpReq)
	if err != nil {
		return fmt.Errorf("request subscribe message failed: %w", err)
	}
	defer resp.Body.Close()

	var result SubscribeMessageResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return fmt.Errorf("decode subscribe message response failed: %w", err)
	}

	if result.ErrCode != 0 {
		return fmt.Errorf("send subscribe message failed: %d %s", result.ErrCode, result.ErrMsg)
	}

	return nil
}
