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
	UserID      int64
	RecordID    int64
	RecordTitle string
	RemindTime  string
}

func (s *Service) SendTaskReminder(ctx context.Context, params SendTaskReminderParams) error {
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
				"value": params.RecordTitle,
			},
			"time2": map[string]string{
				"value": params.RemindTime,
			},
			"thing3": map[string]string{
				"value": "任务提醒",
			},
		},
	})
}

type SendOverdueParams struct {
	UserID      int64
	RecordID    int64
	RecordTitle string
	DueTime     string
}

func (s *Service) SendOverdue(ctx context.Context, params SendOverdueParams) error {
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
				"value": params.RecordTitle,
			},
			"time2": map[string]string{
				"value": params.DueTime,
			},
			"thing3": map[string]string{
				"value": "任务已逾期",
			},
		},
	})
}

type SendAssigneeChangedParams struct {
	UserID       int64
	RecordID     int64
	RecordTitle  string
	OperatorName string
}

func (s *Service) SendAssigneeChanged(ctx context.Context, params SendAssigneeChangedParams) error {
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
				"value": params.RecordTitle,
			},
			"name2": map[string]string{
				"value": params.OperatorName,
			},
			"thing3": map[string]string{
				"value": "负责人已变更",
			},
		},
	})
}
