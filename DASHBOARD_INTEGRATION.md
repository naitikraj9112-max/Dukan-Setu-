# DukanSetu dashboard and FastAPI integration

## Verification and local setup

The teammate's backend is reachable in the browser at `http://192.168.31.118:8000`. The live health endpoint returned `{"status":"ok"}`, and Swagger and OpenAPI reported version 2.0.0 with the routes and status values below. Response details omitted from OpenAPI were checked in the FastAPI source at commit `5982b72f7179702bdd2436d491ac688c0ed9f7bb`. Authenticated database reads and writes still need a valid shop-member session. [Backend route source](https://github.com/naitikraj9112-max/Dukan-Setu-/blob/5982b72f7179702bdd2436d491ac688c0ed9f7bb/backend/app/main.py) · [Request schemas](https://github.com/naitikraj9112-max/Dukan-Setu-/blob/5982b72f7179702bdd2436d491ac688c0ed9f7bb/backend/app/schemas.py)

In this checkout, the ignored `frontend/.env.local` enables API mode and targets the requested server. An optional `VITE_API_SHOP_ID` can prefill the shop UUID. Keep credentials out of Vite environment variables.

```dotenv
VITE_DASHBOARD_MODE=api
VITE_API_BASE_URL=http://192.168.31.118:8000
```

With the backend team's configured service running, start the dashboard:

```sh
cd frontend
npm ci
npm run dev -- --host 127.0.0.1
```

Open `http://localhost:5173/dashboard` for the current LAN service. The backend distinguishes `localhost` from `127.0.0.1` in its CORS allowlist. Enter the shop UUID and a valid access token from an authorized shop-member session. The standalone form holds the token only in memory. In the combined app, use the existing authenticated session and pass a stable `createShopApi({ baseUrl, shopId, getAccessToken })` adapter to `ShopkeeperDashboard`. Remount the dashboard when the authenticated user or shop changes. The adapter sends `Authorization: Bearer <access token>`. It never uses database credentials. The backend's storage provider remains the backend team's responsibility.

For the sample dashboard, explicitly set `VITE_DASHBOARD_MODE=mock` and restart Vite or rebuild. API failures stay visible and never switch the dashboard to sample orders.

## Current Backend branch contract

All paths below are relative to `/v1/shops/{shop_id}`. The shop ID and resource IDs are UUIDs. GET lists support `limit` and `offset`. Order lists sort newest first and return summary rows, which the adapter enriches using the detail endpoint and cached customer and product lookups.

| Method and path | Dashboard use or customer integration |
| --- | --- |
| `GET /orders` | Four-second order polling. Returns `{data: [...], limit, offset}`. The adapter paginates, deduplicates by ID, and updates overview, history, and analytics from the same list. |
| `GET /orders/{order_id}` | Returns `{data: {order, items}}`. Items include authoritative quantities and order-time unit prices. |
| `PATCH /orders/{order_id}/status` | Sends `{"status":"preparing"}` for Packing. Returns `{data: order}` on success or `{error: {code, message}}` on failure. The dashboard verifies ID and status and then refreshes. |
| `GET /orders/{order_id}/history` | Returns `{data: [...]}` with `status` and `changed_at` fields. |
| `GET /customers` and `GET /customers/{customer_id}` | Supplies authorized customer names and `phone_number`. Customer purchase history uses the shared order feed filtered by customer ID. A null customer ID displays without a customer link. |
| `GET /products` | Resolves product names and units, and supplies `stock_quantity`, `low_stock_threshold`, and prices for the inventory page. |
| `POST /orders` | Existing create operation for an authenticated shop member. The dashboard never calls it. See the chat notes below. |

Fulfillment uses `pending → confirmed → preparing → ready → completed`. The backend allows cancellation from each nonterminal state. The shop dashboard labels `preparing` as Packing. The Backend branch has no dedicated customer-order list, notifications feed, or server-sent update stream. The dashboard uses the shared order list for customer history and displays session-local **New Order Received** notices for newly stored orders. Reads of those local notices are also session-local. Existing apps can supply their own notification adapter if the backend adds a feed.

