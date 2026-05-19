import { request } from './request'
export interface AppointmentProject {id:number;name:string;calendar_id:number}
export const listAppointmentProjects=(calendarId:number,keyword='')=>request<AppointmentProject[]>({url:`/api/calendars/${calendarId}/appointment-projects?keyword=${encodeURIComponent(keyword)}`,method:'GET'})
export const createAppointmentProject=(calendarId:number,name:string)=>request({url:`/api/calendars/${calendarId}/appointment-projects`,method:'POST',data:{name}})
