import request from "./request";
import type { PageResult, RecordItem, RecordStatus } from "../types/record";

export interface RecordQueryParams {
    workspace_id: number;
    page?: number;
    page_size?: number;
    status?: RecordStatus | "";
    assignee_id?: number;
    keyword?: string;
}

export interface CreateRecordParams {
    workspace_id: number;
    title: string;
    content?: string;
    assignee_id?: number;
    due_at?: string;
}

export interface UpdateRecordParams {
    title: string;
    content?: string;
    assignee_id?: number;
    due_at?: string;
}

export interface OperationLog {
    id: number;
    workspace_id: number;
    record_id?: number | null;
    user_id?: number | null;
    username: string;
    action: string;
    detail: string;
    created_at: string;
}

export function getRecords(params: RecordQueryParams) {
    return request.get<PageResult<RecordItem>, PageResult<RecordItem>>(
        "/api/records",
        { params }
    );
}

export function createRecord(data: CreateRecordParams) {
    return request.post<RecordItem, RecordItem>("/api/records", data);
}

export function getRecordDetail(id: number) {
    return request.get<RecordItem, RecordItem>(`/api/records/${id}`);
}

export function updateRecord(id: number, data: UpdateRecordParams) {
    return request.put<RecordItem, RecordItem>(`/api/records/${id}`, data);
}

export function deleteRecord(id: number) {
    return request.delete(`/api/records/${id}`);
}

export function updateRecordStatus(id: number, status: RecordStatus) {
    return request.put<RecordItem, RecordItem>(`/api/records/${id}/status`, {
        status,
    });
}

export function transferAssignee(id: number, assigneeId: number) {
    return request.put<RecordItem, RecordItem>(`/api/records/${id}/assignee`, {
        assignee_id: assigneeId,
    });
}

export function getOverdueRecords() {
    return request.get<RecordItem[], RecordItem[]>("/api/records/overdue");
}

export function getRecordLogs(id: number) {
    return request.get<OperationLog[], OperationLog[]>(`/api/records/${id}/logs`);
}