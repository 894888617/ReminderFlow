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

type CalendarEvent struct {
	ID              int64   `json:"id"`
	EventID         int64   `json:"event_id"`
	CalendarID      int64   `json:"calendar_id"`
	RecordID        *int64  `json:"record_id"`
	Title           string  `json:"title"`
	RecordTitle     string  `json:"record_title"`
	RecordContent   string  `json:"record_content"`
	Status          string  `json:"status"`
	EventType       string  `json:"event_type"`
	AssigneeID      *int64  `json:"assignee_id"`
	AssigneeName    string  `json:"assignee_name"`
	StartAt         string  `json:"start_at"`
	EndAt           *string `json:"end_at"`
	AllDay          bool    `json:"all_day"`
	CurrentUserRole string  `json:"current_user_role"`
}

type CalendarEventTimeParams struct {
	StartAt time.Time
	EndAt   *time.Time
	AllDay  bool
}

type CalendarEventFilters struct {
	AssigneeID *int64
	Status     string
	EventType  string
}

type CreateSpecialEventParams struct {
	Date      time.Time
	EventType string
	StartTime string
	AllDay    bool
	Remark    string
}

type MonthlyStats struct {
	Month     string `json:"month"`
	Total     int64  `json:"total"`
	Pending   int64  `json:"pending"`
	Confirmed int64  `json:"confirmed"`
	Done      int64  `json:"done"`
	Cancelled int64  `json:"cancelled"`
	RestDays  int64  `json:"rest_days"`
	FullDays  int64  `json:"full_days"`
}

type MemberWorkloadItem struct {
	UserID    int64  `json:"user_id"`
	Name      string `json:"name"`
	Total     int64  `json:"total"`
	Done      int64  `json:"done"`
	Cancelled int64  `json:"cancelled"`
	Pending   int64  `json:"pending"`
}

type MemberWorkloadStats struct {
	Month string               `json:"month"`
	Items []MemberWorkloadItem `json:"items"`
}
