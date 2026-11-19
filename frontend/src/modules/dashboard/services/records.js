import { ISSUE_LABELS, STATUSES, uniqueNewestFirst, VOICE_LABELS } from '../utils/orders.js'

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const text = value => typeof value === 'string' && value.trim() ? value.trim() : null
const identifier = value => Number.isSafeInteger(value) ? String(value) : text(value)
const number = value => (typeof value === 'number' || text(value))
  && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null
const timestamp = value => text(value) && Number.isFinite(Date.parse(value)) ? value : null
const list = (value, label) => {
  if (!Array.isArray(value)) throw new Error('The store API returned an invalid ' + label + ' list.')
  return value
}
const unique = (rows, key) => [...new Map(rows.map(row => [row[key], row])).values()]

function issueList(value) {
  return (Array.isArray(value) ? value : []).flatMap(issue => {
    const code = text(issue?.code) ?? text(issue)
    return code ? [{ code, message: text(issue?.message) ?? ISSUE_LABELS[code] ?? code, blocking: issue?.blocking !== false }] : []
  })
}

function normalizeItem(item) {
  if (!record(item)) return null
  return {
    productId: identifier(item.productId ?? item.product_id),
    name: text(item.name ?? item.product_name ?? item.product) ?? 'Unnamed item',
    quantity: number(item.quantity),
    unit: text(item.unit),
    unitPrice: number(item.unitPrice ?? item.unit_price),
  }
}

export function normalizeOrder(raw, { allowAnonymous = false } = {}) {
  const id = identifier(raw?.id)
  const customer = raw?.customer
  const customerId = identifier(customer?.id ?? raw?.customer_id)
  const createdAt = timestamp(raw?.createdAt ?? raw?.created_at)
  if (!id || (!customerId && !allowAnonymous) || !createdAt || !STATUSES.includes(raw.status)) {
    throw new Error('The store API returned an order with an invalid ID, customer ID, creation date, or status.')
  }
  const rawItems = Array.isArray(raw.items) ? raw.items : []
  const items = rawItems.map(normalizeItem).filter(Boolean)
  const voice = raw.voiceResult ?? raw.voice_result
  const issues = issueList(raw.issues)
  function addIssue(code, message) {
    if (!issues.some(issue => issue.code === code && issue.blocking)) issues.push({ code, message, blocking: true })
  }

  if (!items.length || items.length !== rawItems.length) addIssue('invalid_items', 'The order is missing valid line items.')
  if (items.some(item => item.productId === null)) addIssue('unrecognized_product', 'At least one item has no matched catalog ID.')
  if (items.some(item => item.quantity === null || item.quantity <= 0)) addIssue('missing_quantity', 'At least one item needs a positive quantity.')
  if (items.some(item => !item.unit)) addIssue('invalid_unit', 'At least one item is missing its unit.')
  const clarification = raw.requires_clarification === true || raw.needs_clarification === true || voice?.needs_clarification === true
  const question = text(raw.clarification_question ?? voice?.clarification_question)
  if (clarification) addIssue('ambiguous_instructions', question ?? 'The voice request requires customer clarification.')
  if (['low', 'needs_review'].includes(raw.confidence_status ?? voice?.confidence_status)) {
    addIssue('uncertain_extraction', 'The voice processor flagged this result for review.')
  }
  const reported = raw.confirmation?.status ?? raw.confirmation_status
  const status = clarification && reported !== 'rejected' ? 'needs_clarification'
    : Object.hasOwn(VOICE_LABELS, reported) ? reported : 'awaiting_confirmation'

  return {
    id, status: raw.status, createdAt, items, issues,
    customer: {
      id: customerId,
      name: text(customer?.name ?? raw.customer_name),
      phone: text(customer?.phone ?? raw.customer_phone),
      language: text(customer?.language ?? raw.customer_language ?? voice?.language_code),
    },
    total: number(raw.total ?? raw.total_amount),
    instructions: text(raw.instructions ?? raw.special_instructions ?? raw.customer_instructions),
    confirmation: { status, updatedAt: timestamp(raw.confirmation?.updatedAt ?? raw.confirmation_updated_at) },
    statusHistory: (Array.isArray(raw.statusHistory ?? raw.status_history) ? raw.statusHistory ?? raw.status_history : [])
      .flatMap(entry => {
        const at = timestamp(entry?.at ?? entry?.created_at)
        return at && STATUSES.includes(entry.status) ? [{ at, status: entry.status }] : []
      }).sort((a, b) => Date.parse(a.at) - Date.parse(b.at)),
  }
}

export function normalizeOrders(value) {
  return uniqueNewestFirst(list(value, 'order').map(row => normalizeOrder(row)))
}

export function normalizeInventory(value) {
  return unique(list(value, 'inventory').map(item => {
    const productId = identifier(item?.productId ?? item?.product_id)
    if (!productId) throw new Error('The store API returned an inventory item without a product ID.')
    return {
      productId, name: text(item.name ?? item.product_name) ?? productId, category: text(item.category),
      unit: text(item.unit), stock: number(item.stock ?? item.available_quantity),
      lowStockAt: number(item.lowStockAt ?? item.low_stock_at), price: number(item.price ?? item.unit_price),
    }
  }), 'productId')
}

export function normalizeNotifications(value) {
  return uniqueNewestFirst(list(value, 'notification').map(item => {
    const id = identifier(item?.id)
    const createdAt = timestamp(item?.createdAt ?? item?.created_at)
    if (!id || !createdAt) throw new Error('The store API returned a notification without a valid ID or date.')
    return {
      id, createdAt, type: text(item.type), orderId: identifier(item.orderId ?? item.order_id),
      status: STATUSES.includes(item.status) ? item.status : null, message: text(item.message) ?? 'An order was updated.',
      read: item.read === true || item.is_read === true,
    }
  }))
}
