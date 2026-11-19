import { isEligibleForFulfillment, isOpen } from './orders.js'

// The first good snapshot is a baseline. A draft may become eligible later with the same ID.
export function incomingOrders(records, seen, reportsStoredArrivals = false) {
  const known = seen ?? new Set()
  const additions = []
  for (const order of records) {
    const unverified = reportsStoredArrivals && order.confirmation?.status === 'unavailable'
    if ((!isEligibleForFulfillment(order) && !unverified) || known.has(order.id)) continue
    known.add(order.id)
    if (seen && isOpen(order)) additions.push({
      id: 'dashboard-arrival:' + order.id,
      orderId: order.id,
      type: 'new_order',
      createdAt: order.confirmation.updatedAt ?? order.createdAt,
      message: unverified ? 'Order #' + order.id + ' was stored. Voice confirmation is unavailable.'
        : (order.customer.name ?? 'A customer') + ' confirmed order #' + order.id + '.',
      unverified,
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
    if (orderId && drafts.has(orderId) && !item.unverified) continue
    const key = orderId ? 'order:' + orderId : 'event:' + item.id
    const previous = events.get(key)
    const next = { ...item, read: item.read || previous?.read === true || (orderId && localReads.has(orderId)) || false }
    events.set(key, next)
  }
  return [...events.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
}
