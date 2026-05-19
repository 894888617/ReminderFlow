import { request } from './request'

export interface Customer {
  id: number
  calendar_id: number
  name: string
  phone?: string
  remark?: string
}

function toCustomerArray(raw: any): Customer[] {
  const candidate = raw?.data ?? raw?.list ?? raw?.items ?? raw
  return Array.isArray(candidate) ? candidate : []
}

export const listCustomers = async (calendarId: number, keyword = '') => {
  const res = await request<any>({
    url: `/api/calendars/${calendarId}/customers?keyword=${encodeURIComponent(keyword)}`,
    method: 'GET',
  })
  return toCustomerArray(res)
}

export const createCustomer = (calendarId: number, data: Partial<Customer>) =>
  request<Customer>({ url: `/api/calendars/${calendarId}/customers`, method: 'POST', data })

export const updateCustomer = (id: number, data: Partial<Customer>) =>
  request<Customer>({ url: `/api/customers/${id}`, method: 'PUT', data })

export const deleteCustomer = (id: number) => request({ url: `/api/customers/${id}`, method: 'DELETE' })
