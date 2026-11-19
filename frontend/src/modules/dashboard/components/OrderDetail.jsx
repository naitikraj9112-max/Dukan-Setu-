import { useCallback, useState } from 'react'
import { CircleAlert, Mic } from 'lucide-react'
import { Avatar, Badge, Drawer, ResourceState } from './Common'
import { useResource } from '../hooks/useResource'
import { dateTime, ISSUE_LABELS, money, ORDER_POLL_INTERVAL, STATUS_LABELS, statusOptions, VOICE_LABELS } from '../utils/orders'

export function OrderDetail({ api, id, onClose, onUpdated, onCustomer }) {
  const load = useCallback(() => api.getOrder(id), [api, id])
  const resource = useResource(load, { interval: ORDER_POLL_INTERVAL })
  const [status, setStatus] = useState('')
  const [saved, setSaved] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const order = resource.data
  const options = order ? statusOptions(order) : []
  const selected = options.includes(status) ? status : ''

  async function save(event) {
    event.preventDefault()
    if (!selected || busy) return
    setBusy(true)
    setError('')
    setSaved('')
    try {
      const updated = await api.updateStatus(id, selected)
      if (updated) resource.updateData(() => updated)
      setStatus('')
      setSaved('Order status updated.')
      await Promise.all([resource.refresh({ afterCurrent: true }), onUpdated(updated)])
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  return <Drawer title={'Order #' + id} onClose={onClose}>
    <ResourceState resource={resource} />
    {order && <div className="detail-content">
      <div className="detail-top"><time dateTime={order.createdAt}>{dateTime(order.createdAt)}</time><Badge status={order.status} /></div>
      <section className="detail-section"><h3>Customer</h3><div className="person"><Avatar name={order.customer.name} /><div><button className="order-link" onClick={() => onCustomer(order.customer.id)}>{order.customer.name ?? 'View customer history'}</button><p className="muted small">Customer ID {order.customer.id}</p>{(order.customer.phone || order.customer.language) && <p className="muted small">{[order.customer.phone, order.customer.language].filter(Boolean).join(' · ')}</p>}</div></div></section>
      <section className="detail-section"><h3><Mic size={17} /> Voice confirmation</h3>
        <Badge status={order.confirmation?.status ?? 'awaiting_confirmation'}>{VOICE_LABELS[order.confirmation?.status] ?? 'Awaiting confirmation'}</Badge>
        {order.confirmation?.updatedAt && <p className="muted small confirmation-time">Updated {dateTime(order.confirmation.updatedAt)}</p>}
        {order.confirmation?.status !== 'confirmed' && <p className="muted small confirmation-time">Customer confirmation is required before this order can advance.</p>}
      </section>
      {!!order.issues?.length && <section className="detail-section"><h3><CircleAlert size={17} /> Extraction warnings</h3>
        <ul className="issue-list">{order.issues.map((issue, index) => <li key={index}><strong>{ISSUE_LABELS[issue.code] ?? issue.code}{issue.blocking ? ' · Blocks progress' : ''}</strong><p>{issue.message}</p></li>)}</ul>
      </section>}
      {order.instructions && <section className="detail-section customer-instructions"><h3>Customer instructions</h3><p>{order.instructions}</p></section>}
      <section className="detail-section"><h3>Items</h3>
        <ul className="detail-items">{order.items.map((item, index) => <li key={index}><span>{item.name}<small>{item.quantity ?? 'Quantity missing'} {item.unit}{item.unitPrice != null && ' · ' + money(item.unitPrice) + ' per ' + (item.unit ?? 'unit')}</small></span><strong>{money(item.unitPrice == null || item.quantity == null ? null : item.unitPrice * item.quantity)}</strong></li>)}</ul>
        <div className="detail-total"><strong>Order total</strong><strong>{money(order.total)}</strong></div>
      </section>
      {!!options.length && <form className="detail-section" onSubmit={save}><h3>Update status</h3>
        <div className="inline-form"><select aria-label="New order status" value={selected} onChange={event => { setStatus(event.target.value); setSaved('') }} disabled={busy}>
          <option value="">Select status</option>{options.map(value => <option key={value} value={value}>{STATUS_LABELS[value]}</option>)}
        </select><button className="button primary" disabled={!selected || busy}>{busy ? 'Saving…' : 'Save update'}</button></div>
        {error && <p className="error-text" role="alert">{error}</p>}
        {saved && <p className="success-text" role="status">{saved}</p>}
      </form>}
      {!options.length && saved && <p className="success-text" role="status">{saved}</p>}
      <section className="detail-section"><h3>Status history</h3>
        <ol className="timeline">{[...(order.statusHistory ?? [])].reverse().map((step, index) => <li key={index}><strong>{STATUS_LABELS[step.status] ?? step.status}</strong><time dateTime={step.at}>{dateTime(step.at)}</time></li>)}</ol>
        {!order.statusHistory?.length && <p className="muted">No status history available.</p>}
      </section>
    </div>}
  </Drawer>
}
