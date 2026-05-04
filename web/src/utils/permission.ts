export type WorkspaceRole = "owner" | "member" | "viewer";

export function canManageMembers(role?: WorkspaceRole | string) {
    return role === "owner";
}

export function canWriteRecord(role?: WorkspaceRole | string) {
    return role === "owner" || role === "member";
}

export function canDeleteRecord(role?: WorkspaceRole | string, isCreator?: boolean) {
    return role === "owner" || !!isCreator;
}

export function canRead(role?: WorkspaceRole | string) {
    return role === "owner" || role === "member" || role === "viewer";
}

export function roleText(role?: WorkspaceRole | string) {
    switch (role) {
        case "owner":
            return "所有者";
        case "member":
            return "成员";
        case "viewer":
            return "只读";
        default:
            return role || "-";
    }
}

export function roleColor(role?: WorkspaceRole | string) {
    switch (role) {
        case "owner":
            return "gold";
        case "member":
            return "blue";
        case "viewer":
            return "default";
        default:
            return "default";
    }
}