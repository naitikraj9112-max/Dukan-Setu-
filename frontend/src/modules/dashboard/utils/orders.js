export const STATUSES = ['pending', 'confirmed', 'packing', 'ready', 'completed', 'cancelled']
export const STATUS_LABELS = { pending: 'Pending', confirmed: 'Confirmed', packing: 'Packing', ready: 'Ready for pickup', completed: 'Completed', cancelled: 'Cancelled' }
export const VOICE_LABELS = { awaiting_confirmation: 'Awaiting confirmation', confirmed: 'Confirmed by voice', rejected: 'Rejected by customer', needs_clarification: 'Needs clarification', unavailable: 'Confirmation unavailable' }
export const ISSUE_LABELS = {
  unrecognized_product: 'Unrecognized product', missing_quantity: 'Missing or invalid quantity',
  invalid_unit: 'Invalid unit', uncertain_extraction: 'Uncertain extraction',
  uncertain_product_name: 'Uncertain product name', ambiguous_instructions: 'Ambiguous instructions',
  invalid_items: 'Invalid order items',
}

export function statusOptions(order) {
  const index = STATUSES.indexOf(order.status)
  if (index < 0 || index >= 4) return []
  const next = STATUSES[index + 1]
  return isEligibleForFulfillment(order)
    ? [next, 'cancelled']
    : ['cancelled']
}

export const dayKey = date => {
  const value = new Date(date)
  return [value.getFullYear(), String(value.getMonth() + 1).padStart(2, '0'), String(value.getDate()).padStart(2, '0')].join('-')
}
export const money = value => value == null ? '—' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value)
export const dateTime = value => value ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—'
const dayFormatter = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' })
export const shortDay = value => dayFormatter.format(new Date(value))
export const initials = name => name?.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '?'
export const isOpen = order => !['completed', 'cancelled'].includes(order.status)
export const isEligibleForFulfillment = order => order.confirmation?.status === 'confirmed' && !order.issues?.some(issue => issue.blocking)
export const ORDER_POLL_INTERVAL = 4000

export function uniqueNewestFirst(records) {
  return [...new Map(records.map(record => [record.id, record])).values()]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
}

export function filterOrders(orders, { query = '', status = '', from = '', to = '' }) {
  const term = query.trim().toLowerCase()
  return orders.filter(order => {
    const day = dayKey(order.createdAt)
    const fields = [order.id, order.customer.id, order.customer.name, order.customer.phone, ...order.items.map(item => item.name)]
    return (!term || fields.some(value => String(value ?? '').toLowerCase().includes(term)))
      && (!status || order.status === status) && (!from || day >= from) && (!to || day <= to)
  })
}
