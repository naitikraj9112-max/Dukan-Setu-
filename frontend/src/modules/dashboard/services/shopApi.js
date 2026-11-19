import { normalizeInventory, normalizeOrder } from './records.js'
import { uniqueNewestFirst } from '../utils/orders.js'

const PAGE_SIZE = 500
const DIRECTORY_TTL = 30_000
const dashboardStatus = status => status === 'preparing' ? 'packing' : status
const backendStatus = status => status === 'packing' ? 'preparing' : status

export function createShopApi({ baseUrl = '', shopId, getAccessToken = () => null } = {}) {
  const root = baseUrl.trim().replace(/\/+$/, '') + '/v1/shops/' + encodeURIComponent(shopId ?? '')
  const directory = new Map()
  const itemsByOrder = new Map()

  async function request(path, method = 'GET', body) {
    if (!shopId) throw new Error('A shop ID is required to connect to the store API.')
    const token = await getAccessToken()
    if (!token) throw new Error('A shop-member session is required to connect to the store API.')
    let response
    try {
      response = await fetch(root + path, {
        method,
        cache: 'no-store',
        signal: AbortSignal.timeout(15000),
        headers: {
          Accept: 'application/json', Authorization: 'Bearer ' + token,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch (error) {
      if (error.name === 'TimeoutError') throw new Error('The store API timed out. The dashboard will retry reads automatically.')
      throw new Error('Could not reach the store API. Check the backend address and allowed frontend origin.', { cause: error })
    }
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      const error = new Error(payload?.error?.message ?? 'Store API request failed (' + response.status + ').')
      error.status = response.status
      throw error
    }
    if (!payload || !Object.hasOwn(payload, 'data')) throw new Error('The store API returned an invalid data envelope.')
    return payload.data
  }

  async function all(path) {
    const records = []
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const page = await request(path + '?limit=' + PAGE_SIZE + '&offset=' + offset)
      if (!Array.isArray(page)) throw new Error('The store API returned an invalid ' + path.slice(1) + ' list.')
      records.push(...page)
      if (page.length < PAGE_SIZE) return records
    }
  }

  function lookup(path) {
    const previous = directory.get(path)
    if (previous && previous.expires > Date.now()) return previous.promise
    const entry = { expires: Date.now() + DIRECTORY_TTL }
    entry.promise = all(path).then(rows => new Map(rows.map(row => [row.id, row]))).catch(error => {
      if (directory.get(path) === entry) directory.delete(path)
      throw error
    })
    directory.set(path, entry)
    return entry.promise
  }

  async function customer(row, customers) {
    if (!row.customer_id) return null
    if (customers.has(row.customer_id)) return customers.get(row.customer_id)
    try {
      const result = await request('/customers/' + encodeURIComponent(row.customer_id))
      customers.set(row.customer_id, result)
      return result
    } catch (error) {
      if (error.status !== 404) throw error
      customers.set(row.customer_id, null)
      return null
    }
  }

  const orderPath = id => '/orders/' + encodeURIComponent(id)

  function detail(id) {
    return request(orderPath(id)).then(data => {
      if (data?.order?.id !== id || !Array.isArray(data.items)) throw new Error('The store API returned invalid order details.')
      return data
    })
  }

  function storedItems(id) {
    if (!itemsByOrder.has(id)) {
      const items = detail(id).then(result => result.items).catch(error => {
        itemsByOrder.delete(id)
        throw error
      })
      itemsByOrder.set(id, items)
    }
    return itemsByOrder.get(id)
  }

  async function order(row, items, customers, products, history = []) {
    const owner = await customer(row, customers)
    return normalizeOrder({
      ...row,
      status: dashboardStatus(row.status),
      confirmation_status: row.confirmation_status ?? 'unavailable',
      customer_name: owner?.name ?? row.customer_name,
      customer_phone: owner?.phone_number ?? row.customer_phone,
      items: items.map(item => ({
        ...item,
        product_name: item.product_name ?? products.get(item.product_id)?.name,
        unit: item.unit ?? products.get(item.product_id)?.unit,
      })),
      status_history: history.map(entry => ({
        status: dashboardStatus(entry.status), at: entry.changed_at,
      })),
    }, { allowAnonymous: true })
  }

  let currentOrders
  function getOrders() {
    currentOrders ??= loadOrders().finally(() => { currentOrders = undefined })
    return currentOrders
  }

  async function loadOrders() {
    const [rows, customers, products] = await Promise.all([all('/orders'), lookup('/customers'), lookup('/products')])
    const unique = [...new Map(rows.map(row => [row.id, row])).values()]
    const enriched = []
    for (let index = 0; index < unique.length; index += 8) {
      const batch = unique.slice(index, index + 8)
      enriched.push(...await Promise.all(batch.map(async row => order(row, await storedItems(row.id), customers, products))))
    }
    return uniqueNewestFirst(enriched)
  }

  return {
    reportsStoredArrivals: true,
    getOrders,
    async getOrder(id) {
      const [result, history, customers, products] = await Promise.all([
        detail(id), request(orderPath(id) + '/history').catch(error => {
          if (error.status === 404) return []
          throw error
        }), lookup('/customers'), lookup('/products'),
      ])
      return order(result.order, result.items, customers, products, history)
    },
    async updateStatus(id, status) {
      const updated = await request(orderPath(id) + '/status', 'PATCH', { status: backendStatus(status) })
      if (updated?.id !== id || dashboardStatus(updated.status) !== status) {
        throw new Error('The store API did not confirm the requested order status.')
      }
      // The PATCH response is an order row. The existing resource refresh retrieves its items and history.
    },
    async getInventory() {
      const products = await lookup('/products')
      return normalizeInventory([...products.values()].map(product => ({
        ...product, product_id: product.id, stock: product.stock_quantity, lowStockAt: product.low_stock_threshold,
      })))
    },
    // The Backend branch has no notifications feed. Incoming-order notices are session-local.
    getNotifications: async () => [],
  }
}
