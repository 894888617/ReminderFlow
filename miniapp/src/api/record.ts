import { normalizeRecordStatus, type RecordStatus } from "../utils/recordStatus";
import { request } from "./request";

export interface RecordItem {
  id: number;
  workspace_id?: number;
  calendar_id?: number;
  title: string;
  content?: string;
  creator_id: number;
  assignee_id?: number | null;
  assignee_name?: string;
  status: RecordStatus;
  due_at?: string | null;
  customer_id?: number;
  customer_name?: string;
  customer_phone?: string;
  customer_remark?: string;
  project_id?: number;
  project_name?: string;
  service_name?: string;
  calendar_start_at?: string;
  calendar_end_at?: string | null;
  calendar_all_day?: boolean;
  created_at: string;
  updated_at: string;
  current_user_role?: "owner" | "member" | "viewer" | "";
}

export interface PageResult<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface RecordQueryParams {
  calendar_id: number;
  page?: number;
  page_size?: number;
  status?: RecordStatus | "";
  assignee_id?: number;
  keyword?: string;
  customer_name?: string;
  customer_phone?: string;
}

function buildQuery(params: RecordQueryParams) {
  const query: string[] = [];

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.push(
        `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
      );
    }
  });

  return query.join("&");
}

function normalizeRecordItem(item: RecordItem): RecordItem {
  return {
    ...item,
    status: normalizeRecordStatus(item.status),
  };
}

export function getRecords(params: RecordQueryParams) {
  const query = buildQuery(params);

  return request<PageResult<RecordItem>>({
    url: `/api/records?${query}`,
    method: "GET",
  }).then((data) => ({
    ...data,
    items: (data.items || []).map(normalizeRecordItem),
  }));
}

export interface CreateRecordParams {
  calendar_id: number;
  workspace_id?: number;
  title: string;
  content?: string;
  assignee_id?: number;
  due_at?: string;

  calendar_start_at?: string;
  calendar_end_at?: string | null;
  calendar_all_day?: boolean;
  appointment_status?: string;
  customer_id?: number;
  customer_name?: string;
  customer_phone?: string;
  customer_remark?: string;
  save_customer_to_library?: boolean;
  save_to_customer?: boolean;
  project_id?: number;
  project_name?: string;
  service_name?: string;
}

export function createRecord(data: CreateRecordParams) {
  return request<RecordItem>({
    url: "/api/records",
    method: "POST",
    data,
  }).then(normalizeRecordItem);
}

export function getRecordDetail(id: number) {
  return request<RecordItem>({
    url: `/api/records/${id}`,
    method: "GET",
  }).then(normalizeRecordItem);
}

export function updateRecordStatus(id: number, status: RecordStatus) {
  return request<RecordItem>({
    url: `/api/records/${id}/status`,
    method: "PUT",
    data: {
      status,
    },
  }).then(normalizeRecordItem);
}


export interface UpdateRecordParams {
  title: string;
  content?: string;
  assignee_id?: number;
  due_at?: string;
  calendar_start_at?: string;
  calendar_end_at?: string | null;
  calendar_all_day?: boolean;
  customer_id?: number;
  customer_name?: string;
  customer_phone?: string;
  customer_remark?: string;
  project_id?: number;
  project_name?: string;
  service_name?: string;
}

export function updateRecord(id: number, data: UpdateRecordParams) {
  return request<RecordItem>({
    url: `/api/records/${id}`,
    method: "PUT",
    data,
  }).then(normalizeRecordItem);
}

export function deleteRecord(id: number) {
  return request({
    url: `/api/records/${id}`,
    method: "DELETE",
  });
}
