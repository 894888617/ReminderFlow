import { request } from './request'

export interface Customer {
  id: number
  calendar_id: number
  name: string
  phone?: string
  remark?: string
}

function toCustomerArray(raw: any): Customer[] {
  const candidate = raw?.data?.data ?? raw?.data?.list ?? raw?.data?.items ?? raw?.data ?? raw?.list ?? raw?.items ?? raw
  return Array.isArray(candidate) ? candidate : []
}

export const listCustomers = async (calendarId: number, keyword = '', archived = false) => {
  const res = await request<any>({
    url: `/api/calendars/${calendarId}/customers?keyword=${encodeURIComponent(keyword)}&archived=${archived ? 'true' : 'false'}`,
    method: 'GET',
  })
  return toCustomerArray(res)
}

export const createCustomer = (calendarId: number, data: Partial<Customer>) =>
  request<Customer>({ url: `/api/calendars/${calendarId}/customers`, method: 'POST', data })

export const updateCustomer = (id: number, data: Partial<Customer>) =>
  request<Customer>({ url: `/api/customers/${id}`, method: 'PUT', data })

export const archiveCustomer = (id: number) => request<Customer>({ url: `/api/customers/${id}/archive`, method: 'POST' })
export const unarchiveCustomer = (id: number) => request<Customer>({ url: `/api/customers/${id}/unarchive`, method: 'POST' })
