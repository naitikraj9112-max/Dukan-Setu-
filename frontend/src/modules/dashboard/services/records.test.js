import assert from 'node:assert/strict'
import test from 'node:test'
import { createShopApi } from './shopApi.js'
import { normalizeNotifications, normalizeOrder, normalizeOrders } from './records.js'
import { createSeed } from '../mock/seed.js'
import { forecast, summarize } from '../utils/analytics.js'
import { statusOptions } from '../utils/orders.js'
import { incomingOrders, orderNotifications } from '../utils/incomingOrders.js'

const rawOrder = {
  id: 1001, customer_id: 'cust_001', customer_name: 'Rahul',
  items: [{ product_id: 'rice', product_name: 'Basmati Rice', quantity: 2, unit: 'kg', unit_price: 60 }],
  total_amount: 120, status: 'pending', confirmation_status: 'confirmed',
  created_at: '2026-11-19T10:30:00+05:30',
}

test('normalizes a persisted FastAPI order and preserves separate fulfillment and confirmation', () => {
  const order = normalizeOrder(rawOrder)
  assert.equal(order.id, '1001')
  assert.equal(order.customer.id, 'cust_001')
  assert.equal(order.items[0].productId, 'rice')
  assert.equal(order.items[0].unitPrice, 60)
  assert.equal(order.status, 'pending')
  assert.equal(order.customer.name, 'Rahul')
  const optional = normalizeOrder({ ...rawOrder, customer_name: null, special_instructions: 'Leave at reception' })
  assert.equal(optional.customer.name, null)
  assert.equal(optional.customer.phone, null)
  assert.equal(optional.instructions, 'Leave at reception')
  assert.deepEqual(statusOptions(order), ['confirmed', 'cancelled'])
  assert.throws(() => normalizeOrders(null), /invalid order list/)
  assert.throws(() => normalizeOrder({ ...rawOrder, customer_id: null }), /invalid ID/)
})

test('uses AI clarification metadata and never finalizes from a raw voice action', () => {
  const order = normalizeOrder({
    ...rawOrder,
    voice_result: {
      action: 'new_order', needs_clarification: true, confidence_status: 'needs_review',
      clarification_question: 'How much rice?', language_code: 'hi-IN',
    },
    items: [{ product: 'rice', quantity: null, unit: null }],
  })
  assert.equal(order.confirmation.status, 'needs_clarification')
  assert.equal(order.customer.language, 'hi-IN')
  assert(order.issues.some(issue => issue.message === 'How much rice?'))
  assert(order.issues.some(issue => issue.code === 'missing_quantity'))
  assert.deepEqual(statusOptions(order), ['cancelled'])
  const unpersisted = normalizeOrder({
    ...rawOrder, confirmation_status: undefined,
    voice_result: { action: 'confirm_order', needs_clarification: false, confidence_status: 'acceptable' },
  })
  assert.equal(unpersisted.confirmation.status, 'awaiting_confirmation')
  assert.deepEqual(statusOptions(unpersisted), ['cancelled'])
})

test('orders sort newest first and duplicated notification event IDs render once', () => {
  const newer = { ...rawOrder, id: 1002, created_at: '2026-11-20T10:30:00+05:30' }
  assert.deepEqual(normalizeOrders([rawOrder, newer]).map(order => order.id), ['1002', '1001'])
  const event = { id: 'evt_1', order_id: 1001, created_at: rawOrder.created_at, type: 'order_confirmed' }
  const notifications = normalizeNotifications([event, { ...event, is_read: true }])
  assert.equal(notifications.length, 1)
  assert.equal(notifications[0].orderId, '1001')
  assert.equal(notifications[0].read, true)
})

test('a draft becomes a new confirmed arrival once and a delayed backend event takes its place', () => {
  const draft = normalizeOrder({ ...rawOrder, confirmation_status: 'awaiting_confirmation' })
  const confirmed = normalizeOrder(rawOrder)
  const published = { id: 'new-1001', type: 'new_order', orderId: confirmed.id, createdAt: confirmed.createdAt, read: false }
  const baseline = incomingOrders([draft], null)
  assert.deepEqual(baseline.additions, [])
  assert.deepEqual(orderNotifications([published], [], [draft], new Set()), [])
  const update = incomingOrders([confirmed, confirmed], baseline.known)
  assert.equal(update.additions.length, 1)
  assert.deepEqual(incomingOrders([confirmed], update.known).additions, [])
  assert.equal(orderNotifications([], update.additions, [confirmed], new Set())[0].local, true)
  const merged = orderNotifications([published, published], update.additions, [confirmed], new Set([confirmed.id]))
  assert.deepEqual(merged, [{ ...published, read: true }])
  assert.deepEqual(incomingOrders([confirmed], null).additions, [])
})

