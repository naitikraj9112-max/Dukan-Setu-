import { createSeed } from './seed.js'
import { STATUS_LABELS, statusOptions } from '../utils/orders.js'

const storageKey = 'dukansetu-dashboard-demo-v1'
let memory

function readDemo() {
  try {
    const saved = localStorage.getItem(storageKey)
    if (saved) return JSON.parse(saved)
  } catch {
    return memory ??= createSeed()
  }
  const state = memory ?? createSeed()
  saveDemo(state)
  return state
}

function saveDemo(state) {
  memory = state
  try {
    localStorage.setItem(storageKey, JSON.stringify(state))
  } catch {
    // The demo can still run when browser storage is unavailable.
  }
}

function demoOrder(state, id) {
  const order = state.orders.find(record => record.id === id)
  if (!order) throw new Error('Order not found.')
  return order
}

export const mockApi = {
  getOrders: async () => readDemo().orders,
  getOrder: async id => demoOrder(readDemo(), id),
  getCustomerOrders: async id => readDemo().orders.filter(order => order.customer.id === id),
  getInventory: async () => readDemo().inventory,
  getNotifications: async () => readDemo().notifications,
  async updateStatus(id, status) {
    const state = readDemo()
    const order = demoOrder(state, id)
    if (status === order.status) return order
    if (!statusOptions(order).includes(status)) throw new Error('This status change is unavailable for the current order.')
    const at = new Date().toISOString()
    const updated = { ...order, status, statusHistory: [...order.statusHistory, { status, at }] }
    const notification = {
      id: id + '-' + status + '-' + at, orderId: id, read: false, createdAt: at,
      status, type: status === 'ready' ? 'ready_for_pickup' : 'status_change',
      message: status === 'ready' ? id + ' is ready for pickup.' : id + ' changed to ' + STATUS_LABELS[status].toLowerCase() + '.',
    }
    saveDemo({ ...state, orders: state.orders.map(record => record.id === id ? updated : record), notifications: [notification, ...state.notifications] })
    return updated
  },
  async markRead(id) {
    const state = readDemo()
    saveDemo({ ...state, notifications: state.notifications.map(item => item.id === id ? { ...item, read: true } : item) })
  },
}
