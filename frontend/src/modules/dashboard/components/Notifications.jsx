import { Bell, Check, ShoppingBag, BellRing, PackageCheck } from 'lucide-react'
import { useState } from 'react'
import { Drawer, Empty, ResourceState } from './Common'
import { dateTime, STATUS_LABELS } from '../utils/orders'

const icons = { new_order: ShoppingBag, status_change: BellRing, ready_for_pickup: PackageCheck }
const labels = { new_order: 'New Order Received', status_change: 'Status changed', ready_for_pickup: 'Ready for pickup' }
const eventStatuses = { order_confirmed: 'confirmed', order_packing: 'packing', order_ready: 'ready', order_completed: 'completed', order_cancelled: 'cancelled' }

export function Notifications({ resource, onMarkRead, onClose, onOpen }) {
  const [pending, setPending] = useState(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState(false)
  const notifications = resource.data?.filter(item => !filter || !item.read)

  async function markRead(item) {
    setPending(item.id)
    setError('')
    try {
      await onMarkRead(item)
    } catch (failure) {
      setError(failure.message)
    } finally {
      setPending(null)
    }
  }

  return <Drawer title="Notifications" onClose={onClose}>
    <div className="notification-content">
      <div className="segments" aria-label="Notification filter">
        <button className={!filter ? 'selected' : ''} aria-pressed={!filter} onClick={() => setFilter(false)}>All activity</button>
        <button className={filter ? 'selected' : ''} aria-pressed={filter} onClick={() => setFilter(true)}>Unread</button>
      </div>
      <ResourceState resource={resource} loading="Loading notifications…" />
      {error && <p className="error-text" role="alert">{error}</p>}
      {notifications && (notifications.length ? <ul className="notifications">{notifications.map(item => {
        const status = item.status ?? eventStatuses[item.type]
        const Icon = icons[item.type] ?? (status === 'ready' ? PackageCheck : Bell)
        return <li key={item.id} className={item.read ? '' : 'unread'}>
          <div className="notification-line"><span className="product-icon tone-purple"><Icon size={18} /></span><div>
            <strong>{item.type === 'new_order' ? labels.new_order : STATUS_LABELS[status] ?? labels[item.type] ?? 'Order notification'}{!item.read && <span className="unread-dot" aria-label="Unread" />}</strong>
            <p>{item.message}</p><time dateTime={item.createdAt}>{dateTime(item.createdAt)}</time>
          </div></div>
          <div className="notification-actions">
            {item.orderId && <button className="order-link" onClick={() => onOpen(item.orderId)}>View order</button>}
            {!item.read && <button className="button compact" disabled={pending !== null} onClick={() => markRead(item)}><Check size={15} />{pending === item.id ? 'Saving…' : 'Mark as read'}</button>}
          </div>
        </li>
      })}</ul> : <Empty title={filter ? 'No unread notifications' : 'No notifications yet'} />)}
    </div>
  </Drawer>
}