The current order response does not expose voice confirmation, uncertainty, or special instructions. The dashboard displays **Confirmation unavailable** and prevents advancement for those records. A persisted record still appears in orders and shows a neutral arrival notice. If the API supplies special instructions they are displayed verbatim as text. Backend fulfillment `confirmed` by itself is not evidence of customer voice confirmation.

## Saumya's chat handoff

Saumya's `src/App.jsx` records audio locally, and `confirmOrder(messageId)` currently updates chat state. The customer app must send the recorded blob to the agreed voice-processing service, retain the server-side draft/order ID, and present clarification and confirmation. After the backend verifies confirmation, the customer app or its backend should persist the order through the authorized workflow and store the returned `data.order.id` on the chat record. [Customer chat source](https://github.com/naitikraj9112-max/Dukan-Setu-/blob/feat/kiranavoice-frontend/src/App.jsx)

The exact current shop-member request is:

```http
POST /v1/shops/{shop_id}/orders
Authorization: Bearer <authorized shop-member access token>
Idempotency-Key: <UUID reused on retries of the same order>
Content-Type: application/json
```

```json
{
  "customer_id": "44444444-4444-4444-8444-444444444444",
  "payment_mode": "cash",
  "items": [
    { "product_id": "55555555-5555-4555-8555-555555555555", "quantity": 2 }
  ]
}
```

`payment_mode` is `cash` or `credit`. Items use resolved catalog IDs, each once, and positive quantities. The response is HTTP 201 with `{data: {order, items, replayed}}`. The strict request schema rejects extra fields, including draft IDs, voice status, and special instructions. Do not embed a shop-member token in the customer chat to work around the existing authorization rules. Member 4 needs a customer-authorized, server-side confirmation and order creation flow, and a customer-authorized status or notification feed. The shop dashboard needs the persisted voice state and blocking validation flags in the shop order list and detail responses to identify eligible orders and enable advancement.

## CORS and shared frontend

The FastAPI app already uses CORS middleware controlled by `CORS_ORIGINS`. For the local frontend at `http://127.0.0.1:5173`, the backend teammate should add exactly that origin to the existing comma-separated allowlist and restart FastAPI. If the browser opens `http://localhost:5173` instead, add that origin separately. Use the actual URL Vite prints if it selects another port. The existing middleware includes `GET`, `POST`, `PATCH`, and `OPTIONS`, and allows `Authorization`, `Content-Type`, and `Idempotency-Key`. In the live browser check, the `localhost:5173` dashboard received the backend's expected authentication rejection with an intentionally invalid token. The same request from `127.0.0.1:5173` failed before an API response could be read. Use `localhost:5173` with the current backend configuration.

Mount `ShopkeeperDashboard` at `/dashboard/*` in Saumya's existing React app. Use the same React instance, root, router, and authentication. Add React Router and Recharts to that app if they are missing. The separate Vite entry in this branch is only for local testing. Both frontends should use the same FastAPI store and persisted IDs.

## Checks completed

The frontend production build and eight frontend tests passed. The backend branch's 11 tests passed. The unchanged FastAPI app also ran against an isolated in-memory test store. From the dashboard's browser origin, an authenticated empty order feed picked up a submitted test order without reloading, deduplicated the replayed submission, populated customer history and inventory, and showed one local arrival notice. The dashboard's test cancellation was returned by subsequent FastAPI order and history reads. The fixture allowed the configured frontend origin. The shared database remains unverified. Live dashboard requests from `localhost:5173` reached the backend's authentication check.

## End-to-end verification on the shared backend

1. Start the configured backend and compare its `/openapi.json` with the deployed version of these routes.
2. Use a dedicated test shop and authorized test user. Run a preflight from the frontend origin, then load its order list and verify real customer and item fields.
3. Submit a clearly identified test order through the connected chat after verified voice confirmation. Check that the returned ID appears once in the open dashboard without a reload.
4. Verify a valid status update persists and an invalid one returns an error. Check that the customer view gets the same order's updated status and notification under its own authorization.
5. Run `npm run build` and `npm test` in `frontend`.
