import { request } from './request'
export interface AppointmentProject {id:number;name:string;calendar_id:number;usage_count?:number;last_used_at?:string}
export const listAppointmentProjects=(calendarId:number,keyword='')=>request<AppointmentProject[]>({url:`/api/calendars/${calendarId}/appointment-projects?keyword=${encodeURIComponent(keyword)}`,method:'GET'})
export const createAppointmentProject=(calendarId:number,name:string)=>request<AppointmentProject>({url:`/api/calendars/${calendarId}/appointment-projects`,method:'POST',data:{name}})
export const updateAppointmentProject=(id:number,name:string)=>request<AppointmentProject>({url:`/api/appointment-projects/${id}`,method:'PUT',data:{name}})
export const deleteAppointmentProject=(id:number)=>request({url:`/api/appointment-projects/${id}`,method:'DELETE'})
