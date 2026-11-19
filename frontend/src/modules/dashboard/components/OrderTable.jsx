import { ChevronRight } from 'lucide-react'
import { Avatar, Badge, Empty } from './Common'
import { dateTime, isEligibleForFulfillment, isOpen, money, VOICE_LABELS } from '../utils/orders'

export function OrderTable({ orders, onOpen, empty = 'No orders found' }) {
  if (!orders.length) return <Empty title={empty} />
  return <div className="table-scroll" tabIndex={0} role="region" aria-label="Orders table">
    <table>
      <thead><tr><th scope="col">Order ID</th><th scope="col">Customer</th><th scope="col">Date & time</th><th scope="col">Total</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Details</span></th></tr></thead>
      <tbody>{orders.map(order => <tr key={order.id}>
        <td><button className="order-link" onClick={() => onOpen(order.id)}>#{order.id}</button></td>
        <td><div className="person"><Avatar name={order.customer.name} /><span>{order.customer.name ?? 'Name unavailable'}</span></div></td>
        <td className="muted nowrap">{dateTime(order.createdAt)}</td>
        <td className="nowrap">{money(order.total)}</td>
        <td><Badge status={order.status} />{isOpen(order) && !isEligibleForFulfillment(order) && <p className="muted small">{order.confirmation?.status === 'confirmed' ? 'Review required' : VOICE_LABELS[order.confirmation?.status] ?? 'Awaiting confirmation'}</p>}</td>
        <td><button className="icon-button compact" aria-label={'View order ' + order.id} onClick={() => onOpen(order.id)}><ChevronRight size={17} /></button></td>
      </tr>)}</tbody>
    </table>
  </div>
}
