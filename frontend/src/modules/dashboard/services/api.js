import { mockApi } from '../mock/api.js'
import { createShopApi } from './shopApi.js'

export const isDemo = import.meta.env?.VITE_DASHBOARD_MODE !== 'api'
export const shopApiConfig = {
  baseUrl: import.meta.env?.VITE_API_BASE_URL,
  shopId: import.meta.env?.VITE_API_SHOP_ID,
}
export const dashboardApi = isDemo ? mockApi : createShopApi(shopApiConfig)
