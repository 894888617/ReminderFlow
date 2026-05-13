package calendar

import "time"

const (
	RoleOwner  = "owner"
	RoleMember = "member"
	RoleViewer = "viewer"
)

type Calendar struct {
	ID               int64     `json:"id"`
	Name             string    `json:"name"`
	Description      string    `json:"description"`
	Color            string    `json:"color"`
	Timezone         string    `json:"timezone"`
	CoverURL         string    `json:"cover_url"`
	OwnerID          int64     `json:"owner_id"`
	CurrentUserRole  string    `json:"current_user_role"`
	MemberCount      int64     `json:"member_count"`
	RecordCount      int64     `json:"record_count"`
	TodayRecordCount int64     `json:"today_record_count"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}

type CalendarMember struct {
	ID         int64      `json:"id"`
	CalendarID int64      `json:"calendar_id"`
	UserID     int64      `json:"user_id"`
	Nickname   string     `json:"nickname"`
	AvatarURL  string     `json:"avatar_url"`
	Role       string     `json:"role"`
	Status     string     `json:"status"`
	JoinedAt   *time.Time `json:"joined_at"`
}

type CreateCalendarParams struct {
	Name        string
	Description string
	Color       string
	Timezone    string
	CoverURL    string
}

type UpdateCalendarParams struct {
	Name        string
	Description string
	Color       string
	Timezone    string
	CoverURL    string
}
