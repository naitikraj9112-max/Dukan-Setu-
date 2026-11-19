import { lazy, Suspense, useState } from 'react'
import { Droplets, Milk, Package, Wheat } from 'lucide-react'
import { Badge, Empty, ResourceState } from './Common'
import { money, STATUSES } from '../utils/orders'

const TrendChart = lazy(() => import('./TrendChart'))

export const productIcons = { rice: Wheat, milk: Milk, atta: Wheat, oil: Droplets }
const tones = ['purple', 'green', 'orange', 'blue', 'pink']

export function ProductIcon({ productId, index = 0 }) {
  const Icon = productIcons[productId] ?? Package
  return <span className={'product-icon tone-' + tones[index % tones.length]}><Icon size={18} strokeWidth={1.8} /></span>
}

const metrics = {
  orders: ['Daily orders', 'Order trend', 'Daily order volume'],
  weekly: ['Weekly orders', 'Weekly order volume', 'Weeks start on Monday and include only the selected dates.'],
  sales: ['Sales', 'Sales trend', 'Priced completed orders by order date'],
  customers: ['Customers', 'Customer ordering trend', 'Unique customers placing non-cancelled orders each day'],
}
const hourLabel = hour => String(hour).padStart(2, '0') + ':00'

export function Analytics({ resource, days, onDays, expanded = false }) {
  const [metric, setMetric] = useState('orders')
  const active = expanded ? metric : 'orders'
  const summary = resource.data
  const [, title, description] = metrics[active]
  return <>
    {expanded && summary && <div className="stats-grid analytics-stats">
      {[['Orders in period', summary.orderCount], ['Customers in period', summary.customerCount], ['Priced completed revenue', money(summary.sales)]].map(([label, value]) =>
        <section key={label} className="stat"><h2>{label}</h2><strong>{value}</strong></section>)}
    </div>}
    <div className="analytics-grid">
    <section className="panel trend-panel">
      <div className="panel-header">
        <div><h2>{title}</h2><p>{description}</p></div>
        <select className="period-select" aria-label="Analytics date range" value={days} onChange={event => onDays(Number(event.target.value))}><option value={7}>Last 7 days</option><option value={14}>Last 14 days</option><option value={30}>Last 30 days</option></select>
      </div>
      {expanded && <div className="segments chart-switch" role="group" aria-label="Chart metric">{Object.entries(metrics).map(([value, [label]]) => <button key={value} className={active === value ? 'selected' : ''} aria-pressed={active === value} onClick={() => setMetric(value)}>{label}</button>)}</div>}
      <ResourceState resource={resource} loading="Loading analytics…" />
      {summary && (active === 'sales' && summary.sales === null ? <Empty title="No sales figures available">Completed orders with prices will appear here.</Empty> :
        <Suspense fallback={<div className="chart"><p className="loading" role="status">Loading chart…</p></div>}>
          <TrendChart points={active === 'weekly' ? summary.weekly : summary.daily} metric={active === 'weekly' ? 'orders' : active} title={title} />
        </Suspense>)}
    </section>
    <section className="panel top-panel">
      <div className="panel-header"><div><h2>Top products</h2><p>Ranked by orders containing each item</p></div><span className="panel-icon tone-purple"><Package size={19} /></span></div>
      {summary && (summary.products.length ? <ol className="top-list">{summary.products.slice(0, 5).map((product, index) => <li key={product.productId}>
        <ProductIcon productId={product.productId} index={index} /><div className="product-ranking"><strong>{product.name}</strong><div className="product-bar"><span style={{ width: (product.orders / (summary.products[0].orders || 1) * 100) + '%' }} /></div></div><span className="rank-count">{product.orders}</span>
      </li>)}</ol> : <Empty title="No product activity in this period" />)}
    </section>
    </div>
    {expanded && summary && <div className="analytics-grid">
      <section className="panel"><div className="panel-header"><div><h2>Order status distribution</h2><p>Current statuses for orders placed in this period</p></div></div>
        <ul className="analytics-breakdown">{STATUSES.map(status => {
          const count = summary.statusCounts[status]
          return <li key={status}><Badge status={status} /><meter aria-label={status + ' orders'} min={0} max={summary.orderCount || 1} value={count} /><strong>{count}</strong></li>
        })}</ul>
      </section>
      <section className="panel"><div className="panel-header"><div><h2>Peak ordering times</h2><p>Busiest one-hour windows in local time</p></div></div>
        {summary.peakHours.length ? <ol className="analytics-breakdown peak-hours">{summary.peakHours.map(({ hour, orders }) =>
          <li key={hour}><span>{hourLabel(hour)}–{hourLabel(hour + 1)}</span><strong>{orders} {orders === 1 ? 'order' : 'orders'}</strong></li>)}</ol> : <Empty title="No ordering activity in this period" />}
      </section>
    </div>}
  </>
}
