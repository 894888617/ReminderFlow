package permission

const (
	RoleOwner  = "owner"
	RoleMember = "member"
	RoleViewer = "viewer"
)

func CanManageMembers(role string) bool {
	return role == RoleOwner
}

func CanWriteRecord(role string) bool {
	return role == RoleOwner || role == RoleMember
}

func CanRead(role string) bool {
	return role == RoleOwner || role == RoleMember || role == RoleViewer
}
