import { useMemo, useState } from 'react'
import { Dashboard } from './modules/dashboard'
import { mockApi } from './modules/dashboard/mock/api.js'
import { shopApiConfig } from './modules/dashboard/services/api'
import { createShopApi } from './modules/dashboard/services/shopApi'

export function DashboardEntry({ session, onSignOut }) {
  const [fallback, setFallback] = useState(false)
  const hasLiveSession = !fallback && session?.mode === 'live' && Boolean(session?.shopId) && Boolean(session?.accessToken)

  const api = useMemo(() => {
    if (!hasLiveSession) return undefined
    const liveApi = createShopApi({
      ...shopApiConfig,
      shopId: session.shopId,
      getAccessToken: () => session.accessToken,
    })
    // Wrap to catch auth errors and fall back to demo mode smoothly
    const wrapped = {}
    for (const [key, fn] of Object.entries(liveApi)) {
      wrapped[key] = typeof fn === 'function'
        ? async (...args) => {
            try {
              return await fn(...args)
            } catch (err) {
              const isAuthError =
                err?.status === 401 ||
                err?.status === 403 ||
                err?.message?.includes('session is required') ||
                err?.message?.includes('shop ID is required') ||
                err?.message?.includes('401') ||
                err?.message?.includes('403') ||
                err?.message?.includes('token')
              if (isAuthError) {
                setFallback(true)
                // Fall back directly to mockApi for this call
                if (typeof mockApi[key] === 'function') {
                  return await mockApi[key](...args)
                }
              }
              throw err
            }
          }
        : fn
    }
    return wrapped
  }, [hasLiveSession, session?.shopId, session?.accessToken])

  const demo = !hasLiveSession

  return (
    <Dashboard
      api={api || mockApi}
      demo={demo}
      storeName={session?.storeName || (demo ? 'Kirana Store (Demo)' : 'Kirana Store')}
      onDisconnect={onSignOut}
    />
  )
}
