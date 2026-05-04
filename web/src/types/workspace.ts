export type WorkspaceRole = "owner" | "member" | "viewer";

export interface Workspace {
    id: number;
    name: string;
    owner_id: number;
    role: WorkspaceRole;
    created_at: string;
    updated_at: string;
}

export interface WorkspaceMember {
    id: number;
    workspace_id: number;
    user_id: number;
    username: string;
    email: string;
    role: WorkspaceRole;
    created_at: string;
}