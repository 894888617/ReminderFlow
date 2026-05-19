import { request } from './request'
export interface Customer {id:number; calendar_id:number; name:string; phone?:string; remark?:string}
export const listCustomers=(calendarId:number,keyword='')=>request<Customer[]>({url:`/api/calendars/${calendarId}/customers?keyword=${encodeURIComponent(keyword)}`,method:'GET'})
export const createCustomer=(calendarId:number,data:Partial<Customer>)=>request<Customer>({url:`/api/calendars/${calendarId}/customers`,method:'POST',data})
export const updateCustomer=(id:number,data:Partial<Customer>)=>request<Customer>({url:`/api/customers/${id}`,method:'PUT',data})
export const deleteCustomer=(id:number)=>request({url:`/api/customers/${id}`,method:'DELETE'})
