import { mockApi } from '../mock/api.js'
import { normalizeInventory, normalizeNotifications, normalizeOrder, normalizeOrders } from './records.js'

export function createHttpAdapter(baseUrl = '') {
  const root = baseUrl.replace(/\/+$/, '') + '/api'

  async function request(path, options) {
    const response = await fetch(root + path, {
      credentials: 'same-origin',
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
      ...options,
      headers: { Accept: 'application/json', ...(options?.body ? { 'Content-Type': 'application/json' } : {}) },
    })
    if (!response.ok) {
      const body = await response.json().catch(() => null)
      throw new Error(typeof body?.detail === 'string' ? body.detail : 'Request failed (' + response.status + ').')
    }
    if (response.status === 204) return undefined
    return response.json().catch(() => { throw new Error('The store API returned invalid JSON.') })
  }

  const orderPath = id => '/orders/' + encodeURIComponent(id)
  return {
    getOrders: async () => normalizeOrders(await request('/orders')),
    getOrder: async id => normalizeOrder(await request(orderPath(id))),
    async updateStatus(id, status) {
      const order = await request(orderPath(id) + '/status', { method: 'PATCH', body: JSON.stringify({ status }) })
      if (order === undefined) return undefined
      const updated = normalizeOrder(order)
      if (updated.id !== id || updated.status !== status) throw new Error('The store API did not confirm the requested order status.')
      return updated
    },
    getCustomerOrders: async id => normalizeOrders(await request('/customers/' + encodeURIComponent(id) + '/orders')),
    getInventory: async () => normalizeInventory(await request('/inventory')),
    getNotifications: async () => normalizeNotifications(await request('/notifications')),
    markRead: id => request('/notifications/' + encodeURIComponent(id) + '/read', { method: 'PATCH' }),
  }
}

export const isDemo = import.meta.env?.VITE_DASHBOARD_MODE !== 'api'
export const dashboardApi = isDemo ? mockApi : createHttpAdapter(import.meta.env?.VITE_API_BASE_URL)
