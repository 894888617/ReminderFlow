import request from "./request";
import type { Workspace, WorkspaceMember } from "../types/workspace";

export function getWorkspaces() {
    return request.get<Workspace[], Workspace[]>("/api/workspaces");
}

export function createWorkspace(data: { name: string }) {
    return request.post<Workspace, Workspace>("/api/workspaces", data);
}

export function getWorkspaceMembers(workspaceId: number) {
    return request.get<WorkspaceMember[], WorkspaceMember[]>(
        `/api/workspaces/${workspaceId}/members`
    );
}

export function addWorkspaceMember(
    workspaceId: number,
    data: {
        keyword: string;
        role: "member" | "viewer";
    }
) {
    return request.post(`/api/workspaces/${workspaceId}/members`, data);
}

export function removeWorkspaceMember(workspaceId: number, userId: number) {
    return request.delete(`/api/workspaces/${workspaceId}/members/${userId}`);
}

export function updateMemberRole(
    workspaceId: number,
    userId: number,
    data: {
        role: "member" | "viewer";
    }
) {
    return request.put(
        `/api/workspaces/${workspaceId}/members/${userId}/role`,
        data
    );
}