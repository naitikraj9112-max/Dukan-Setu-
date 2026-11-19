import { useCallback, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Avatar, Empty, ResourceState } from '../components/Common'
import { useResource } from '../hooks/useResource'
import { Records, SearchBox } from './Orders'
import { ORDER_POLL_INTERVAL, uniqueNewestFirst } from '../utils/orders'

export function Customers({ api, ordersResource, onOpen, basePath }) {
  const { customerId } = useParams()
  const [query, setQuery] = useState('')
  const customers = [...new Map((ordersResource.data ?? []).map(order => [order.customer.id, order.customer])).values()]
    .sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id))
  const filtered = customers.filter(customer => [customer.name, customer.id, customer.phone].some(value => String(value ?? '').toLowerCase().includes(query.trim().toLowerCase())))
  const load = useCallback(() => api.getCustomerOrders(customerId), [api, customerId])
  const history = useResource(load, { enabled: Boolean(customerId), interval: ORDER_POLL_INTERVAL })
  const liveOrders = ordersResource.data?.filter(order => order.customer.id === customerId)
  const records = history.data || liveOrders?.length
    ? uniqueNewestFirst([...(history.data ?? []).filter(order => order.customer.id === customerId), ...(liveOrders ?? [])])
    : undefined
  const customer = customers.find(record => record.id === customerId) ?? records?.[0]?.customer
  return <>
    <div className="page-heading"><div><h1>Customer history</h1><p>Find customer details and past purchases.</p></div></div>
    <div className="customer-grid">
      <section className="panel customer-list"><div className="panel-header"><div><h2>Customers</h2><p>{customers.length} with order records</p></div></div>
        <SearchBox label="Search customers" value={query} onChange={setQuery} placeholder="Search customers…" />
        <ResourceState resource={ordersResource} loading="Loading customers…" />
        {ordersResource.data && (filtered.length ? <ul>{filtered.map(record => <li key={record.id}>
          <Link className={record.id === customerId ? 'chosen' : ''} aria-current={record.id === customerId ? 'page' : undefined} to={basePath + '/customers/' + encodeURIComponent(record.id)}><Avatar name={record.name} /><span><strong>{record.name ?? record.id}</strong><small>{record.language ?? record.id}</small></span></Link>
        </li>)}</ul> : <Empty title="No customers found" />)}
      </section>
      <section className="panel records-panel"><div className="panel-header"><div><h2>{customer?.name ?? 'Purchase history'}</h2><p>{customer ? [customer.id, customer.phone, customer.language].filter(Boolean).join(' · ') : 'View orders by customer'}</p></div></div>
        {customerId ? <><ResourceState resource={history} loading="Loading purchase history…" />{records && <Records key={customerId} orders={records} onOpen={onOpen} searchLabel="Search customer orders" />}</> : <Empty title="Select a customer">Their order history and previous purchases will appear here.</Empty>}
      </section>
    </div>
  </>
}
