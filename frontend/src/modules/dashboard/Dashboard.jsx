import { useCallback, useMemo, useState } from 'react'
import { Activity, Bell, ChartNoAxesCombined, ClipboardList, LayoutDashboard, Menu, MessageCircle, Package, ShoppingBag, Store, TrendingUp, UsersRound, X } from 'lucide-react'
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Analytics } from './components/Analytics'
import { Drawer } from './components/Common'
import { Notifications } from './components/Notifications'
import { OrderDetail } from './components/OrderDetail'
import { useResource } from './hooks/useResource'
import { useOrderArrivals } from './hooks/useOrderArrivals'
import { Customers } from './pages/Customers'
import { Orders } from './pages/Orders'
import { Overview } from './pages/Overview'
import { Demand, Stock } from './pages/Stock'
import Chat from '../chat/Chat'
import { dashboardApi, isDemo } from './services/api'
import { summarize } from './utils/analytics'
import { orderNotifications } from './utils/incomingOrders'
import { ORDER_POLL_INTERVAL, uniqueNewestFirst } from './utils/orders'
import './dashboard.css'

const navigation = [
  { path: '', label: 'Overview', icon: LayoutDashboard },
  { path: '/chat', label: 'WhatsApp chat', icon: MessageCircle },
  { path: '/orders', label: 'Orders', icon: ClipboardList },
  { path: '/customers', label: 'Customers', icon: UsersRound },
  { path: '/inventory', label: 'Inventory', icon: Package },
  { path: '/analytics', label: 'Analytics', icon: ChartNoAxesCombined },
  { path: '/demand', label: 'Demand forecast', icon: TrendingUp },
]
function Navigation({ basePath, onClick }) {
  return <nav className="navigation" aria-label="Dashboard">
    <p>Workspace</p>
    {navigation.map(({ path, label, icon: Icon }) => <NavLink key={path} to={basePath + path} end={!path} onClick={onClick}>
      <Icon size={19} strokeWidth={1.8} />{label}
    </NavLink>)}
  </nav>
}

