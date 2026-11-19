import { isEligibleForFulfillment, isOpen } from './orders.js'

// The first good snapshot is a baseline. A draft may become eligible later with the same ID.
export function incomingOrders(records, seen) {
  const known = seen ?? new Set()
  const additions = []
  for (const order of records) {
    if (!isEligibleForFulfillment(order) || known.has(order.id)) continue
    known.add(order.id)
    if (seen && isOpen(order)) additions.push({
      id: 'dashboard-arrival:' + order.id,
      orderId: order.id,
      type: 'new_order',
      createdAt: order.confirmation.updatedAt ?? order.createdAt,
      message: (order.customer.name ?? 'Customer ' + order.customer.id) + ' confirmed order #' + order.id + '.',
      local: true,
      read: false,
    })
  }
  return { known, additions }
}

export function orderNotifications(server, arrivals, orders, localReads) {
  const drafts = new Set((orders ?? []).filter(order => !isEligibleForFulfillment(order)).map(order => order.id))
  const events = new Map()
  for (const item of [...arrivals, ...(server ?? [])]) {
    const orderId = item.type === 'new_order' ? item.orderId : null
    if (orderId && drafts.has(orderId)) continue
    const key = orderId ? 'order:' + orderId : 'event:' + item.id
    const previous = events.get(key)
    const next = { ...item, read: item.read || previous?.read === true || (orderId && localReads.has(orderId)) || false }
    events.set(key, next)
  }
  return [...events.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
}
