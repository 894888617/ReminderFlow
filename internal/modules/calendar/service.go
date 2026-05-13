package calendar

func CanViewCalendar(role string) bool {
	return role == RoleOwner || role == RoleMember || role == RoleViewer
}

func CanEditCalendar(role string) bool {
	return role == RoleOwner
}

func CanManageCalendarMembers(role string) bool {
	return role == RoleOwner
}

func CanWriteCalendarRecord(role string) bool {
	return role == RoleOwner || role == RoleMember
}
