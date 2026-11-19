import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { OrderTable } from '../components/OrderTable'
import { ResourceState } from '../components/Common'
import { filterOrders, ORDER_POLL_INTERVAL, STATUSES, STATUS_LABELS } from '../utils/orders'

const defaults = { query: '', status: '', from: '', to: '' }
const pageSize = 20

export function SearchBox({ value, onChange, placeholder, label }) {
  return <label className="search-field"><Search size={17} /><span className="sr-only">{label}</span><input type="search" value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} /></label>
}

export function Records({ orders, onOpen, searchLabel = 'Search orders', filters = true }) {
  const [filter, setFilter] = useState(defaults)
  const [page, setPage] = useState(1)
  const invalid = filter.from && filter.to && filter.from > filter.to
  const matches = useMemo(() => invalid ? [] : filterOrders(orders, filter), [orders, filter, invalid])
  const pages = Math.max(1, Math.ceil(matches.length / pageSize))
  const current = Math.min(pages, page)
  const update = (key, value) => { setFilter(previous => ({ ...previous, [key]: value })); setPage(1) }

  return <>
    <div className="record-filters">
      <SearchBox label={searchLabel} value={filter.query} onChange={value => update('query', value)} placeholder="Search by order, customer or item…" />
      {filters && <>
        <label><span>Status</span><select value={filter.status} onChange={event => update('status', event.target.value)}><option value="">All statuses</option>{STATUSES.map(value => <option key={value} value={value}>{STATUS_LABELS[value]}</option>)}</select></label>
        <label><span>From</span><input type="date" value={filter.from} onChange={event => update('from', event.target.value)} /></label>
        <label><span>To</span><input type="date" value={filter.to} onChange={event => update('to', event.target.value)} /></label>
        {Object.values(filter).some(Boolean) && <button className="button" onClick={() => { setFilter(defaults); setPage(1) }}>Clear filters</button>}
      </>}
    </div>
    {invalid ? <p className="error-text filter-error" role="alert">The end date must be on or after the start date.</p> : <OrderTable orders={matches.slice((current - 1) * pageSize, current * pageSize)} onOpen={onOpen} />}
    <div className="table-footer"><span>{matches.length} {matches.length === 1 ? 'order' : 'orders'}</span>
      {pages > 1 && <div><button className="button compact" disabled={current === 1} onClick={() => setPage(current - 1)}>Previous</button><span>Page {current} of {pages}</span><button className="button compact" disabled={current === pages} onClick={() => setPage(current + 1)}>Next</button></div>}
    </div>
  </>
}

export function Orders({ resource, onOpen }) {
  return <><div className="page-heading"><div><h1>Orders</h1><p>Track live orders and search your digital records.</p></div><button className="button" onClick={resource.refresh}>Refresh orders</button></div>
    <section className="panel records-panel"><div className="panel-header"><div><h2>Order records</h2><p>Orders refresh automatically every {ORDER_POLL_INTERVAL / 1000} seconds.</p></div></div>
      <ResourceState resource={resource} loading="Loading order records…" />
      {resource.data && <Records orders={resource.data} onOpen={onOpen} />}
    </section></>
}