export function Dashboard({ api = dashboardApi, demo = api === dashboardApi && isDemo, storeName = 'Kirana Store', basePath = '/dashboard' }) {
  const [panel, setPanel] = useState(null)
  const [days, setDays] = useState(7)
  const [localReads, setLocalReads] = useState(() => new Set())
  const navigate = useNavigate()
  const location = useLocation()
  const section = navigation.find(({ path }) => path && (location.pathname === basePath + path || location.pathname.startsWith(basePath + path + '/')))?.label ?? 'Overview'
  const getOrders = useCallback(async () => uniqueNewestFirst(await api.getOrders()), [api])
  const getInventory = useCallback(() => api.getInventory(), [api])
  const getNotifications = useCallback(async () => uniqueNewestFirst(await api.getNotifications()), [api])
  const orders = useResource(getOrders, { interval: ORDER_POLL_INTERVAL })
  const summary = useMemo(() => orders.data && summarize(orders.data, days), [orders.data, days])
  const analytics = { data: summary, error: orders.error, refresh: orders.refresh }
  const inventory = useResource(getInventory, { interval: 30000, enabled: ['Overview', 'Inventory', 'Demand forecast'].includes(section) })
  const notifications = useResource(getNotifications, { interval: ORDER_POLL_INTERVAL })
  const { arrivals, latest, dismiss } = useOrderArrivals(orders.data)
  const events = useMemo(() => notifications.data || arrivals.length
    ? orderNotifications(notifications.data, arrivals, orders.data, localReads)
    : undefined, [notifications.data, arrivals, orders.data, localReads])
  const unread = events?.filter(item => !item.read).length ?? 0
  async function markNotificationRead(item) {
    if (!item.local) {
      await api.markRead(item.id)
      notifications.updateData(records => records?.map(record => record.id === item.id ? { ...record, read: true } : record))
    }
    if (item.type === 'new_order' && item.orderId) setLocalReads(previous => new Set([...previous, item.orderId]))
    if (!item.local) await notifications.refresh({ afterCurrent: true })
  }
  const close = () => setPanel(null)
  const openOrder = id => setPanel({ kind: 'order', id })
  const openCustomer = id => { close(); navigate(basePath + '/customers/' + encodeURIComponent(id)) }
  const synchronize = updated => {
    if (updated) orders.updateData(records => records?.map(order => order.id === updated.id ? updated : order))
    return Promise.all([
      orders.refresh({ afterCurrent: true }),
      notifications.refresh({ afterCurrent: true }),
      inventory.refresh({ afterCurrent: true }),
    ])
  }

  return <div className="dukansetu-dashboard">
    <a href="#dashboard-main" className="skip-link">Skip to content</a>
    <aside className="sidebar">
      <Link className="brand" to={basePath}><span className="brand-mark"><ShoppingBag size={24} strokeWidth={2.05} /></span><span><strong>DukanSetu<span>.</span></strong><small>Shopkeeper console</small></span></Link>
      <Navigation basePath={basePath} />
      <div className="sidebar-bottom">
        <div className="store"><span className="store-icon"><Store size={20} /></span><span><strong>{storeName}</strong><small>Shopkeeper workspace</small></span></div>
      </div>
    </aside>
    <div className="workspace">
      <header className="topbar">
        <div className="breadcrumbs">
          <button className="icon-button mobile-menu" onClick={() => setPanel({ kind: 'nav' })} aria-label="Open navigation"><Menu size={22} /></button>
          <span className="breadcrumb-parent">Store workspace</span><span className="breadcrumb-divider">/</span><strong>{section}</strong>
        </div>
        <div className="top-actions">
          {demo && <span className="demo-label"><span />Demo mode</span>}
          <button className="icon-button notification-trigger" aria-label={unread ? 'Notifications, ' + unread + ' unread' : 'Notifications'} onClick={() => setPanel({ kind: 'notifications' })}><Bell size={21} strokeWidth={1.8} />{unread > 0 && <span className="notification-count">{unread > 99 ? '99+' : unread}</span>}</button>
        </div>
      </header>
      <main id="dashboard-main" className={`content ${section === 'WhatsApp chat' ? 'content-chat' : ''}`} tabIndex={-1}>
        {latest && <div className="arrival-banner">
          <p role="status"><strong>New Order Received</strong><span>{latest.count === 1 ? 'Order #' + latest.orderId + ' is ready to review.' : latest.count + ' orders are ready to review.'}</span></p>
          <button className="button compact" onClick={() => latest.count === 1 ? openOrder(latest.orderId) : setPanel({ kind: 'notifications' })}>{latest.count === 1 ? 'View order' : 'View notifications'}</button>
          <button className="icon-button compact" onClick={dismiss} aria-label="Dismiss new order alert"><X size={18} /></button>
        </div>}
        <Routes>
          <Route index element={<Overview ordersResource={orders} inventoryResource={inventory} analyticsResource={analytics} days={days} onDays={setDays} onOpen={openOrder} basePath={basePath} />} />
          <Route path="chat" element={<Chat embedded />} />
          <Route path="orders" element={<Orders resource={orders} onOpen={openOrder} />} />
          <Route path="customers/:customerId?" element={<Customers api={api} ordersResource={orders} onOpen={openOrder} basePath={basePath} />} />
          <Route path="inventory" element={<Stock resource={inventory} />} />
          <Route path="analytics" element={<><div className="page-heading"><div><h1>Business analytics</h1><p>Review order volume, priced sales, popular products, and customer activity.</p></div></div><Analytics resource={analytics} days={days} onDays={setDays} expanded /></>} />
          <Route path="demand" element={<Demand ordersResource={orders} inventoryResource={inventory} />} />
          <Route path="*" element={<Navigate to={basePath} replace />} />
        </Routes>
        <footer className="footer"><span>DukanSetu</span><span><Activity size={15} /> {demo ? 'Sample data · Browser storage' : 'Store API mode'}</span></footer>
      </main>
    </div>
    {panel?.kind === 'nav' && <Drawer title="DukanSetu" onClose={close}><Navigation basePath={basePath} onClick={close} /></Drawer>}
    {panel?.kind === 'notifications' && <Notifications resource={{ ...notifications, data: events }} onMarkRead={markNotificationRead} onClose={close} onOpen={openOrder} />}
    {panel?.kind === 'order' && <OrderDetail key={panel.id} id={panel.id} api={api} onClose={close} onUpdated={synchronize} onCustomer={openCustomer} />}
  </div>
}
