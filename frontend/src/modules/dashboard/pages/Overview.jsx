import { Activity, CalendarDays, CircleCheck, Clock3, IndianRupee, LayoutGrid, Package, ShoppingBag, TriangleAlert, UsersRound, BadgeCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Analytics } from '../components/Analytics'
import { OrderTable } from '../components/OrderTable'
import { ResourceState } from '../components/Common'
import { dayKey, isEligibleForFulfillment, isOpen, money } from '../utils/orders'

export function Overview({ ordersResource, inventoryResource, analyticsResource, days, onDays, onOpen, basePath }) {
  const now = new Date()
  const orders = ordersResource.data ?? []
  const today = orders.filter(order => dayKey(order.createdAt) === dayKey(now))
  const pending = orders.filter(order => order.status === 'pending' && isEligibleForFulfillment(order))
  const completed = orders.filter(order => order.status === 'completed')
  const priced = today.filter(order => order.status === 'completed' && Number.isFinite(order.total))
  const sales = priced.length ? money(priced.reduce((sum, order) => sum + order.total, 0)) : '—'
  const lowStock = inventoryResource.data?.filter(product => Number.isFinite(product.stock) && Number.isFinite(product.lowStockAt) && product.stock <= product.lowStockAt)
  const active = orders.filter(order => isOpen(order) && isEligibleForFulfillment(order)).length
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() - 29)
  const activeCustomers = new Set(orders.filter(order => order.status !== 'cancelled' && dayKey(order.createdAt) >= dayKey(cutoff)).map(order => order.customer.id))
  const stats = [
    { label: 'Total orders', value: orders.length, icon: ShoppingBag, tone: 'purple', detail: today.length + ' placed today' },
    { label: 'Pending orders', value: pending.length, icon: Clock3, tone: 'orange', detail: 'Confirmed by customer, awaiting action' },
    { label: 'Confirmed orders', value: orders.filter(order => order.status === 'confirmed' && isEligibleForFulfillment(order)).length, icon: BadgeCheck, tone: 'blue', detail: 'Ready to start packing' },
    { label: 'Completed orders', value: completed.length, icon: CircleCheck, tone: 'green', detail: 'Orders fulfilled' },
    { label: 'Active customers', value: activeCustomers.size, icon: UsersRound, tone: 'pink', detail: 'Ordered in the last 30 days' },
    { label: 'Sales today', value: sales, icon: IndianRupee, tone: 'blue', detail: priced.length ? 'From priced completed orders' : 'No priced completed orders' },
  ]

  return <>
    <div className="page-heading"><div><h1>Store overview</h1><p>Track orders, sales, and stock across your store.</p></div>
      <span className="date-chip"><CalendarDays size={16} />{new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }).format(now)}</span>
    </div>
    <section className="hero">
      <div className="hero-content">
        <span className="hero-tag"><Activity size={14} /> Order activity</span>
        <h2>{ordersResource.data ? active ? 'You have ' + active + ' active ' + (active === 1 ? 'order' : 'orders') + '.' : 'You’re all caught up.' : 'Your order queue'}</h2>
        <p>Track new orders from voice confirmation to pickup.</p>
        <Link className="button hero-button" to={basePath + '/orders'}><LayoutGrid size={16} /> Manage orders</Link>
      </div>
      <div className="hero-art" aria-hidden="true"><i /><i /><i /><i /><div className="hero-bag"><ShoppingBag size={70} strokeWidth={1.35} /><span><CircleCheck size={24} /></span></div><b className="spark spark-one">✦</b><b className="spark spark-two">✦</b><b className="spark spark-three">✧</b></div>
    </section>
    <ResourceState resource={ordersResource} loading="Loading orders…" />
    <div className="stats-grid">{stats.map(({ label, value, icon: Icon, tone, detail }) => <section className="stat" key={label}><span className={'stat-icon tone-' + tone}><Icon size={20} strokeWidth={1.9} /></span><h2>{label}</h2><strong>{ordersResource.data ? value : '—'}</strong><p>{ordersResource.data ? detail : 'Awaiting order data'}</p></section>)}</div>
    <Analytics resource={analyticsResource} days={days} onDays={onDays} />
    <section className="panel records-panel">
      <div className="panel-header"><div><h2>Recent orders</h2><p>Open an order to view details or update its status.</p></div><Link className="button" to={basePath + '/orders'}>View all orders</Link></div>
      {ordersResource.data && <OrderTable orders={orders.slice(0, 6)} onOpen={onOpen} />}
    </section>
    <section className="panel inventory-overview">
      <div className="panel-header"><div><h2>Inventory overview</h2><p>Stock levels across your catalog</p></div><Link className="button" to={basePath + '/inventory'}>View inventory</Link></div>
      <ResourceState resource={inventoryResource} loading="Loading inventory…" />
      {inventoryResource.data && <div className="inventory-metrics"><div><Package size={20} /><strong>{inventoryResource.data.length}</strong> tracked products</div><div><TriangleAlert size={20} /><strong>{lowStock.length}</strong> at or below stock threshold</div></div>}
    </section>
  </>
}
