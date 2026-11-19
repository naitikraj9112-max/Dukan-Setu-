import { dayKey, shortDay, STATUSES } from './orders.js'

export function pastDays(count, now = new Date(), offset = 0) {
  return Array.from({ length: count }, (_, index) => {
    const day = new Date(now)
    day.setDate(day.getDate() - offset - (count - index - 1))
    return day
  })
}

export function summarize(orders, days, now = new Date()) {
  const daily = pastDays(days, now).map(day => ({
    date: dayKey(day), label: shortDay(day), orders: 0, sales: 0, pricedOrders: 0, customers: 0,
  }))
  const buckets = new Map(daily.map(day => [day.date, day]))
  const products = new Map()
  const statusCounts = Object.fromEntries(STATUSES.map(status => [status, 0]))
  const customerDays = new Map(daily.map(day => [day.date, new Set()]))
  const customers = new Set()
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0 }))
  let orderCount = 0
  let sales = 0
  let pricedOrders = 0

  for (const order of orders) {
    const bucket = buckets.get(dayKey(order.createdAt))
    if (!bucket) continue
    bucket.orders += 1
    orderCount += 1
    statusCounts[order.status] += 1
    hours[new Date(order.createdAt).getHours()].orders += 1
    if (order.status === 'cancelled') continue
    customers.add(order.customer.id)
    customerDays.get(bucket.date).add(order.customer.id)
    if (order.status === 'completed' && Number.isFinite(order.total)) {
      bucket.sales += order.total
      bucket.pricedOrders += 1
      sales += order.total
      pricedOrders += 1
    }
    for (const item of new Map(order.items.filter(item => item.productId).map(item => [item.productId, item])).values()) {
      const product = products.get(item.productId) ?? { productId: item.productId, name: item.name, orders: 0 }
      product.orders += 1
      products.set(product.productId, product)
    }
  }
  const weekly = new Map()
  for (const day of daily) {
    day.customers = customerDays.get(day.date).size
    const monday = new Date(day.date + 'T12:00:00')
    monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7)
    const key = dayKey(monday)
    const week = weekly.get(key) ?? { date: key, label: shortDay(monday), orders: 0 }
    week.orders += day.orders
    weekly.set(key, week)
  }
  return {
    daily, weekly: [...weekly.values()], statusCounts, orderCount, sales: pricedOrders ? sales : null,
    customerCount: customers.size, peakHours: hours.filter(hour => hour.orders > 0).sort((a, b) => b.orders - a.orders).slice(0, 3),
    products: [...products.values()].sort((a, b) => b.orders - a.orders),
  }
}

export function forecast(orders, inventory, now = new Date()) {
  const days = pastDays(7, now, 1).map(dayKey)
  const earliestOrder = orders.reduce((earliest, order) => {
    const day = dayKey(order.createdAt)
    return !earliest || day < earliest ? day : earliest
  }, null)
  if (!earliestOrder || earliestOrder > days[0]) return []
  const window = new Set(days)
  const sales = orders.filter(order => order.status === 'completed' && window.has(dayKey(order.createdAt)))
  return inventory.flatMap(product => {
    if (!product.unit || !Number.isFinite(product.stock)) return []
    const matches = sales.flatMap(order => order.items
      .filter(item => item.productId === product.productId && item.unit === product.unit
        && Number.isFinite(item.quantity) && item.quantity > 0)
      .map(item => ({ quantity: item.quantity, day: dayKey(order.createdAt) })))
    if (new Set(matches.map(item => item.day)).size < 3) return []
    const historicalQuantity = matches.reduce((total, item) => total + item.quantity, 0)
    const average = Math.round(historicalQuantity / days.length * 100) / 100
    const expected = average
    const shortage = Math.max(0, Math.round((expected - product.stock) * 100) / 100)
    const restock = shortage
    return [{ ...product, historicalQuantity, average, expected, shortage, restock }]
  }).sort((a, b) => b.restock - a.restock)
}
