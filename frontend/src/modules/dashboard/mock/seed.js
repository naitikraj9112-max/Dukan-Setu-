import { pastDays } from '../utils/analytics.js'

const inventory = [
  { productId: 'rice', name: 'Basmati Rice', category: 'Grains & Pulses', unit: 'kg', stock: 42, lowStockAt: 10, price: 120 },
  { productId: 'milk', name: 'Amul Taaza Milk', category: 'Dairy', unit: 'L', stock: 3, lowStockAt: 8, price: 56 },
  { productId: 'atta', name: 'Whole Wheat Atta', category: 'Grains & Pulses', unit: 'kg', stock: 28, lowStockAt: 10, price: 52 },
  { productId: 'oil', name: 'Sunflower Oil', category: 'Cooking Essentials', unit: 'L', stock: 12, lowStockAt: 5, price: 145 },
  { productId: 'dal', name: 'Toor Dal', category: 'Grains & Pulses', unit: 'kg', stock: 0, lowStockAt: 4, price: 135 },
  { productId: 'sugar', name: 'White Sugar', category: 'Cooking Essentials', unit: 'kg', stock: 7, lowStockAt: 8, price: 46 },
  { productId: 'tea', name: 'Assam Tea', category: 'Beverages', unit: 'pack', stock: 15, lowStockAt: 5, price: 110 },
  { productId: 'poha', name: 'Thick Poha', category: 'Grains & Pulses', unit: 'kg', stock: 18, lowStockAt: 5, price: 66 },
]

const customers = [
  ['Priya Sharma', 'Hindi'], ['Rajesh Patel', 'Gujarati'], ['Anita Desai', 'Marathi'],
  ['Vikram Singh', 'Hindi'], ['Meera Nair', 'Malayalam'], ['Aarav Gupta', 'English'],
  ['Sana Khan', 'Hindi'], ['Neha Joshi', 'Marathi'],
].map(([name, language], index) => ({ id: 'C-' + (101 + index), name, language, phone: 'Demo •••• ' + (3210 + index * 87) }))

export function createSeed(now = new Date()) {
  const orders = []
  const days = pastDays(30, now)
  const counts = [7, 12, 9, 17, 13, 25, 18]
  const liveStatuses = ['pending', 'packing', 'ready', 'completed', 'confirmed', 'pending', 'packing', 'pending', 'pending']
  days.forEach((day, dayIndex) => {
    const today = dayIndex === days.length - 1
    const count = dayIndex >= 23 ? counts[dayIndex - 23] : 6 + ((dayIndex * 7) % 11)
    for (let index = count - 1; index >= 0; index -= 1) {
      const createdAt = new Date(day)
      if (today) {
        createdAt.setTime(Math.max(new Date(day).setHours(0, 0, 0, 0), now.getTime() - (index * 8 + 2) * 60_000))
      } else {
        createdAt.setHours(18, index * -13, 0, 0)
      }
      const productIndices = [[0, 1, 2], [1, 3], [0, 4, 1], [2, 1, 5], [0, 3, 4], [1, 2], [0, 6, 7], [2, 5]][(index + (today ? 0 : dayIndex)) % 8]
      const items = productIndices.map((productIndex, itemIndex) => {
        const product = inventory[productIndex]
        const quantity = itemIndex === 0 ? 1 + index % 4 : 1 + index % 2
        return { productId: product.productId, name: product.name, quantity, unit: product.unit, unitPrice: product.price }
      })
      const status = today ? liveStatuses[index] ?? 'completed' : index === 8 && dayIndex % 4 === 0 ? 'cancelled' : 'completed'
      let confirmationStatus = 'confirmed'
      let issues = []
      if (today && [0, 5, 7, 8].includes(index)) {
        confirmationStatus = { 0: 'awaiting_confirmation', 5: 'needs_clarification', 7: 'rejected', 8: 'needs_clarification' }[index]
        if (index === 5) {
          items[0] = { ...items[0], quantity: null }
          items[1] = { ...items[1], unit: 'scoop' }
          issues = [
            { code: 'missing_quantity', message: 'A quantity was not provided for ' + items[0].name + '.', blocking: true },
            { code: 'invalid_unit', message: 'Confirm the unit for ' + items[1].name + '.', blocking: true },
          ]
        }
        if (index === 8) {
          items.push({ productId: null, name: 'Unmatched item', quantity: 1, unit: 'pack', unitPrice: null })
          issues = [
            { code: 'unrecognized_product', message: 'An item in the voice note could not be matched to the catalog.', blocking: true },
            { code: 'uncertain_extraction', message: 'The voice module flagged this item for clarification.', blocking: false },
          ]
        }
      }
      const statusDate = new Date(Math.min(now.getTime(), createdAt.getTime() + 60_000)).toISOString()
      const statusPath = ['pending', 'confirmed', 'packing', 'ready', 'completed']
      const history = (status === 'cancelled' ? ['pending', 'cancelled'] : statusPath.slice(0, statusPath.indexOf(status) + 1))
        .map((step, stepIndex) => ({ status: step, at: stepIndex ? statusDate : createdAt.toISOString() }))
      orders.push({
        id: 'DS-' + (1049 + orders.length), customer: customers[index % customers.length],
        createdAt: createdAt.toISOString(), status, items,
        total: issues.some(issue => issue.blocking) ? null : items.reduce((total, item) => total + item.quantity * item.unitPrice, 0),
        confirmation: { status: confirmationStatus, updatedAt: statusDate },
        issues, statusHistory: history,
      })
    }
  })
  orders.reverse()
  const readyOrder = orders.find(order => order.status === 'ready')
  const packingOrder = orders.find(order => order.status === 'packing')
  const notifications = [
    { id: 'demo-new', type: 'new_order', orderId: orders[0].id, message: orders[0].customer.name + ' placed an order.', createdAt: orders[0].createdAt, read: false },
    { id: 'demo-packing', type: 'status_change', orderId: packingOrder.id, message: packingOrder.id + ' is being packed.', createdAt: packingOrder.statusHistory.at(-1).at, read: false },
    { id: 'demo-ready', type: 'ready_for_pickup', orderId: readyOrder.id, message: readyOrder.id + ' is ready for pickup.', createdAt: readyOrder.statusHistory.at(-1).at, read: true },
  ]
  return { orders, inventory, notifications }
}

