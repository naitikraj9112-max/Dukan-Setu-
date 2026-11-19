import { useMemo, useState } from 'react'
import { Dashboard } from './modules/dashboard'
import { isDemo, shopApiConfig } from './modules/dashboard/services/api'
import { createShopApi } from './modules/dashboard/services/shopApi'

export function DashboardEntry() {
  const [session, setSession] = useState(null)
  const api = useMemo(() => session ? createShopApi({
    ...shopApiConfig, shopId: session.shopId, getAccessToken: () => session.accessToken,
  }) : null, [session])

  if (isDemo) return <Dashboard />
  if (api) return <Dashboard api={api} onDisconnect={() => setSession(null)} />

  function connect(event) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const shopId = data.get('shopId').trim()
    const accessToken = data.get('accessToken').trim()
    if (shopId && accessToken) setSession({ shopId, accessToken })
  }

  return <main className="dukansetu-dashboard">
    <section className="panel connection-panel">
      <h1>Connect to your store</h1>
      <p>Use the shop ID and access token from your authorized shop-member session. The dashboard keeps the token in memory until you disconnect or reload.</p>
      <form onSubmit={connect}>
        <label>Shop ID<input name="shopId" type="text" required defaultValue={shopApiConfig.shopId}
          pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}" /></label>
        <label>Access token<input name="accessToken" type="password" required autoComplete="off" spellCheck={false} /></label>
        <button className="button primary" type="submit">Connect</button>
      </form>
    </section>
  </main>
}
