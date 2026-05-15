import { request } from "./request";

export type CalendarRole = "owner" | "member" | "viewer";

export interface Calendar {
  id: number;
  name: string;
  description?: string;
  color?: string;
  timezone?: string;
  cover_url?: string;
  owner_id: number;
  current_user_role?: CalendarRole;
  role?: CalendarRole;
  member_count?: number;
  created_at: string;
  updated_at: string;
}

export interface CalendarMember {
  id: number;
  calendar_id: number;
  user_id: number;
  username?: string;
  email?: string;
  wechat_openid?: string;
  wechat_unionid?: string;
  nickname?: string;
  avatar_url?: string;
  role: CalendarRole;
  status?: string;
  created_at?: string;
  joined_at?: string;
}

export interface CalendarInviteDetail {
  code: string;
  calendar_id: number;
  calendar_name: string;
  inviter_name: string;
  role: "member" | "viewer";
  expired: boolean;
  accepted: boolean;
}

export interface CreateCalendarInviteResult {
  code: string;
  calendar_id: number;
  calendar_name: string;
  role: "member" | "viewer";
  expire_at: string;
  share_path: string;
}

export interface CalendarEvent {
  id: number;
  event_id?: number;
  calendar_id: number;
  record_id?: number | null;
  title: string;
  content?: string;
  start_at: string;
  end_at?: string | null;
  all_day?: boolean;
  status?: string;
  event_type?: string;
  creator_id?: number;
  assignee_id?: number | null;
  assignee_name?: string;
}

export interface CreateCalendarParams {
  name: string;
  description?: string;
  color?: string;
  timezone?: string;
}

export interface UpdateCalendarParams extends CreateCalendarParams {}

export function normalizeCalendarRole(calendar?: Calendar) {
  return calendar?.current_user_role || calendar?.role || "";
}

export function listCalendars() {
  return request<Calendar[]>({
    url: "/api/calendars",
    method: "GET",
  });
}

export function createCalendar(data: CreateCalendarParams) {
  return request<Calendar>({
    url: "/api/calendars",
    method: "POST",
    data,
  });
}

export function getCalendarDetail(calendarId: number) {
  return request<Calendar>({
    url: `/api/calendars/${calendarId}`,
    method: "GET",
  });
}

export function updateCalendar(calendarId: number, data: UpdateCalendarParams) {
  return request<Calendar>({
    url: `/api/calendars/${calendarId}`,
    method: "PUT",
    data,
  });
}

export function deleteCalendar(calendarId: number) {
  return request({
    url: `/api/calendars/${calendarId}`,
    method: "DELETE",
  });
}

export function listCalendarMembers(calendarId: number) {
  return request<CalendarMember[]>({
    url: `/api/calendars/${calendarId}/members`,
    method: "GET",
  });
}

export function updateCalendarMemberRole(
  calendarId: number,
  userId: number,
  role: "member" | "viewer",
) {
  return request({
    url: `/api/calendars/${calendarId}/members/${userId}/role`,
    method: "PUT",
    data: { role },
  });
}

export function removeCalendarMember(calendarId: number, userId: number) {
  return request({
    url: `/api/calendars/${calendarId}/members/${userId}`,
    method: "DELETE",
  });
}

export function createCalendarInvite(
  calendarId: number,
  data: {
    role: "member" | "viewer";
    expire_days?: number;
    max_uses?: number;
  },
) {
  return request<CreateCalendarInviteResult>({
    url: `/api/calendars/${calendarId}/invites`,
    method: "POST",
    data,
  });
}

export function addCalendarMember(
  calendarId: number,
  data: {
    account: string;
    role: "member" | "viewer";
  },
) {
  return request<CalendarMember>({
    url: `/api/calendars/${calendarId}/members`,
    method: "POST",
    data,
  });
}

export function getInviteDetail(code: string) {
  return request<CalendarInviteDetail>({
    url: `/api/invites/${code}`,
    method: "GET",
    auth: false,
  });
}

export interface AcceptInviteResult {
  calendar_id: number;
}

export function acceptInvite(code: string) {
  return request<AcceptInviteResult>({
    url: `/api/invites/${code}/accept`,
    method: "POST",
  });
}

export interface CalendarEventQuery {
  start: string;
  end: string;
  assignee_id?: number;
  status?: string;
  event_type?: string;
}

function buildQuery(params: Record<string, string | number | undefined>) {
  return Object.entries(params)
    .filter(
      ([, value]) => value !== undefined && value !== null && value !== "",
    )
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
    )
    .join("&");
}

export function listCalendarEvents(
  calendarId: number,
  params: CalendarEventQuery,
) {
  const query = buildQuery(params);

  return request<{ items: CalendarEvent[] }>({
    url: `/api/calendars/${calendarId}/events?${query}`,
    method: "GET",
  });
}

export type SpecialDayType = "rest" | "blocked" | "full";

export interface CreateSpecialCalendarEventParams {
  date: string;
  type: SpecialDayType;
  assignee_id: number;
  start_time?: string;
  end_time?: string;
  all_day?: boolean;
  remark?: string;
}

export function createSpecialCalendarEvent(
  calendarId: number,
  data: CreateSpecialCalendarEventParams,
) {
  return request<CalendarEvent>({
    url: `/api/calendars/${calendarId}/events/special`,
    method: "POST",
    data,
  });
}

export function deleteCalendarEvent(eventId: number) {
  return request({
    url: `/api/calendar-events/${eventId}`,
    method: "DELETE",
  });
}

export interface MonthlyCalendarStats {
  month: string;
  total: number;
  pending: number;
  confirmed: number;
  done: number;
  cancelled: number;
  rest_days: number;
  full_days: number;
}

export interface MemberWorkloadItem {
  user_id: number;
  name: string;
  total: number;
  done: number;
  cancelled: number;
  pending: number;
}

export interface MemberWorkloadStats {
  month: string;
  items: MemberWorkloadItem[];
}

export function getMonthlyCalendarStats(calendarId: number, month: string) {
  return request<MonthlyCalendarStats>({
    url: `/api/calendars/${calendarId}/stats/monthly?month=${encodeURIComponent(month)}`,
    method: "GET",
  });
}

export function getMemberWorkloadStats(calendarId: number, month: string) {
  return request<MemberWorkloadStats>({
    url: `/api/calendars/${calendarId}/stats/member-workload?month=${encodeURIComponent(month)}`,
    method: "GET",
  });
}
