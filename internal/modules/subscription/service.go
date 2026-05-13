package subscription

import (
	"context"
	"fmt"
	"log"

	"reminder-flow/internal/config"
	"reminder-flow/internal/wechat"
)

const (
	SceneTaskReminder = "TASK_REMINDER"
	SceneOverdue      = "OVERDUE"
	SceneAssignee     = "ASSIGNEE_CHANGED"
)

type Service struct {
	cfg    *config.Config
	repo   *Repository
	wechat *wechat.MiniService
}

func NewService(cfg *config.Config, repo *Repository, wechatService *wechat.MiniService) *Service {
	return &Service{
		cfg:    cfg,
		repo:   repo,
		wechat: wechatService,
	}
}

type SendTaskReminderParams struct {
	UserID       int64
	RecordID     int64
	CalendarName string
	RecordTitle  string
	RemindAt     string
}

func (s *Service) SendTaskReminder(ctx context.Context, params SendTaskReminderParams) error {
	if params.CalendarName == "" {
		params.CalendarName = "日历"
	}
	templateID := s.cfg.WechatMiniTaskReminderTemplateID
	if templateID == "" {
		log.Println("wechat task reminder template id empty, skip")
		return nil
	}

	accepted, err := s.repo.HasAccepted(ctx, params.UserID, templateID, SceneTaskReminder)
	if err != nil {
		return err
	}

	if !accepted {
		log.Println("user has not accepted task reminder subscription, skip")
		return nil
	}

	openID, err := s.repo.GetUserWechatOpenID(ctx, params.UserID)
	if err != nil {
		return err
	}

	if openID == "" {
		log.Println("user wechat openid empty, skip")
		return nil
	}

	return s.wechat.SendSubscribeMessage(ctx, wechat.SubscribeMessageRequest{
		ToUser:     openID,
		TemplateID: templateID,
		Page:       fmt.Sprintf("pages/record-detail/index?id=%d", params.RecordID),
		Data: map[string]interface{}{
			"thing1": map[string]string{
				"value": params.CalendarName,
			},
			"thing2": map[string]string{
				"value": params.RecordTitle,
			},
			"time3": map[string]string{
				"value": params.RemindAt,
			},
		},
	})
}

type SendOverdueParams struct {
	UserID       int64
	RecordID     int64
	CalendarName string
	RecordTitle  string
	DueAt        string
}

func (s *Service) SendOverdue(ctx context.Context, params SendOverdueParams) error {
	if params.CalendarName == "" {
		params.CalendarName = "日历"
	}
	templateID := s.cfg.WechatMiniOverdueTemplateID
	if templateID == "" {
		log.Println("wechat overdue template id empty, skip")
		return nil
	}

	accepted, err := s.repo.HasAccepted(ctx, params.UserID, templateID, SceneOverdue)
	if err != nil {
		return err
	}

	if !accepted {
		log.Println("user has not accepted overdue subscription, skip")
		return nil
	}

	openID, err := s.repo.GetUserWechatOpenID(ctx, params.UserID)
	if err != nil {
		return err
	}

	if openID == "" {
		log.Println("user wechat openid empty, skip")
		return nil
	}

	return s.wechat.SendSubscribeMessage(ctx, wechat.SubscribeMessageRequest{
		ToUser:     openID,
		TemplateID: templateID,
		Page:       fmt.Sprintf("pages/record-detail/index?id=%d", params.RecordID),
		Data: map[string]interface{}{
			"thing1": map[string]string{
				"value": params.CalendarName,
			},
			"thing2": map[string]string{
				"value": params.RecordTitle,
			},
			"time3": map[string]string{
				"value": params.DueAt,
			},
		},
	})
}

type SendAssigneeChangedParams struct {
	UserID       int64
	RecordID     int64
	CalendarName string
	RecordTitle  string
	OperatorName string
}

func (s *Service) SendAssigneeChanged(ctx context.Context, params SendAssigneeChangedParams) error {
	if params.CalendarName == "" {
		params.CalendarName = "日历"
	}
	templateID := s.cfg.WechatMiniAssigneeTemplateID
	if templateID == "" {
		log.Println("wechat assignee template id empty, skip")
		return nil
	}

	accepted, err := s.repo.HasAccepted(ctx, params.UserID, templateID, SceneAssignee)
	if err != nil {
		return err
	}

	if !accepted {
		log.Println("user has not accepted assignee subscription, skip")
		return nil
	}

	openID, err := s.repo.GetUserWechatOpenID(ctx, params.UserID)
	if err != nil {
		return err
	}

	if openID == "" {
		log.Println("user wechat openid empty, skip")
		return nil
	}

	return s.wechat.SendSubscribeMessage(ctx, wechat.SubscribeMessageRequest{
		ToUser:     openID,
		TemplateID: templateID,
		Page:       fmt.Sprintf("pages/record-detail/index?id=%d", params.RecordID),
		Data: map[string]interface{}{
			"thing1": map[string]string{
				"value": params.CalendarName,
			},
			"thing2": map[string]string{
				"value": params.RecordTitle,
			},
			"name3": map[string]string{
				"value": params.OperatorName,
			},
		},
	})
}
