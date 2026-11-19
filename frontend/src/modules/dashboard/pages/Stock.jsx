import { useState } from 'react'
import { Badge, Empty, ResourceState } from '../components/Common'
import { ProductIcon } from '../components/Analytics'
import { SearchBox } from './Orders'
import { forecast } from '../utils/analytics'
import { money } from '../utils/orders'

export function Stock({ resource }) {
  const [query, setQuery] = useState('')
  const products = resource.data?.filter(product => (product.name + ' ' + (product.category ?? '')).toLowerCase().includes(query.trim().toLowerCase()))
  return <><div className="page-heading"><div><h1>Inventory</h1><p>Monitor available stock and identify low-stock items.</p></div></div>
    <section className="panel records-panel"><div className="panel-header"><div><h2>Product stock</h2><p>Current quantities from the inventory feed</p></div></div>
      <div className="record-filters"><SearchBox label="Search inventory" value={query} onChange={setQuery} placeholder="Search products or categories…" /></div>
      <ResourceState resource={resource} loading="Loading inventory…" />
      {products && (products.length ? <div className="table-scroll" tabIndex={0} role="region" aria-label="Inventory table"><table>
        <thead><tr><th>Product</th><th>Category</th><th>Stock</th><th>Unit price</th><th>Availability</th></tr></thead>
        <tbody>{products.map((product, index) => <tr key={product.productId}>
          <td><span className="person"><ProductIcon productId={product.productId} index={index} />{product.name}</span></td><td>{product.category ?? '—'}</td><td>{Number.isFinite(product.stock) ? product.stock + ' ' + product.unit : '—'}</td><td>{money(product.price)}</td>
          <td>{!Number.isFinite(product.stock) ? <Badge status="pending">Unknown</Badge> : product.stock <= 0 ? <Badge status="cancelled">Out of stock</Badge> : Number.isFinite(product.lowStockAt) && product.stock <= product.lowStockAt ? <Badge status="pending">Low stock</Badge> : <Badge status="completed">In stock</Badge>}</td>
        </tr>)}</tbody>
      </table></div> : <Empty title="No matching products" />)}
    </section></>
}

export function Demand({ ordersResource, inventoryResource }) {
  const ready = ordersResource.data && inventoryResource.data
  const predictions = ready ? forecast(ordersResource.data, inventoryResource.data) : []
  return <><div className="page-heading"><div><h1>Demand forecast</h1><p>Estimate tomorrow’s demand and compare it with current stock.</p></div></div>
    <section className="panel records-panel"><div className="panel-header"><div><h2>Next-day stock planning</h2><p>Based on the previous 7 complete days of completed orders.</p></div></div>
      <ResourceState resource={ordersResource} loading="Loading order history…" /><ResourceState resource={inventoryResource} loading="Loading inventory…" />
      {ready && (predictions.length ? <><div className="table-scroll" tabIndex={0} role="region" aria-label="Demand forecast table"><table>
        <thead><tr><th>Product</th><th>7-day quantity</th><th>Daily average</th><th>Estimated next day</th><th>Current stock</th><th>Estimated shortage</th><th>Suggested restock</th></tr></thead>
        <tbody>{predictions.map((product, index) => <tr key={product.productId}>
          <td><span className="person"><ProductIcon productId={product.productId} index={index} />{product.name}</span></td>
          <td>{product.historicalQuantity.toLocaleString('en-IN', { maximumFractionDigits: 2 })} {product.unit}</td>
          <td>{product.average} {product.unit}</td><td>{product.expected} {product.unit}</td>
          <td>{product.stock} {product.unit}</td><td>{product.shortage} {product.unit}</td>
          <td>{product.restock > 0 ? <Badge status="pending">{product.restock} {product.unit}</Badge> : '0 ' + product.unit}</td>
        </tr>)}</tbody>
      </table></div><p className="forecast-note">Each estimate requires purchases on at least three different days in the same unit as current stock. {inventoryResource.data.length - predictions.length} products have insufficient matching data.</p></> : <Empty title="Insufficient history to forecast demand">Forecasts need seven days of order records, current stock, and purchases on at least three days in the same unit.</Empty>)}
    </section></>
}