test('analytics reconcile across daily, weekly, and status totals and forecast suppresses sparse input', () => {
  const now = new Date(2026, 10, 19, 12)
  const { orders, inventory } = createSeed(now)
  const summary = summarize(orders, 7, now)
  assert.equal(summary.daily.reduce((total, day) => total + day.orders, 0), summary.orderCount)
  assert.equal(summary.weekly.reduce((total, week) => total + week.orders, 0), summary.orderCount)
  assert.equal(Object.values(summary.statusCounts).reduce((total, count) => total + count, 0), summary.orderCount)
  assert.equal(summarize([], 7, now).sales, null)
  assert.deepEqual(forecast(orders.slice(0, 1), inventory, now), [])
  assert.deepEqual(forecast(orders, inventory.map(product => ({ ...product, unit: null })), now), [])
  assert(forecast(orders, inventory, now).some(row => row.historicalQuantity > 0 && row.restock > 0 && row.average === row.expected))
})

const shopId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const orderId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const shopOrder = { ...rawOrder, id: orderId, confirmation_status: undefined }
const dataResponse = data => Response.json({ data })

test('shop API joins paginated orders, products, and customers without inventing voice confirmation', async context => {
  const requests = []
  context.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, options })
    const parsed = new URL(url)
    const path = parsed.pathname.replace('/v1/shops/' + shopId, '')
    if (path === '/orders') {
      const rows = parsed.searchParams.get('offset') === '0' ? Array(500).fill(shopOrder) : [{ ...shopOrder, id: 'walk-in', customer_id: null }]
      return dataResponse(rows)
    }
    if (path === '/customers') return dataResponse([{ id: rawOrder.customer_id, name: 'Stored customer', phone_number: '1234567890' }])
    if (path === '/products') return dataResponse([{ id: 'rice', name: 'Catalog Rice', unit: 'kg', stock_quantity: '20.000', low_stock_threshold: 2, price: '100' }])
    if (path.endsWith('/history')) return dataResponse([{ status: 'preparing', changed_at: rawOrder.created_at }])
    return dataResponse({
      order: { ...shopOrder, id: path.split('/').at(-1), status: 'preparing' },
      items: [{ product_id: 'rice', quantity: '2.000', unit_price: '60.00' }],
    })
  })
  const api = createShopApi({ baseUrl: 'https://example.invalid/', shopId, getAccessToken: () => 'session-token' })
  const [orders, sameRead] = await Promise.all([api.getOrders(), api.getOrders()])
  const order = orders.find(row => row.id === orderId)
  assert.equal(orders, sameRead)
  assert.equal(orders.length, 2)
  assert.equal(order.customer.name, 'Stored customer')
  assert.equal(order.customer.phone, '1234567890')
  assert.deepEqual(order.items[0], { productId: 'rice', name: 'Catalog Rice', unit: 'kg', quantity: 2, unitPrice: 60 })
  assert.equal(order.confirmation.status, 'unavailable')
  assert.deepEqual(statusOptions(order), ['cancelled'])
  assert.equal(orders.find(row => row.id === 'walk-in').customer.id, null)
  assert(requests.some(({ url }) => url.endsWith('/orders?limit=500&offset=500')))
  assert(requests.every(({ options }) => options.headers.Authorization === 'Bearer session-token'))
  assert.equal((await api.getOrder(orderId)).statusHistory[0].status, 'packing')
  assert.equal((await api.getInventory())[0].stock, 20)
  assert.deepEqual(await api.getNotifications(), [])
  await api.getOrders()
  assert.equal(requests.filter(({ url }) => url.includes('/products?')).length, 1)
})

test('shop status updates translate Packing to preparing and surface backend errors', async context => {
  const calls = []
  context.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options })
    if (JSON.parse(options.body).status === 'preparing') return dataResponse({ id: orderId, status: 'preparing' })
    return Response.json({ error: { code: 'conflict', message: 'Order status transition is not allowed' } }, { status: 409 })
  })
  const api = createShopApi({ baseUrl: 'https://example.invalid', shopId, getAccessToken: () => 'session-token' })
  await api.updateStatus(orderId, 'packing')
  assert.equal(calls[0].url, 'https://example.invalid/v1/shops/' + shopId + '/orders/' + orderId + '/status')
  assert.equal(calls[0].options.method, 'PATCH')
  assert.deepEqual(JSON.parse(calls[0].options.body), { status: 'preparing' })
  await assert.rejects(api.updateStatus(orderId, 'ready'), /Order status transition is not allowed/)
  await assert.rejects(createShopApi({ shopId }).getOrders(), /shop-member session is required/)
})

test('a stored order with unavailable voice confirmation is announced without calling it confirmed', () => {
  const order = normalizeOrder({ ...rawOrder, confirmation_status: 'unavailable' })
  const { additions } = incomingOrders([order], new Set(), true)
  assert.equal(additions.length, 1)
  assert.match(additions[0].message, /Voice confirmation is unavailable/)
  assert.deepEqual(orderNotifications([], additions, [order], new Set()), additions)
  assert.deepEqual(incomingOrders([order], new Set()).additions, [])
})
