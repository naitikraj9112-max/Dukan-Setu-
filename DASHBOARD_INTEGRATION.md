# DukanSetu dashboard integration

## Checkout and scope

The `order-dashboard` checkout is based on `f12a6ef`. The local AI ref at `2270f31` contains `voice_processing.py` and `sarvam_test.py`. Saumya's `feat/kiranavoice-frontend` branch was inspected on GitHub. It has a root Vite app using React 18, Lucide and Tailwind. Its `src/main.jsx` mounts the customer `App` directly. Its `src/App.jsx` records locally and confirms by changing React state. The inspected checkout and available branches did not expose an implemented shared FastAPI order contract or a configured service URL. [Saumya's chat source](https://github.com/naitikraj9112-max/Dukan-Setu-/blob/feat/kiranavoice-frontend/src/App.jsx)

The dashboard module lives at `frontend/src/modules/dashboard/`. The small Vite harness is in `frontend/` so this branch can run on its own. Integrate the module into the team's one frontend and deploy it with that frontend.

## Mount in the shared frontend

Install Node 22.12+ or a supported newer release. For a standalone branch preview, run:

```sh
cd frontend
npm ci
npm run dev
npm run build
npm test
```

Open the Vite URL at `/dashboard`. The package pins React, React DOM, React Router DOM, Recharts, and Lucide React in its lockfile. Vite and its React plugin are development dependencies of the preview. The module's CSS is scoped under `.dukansetu-dashboard`. It does not require Tailwind or import a global reset.

Exported entry point:

```jsx
import { ShopkeeperDashboard } from './modules/dashboard'

<Route path="/dashboard/*" element={<ShopkeeperDashboard api={shopkeeperApi} />} />
```

Use the existing app's router and shopkeeper route guard. Leave Saumya's chat routes in place. The default base path is `/dashboard`. If that prefix is occupied, mount the route at the agreed unused prefix and pass the matching `basePath` without a trailing slash. The subroutes are:

- Overview at the base path
- `/orders`, `/customers`, `/customers/:customerId`, `/inventory`, `/analytics`, and `/demand` under the base path
- Order detail and notifications as in-page drawers

The static host needs an SPA fallback for direct navigation to the dashboard paths. With Saumya's current root layout, move the dashboard module folder into the root app's `src/modules/dashboard/`, add `react-router-dom` and `recharts` to that app's manifest, and update its single `src/main.jsx` to route the existing `App` at the chat entry path and `ShopkeeperDashboard` at `/dashboard/*`. Use one React and React DOM version. Keep Saumya's `src/index.css`, entry HTML, Vite config and lockfile as the integration starting point. The dashboard's `frontend/` preview shell only serves this branch.

## Use the shared API client

Supply a stable `api` object to `ShopkeeperDashboard` when the team has a shared HTTP client or authentication utility. Put backend field normalization in that adapter, using the normalizers exported by the dashboard where they match. The adapter can wrap the existing client and does not need its own transport or credentials.

Without an injected adapter, the default is the isolated demo in `mock/`. The demo is labeled and keeps changes in browser storage. To select the proposed HTTP adapter, copy `frontend/.env.example` to `frontend/.env.local`, set `VITE_DASHBOARD_MODE=api`, and restart Vite or rebuild. Leave `VITE_API_BASE_URL` empty for same-origin FastAPI, or set it to the service URL without the `/api` suffix. The built-in client sends same-origin cookies. Use the shared client's auth configuration for other arrangements. Vite exposes these settings to the browser. Keep Sarvam and Neon credentials server-side.

These are proposed HTTP paths. Verify them against the FastAPI OpenAPI schema before enabling API mode. The injected adapter returns the normalized dashboard model described below.

| Adapter method | Proposed request | Return |
| --- | --- | --- |
| Customer submission (shared backend and chat) | `POST /api/orders` with an authenticated, server-verified confirmed draft reference and a stable idempotency key | The persisted order and its stable ID |
| `getOrders()` | `GET /api/orders` | Order array covering the store's record window |
| `getOrder(id)` | `GET /api/orders/{id}` | Full order |
| `updateStatus(id, status)` | `PATCH /api/orders/{id}/status` with `{"status":"ready"}` | Updated full order, or 204 followed by a refresh |
| `getCustomerOrders(id)` | `GET /api/customers/{id}/orders` | Customer order array, newest first |
| `getInventory()` | `GET /api/inventory` | Inventory array |
| `getNotifications()` | `GET /api/notifications` | Notifications array for the current shopkeeper |
| `markRead(id)` | `PATCH /api/notifications/{id}/read` | 204 or updated notification |

This dashboard derives analytics from the normalized order feed. It does not depend on the proposed `GET /api/analytics/summary`. If the backend paginates the feed, the shared adapter must fetch the complete supported window or be wired to authoritative aggregate data before presenting totals as store-wide. A shell fallback or other non-JSON response is reported as an API error.

## Order and voice data

The dashboard uses string IDs, ISO timestamps with offsets, numeric INR amounts or null, and separate fulfillment and confirmation states. The built-in adapter understands the proposed FastAPI snake_case format as well as the dashboard's camelCase format. Stable numeric IDs are converted to strings. For example:

```json
{
  "id": "ord_1001",
  "customer_id": "cust_001",
  "customer_name": "Rahul",
  "items": [
    { "product_id": "prod_001", "product_name": "Rice", "quantity": 2, "unit": "kg", "unit_price": 60 }
  ],
  "total_amount": 120,
  "status": "pending",
  "confirmation_status": "confirmed",
  "requires_clarification": false,
  "created_at": "2026-11-19T10:30:00+05:30",
  "status_history": [{ "status": "pending", "at": "2026-11-19T10:30:00+05:30" }],
  "issues": []
}
```

Canonical orders have `id`, `customer: { id, name, phone, language }`, `items: [{ productId, name, quantity, unit, unitPrice }]`, `total`, optional `instructions`, `status`, `confirmation: { status, updatedAt }`, `createdAt`, `statusHistory: [{ status, at }]`, and `issues: [{ code, message, blocking }]`. The HTTP adapter accepts `special_instructions` and `customer_instructions` aliases. A response missing a usable order or customer ID, status, or creation timestamp produces a fetch error. Optional fields display as unavailable. FastAPI should return contact details only to an authorized shopkeeper. Validation flags are blocking unless the backend explicitly marks them otherwise. An empty or malformed item set, unmatched catalog ID, invalid quantity, or missing unit blocks advancement.

Fulfillment advances from `pending` to `confirmed`, `packing`, `ready`, then `completed`. Non-terminal orders can be cancelled. Voice states are `awaiting_confirmation`, `confirmed`, `rejected`, and `needs_clarification`. FastAPI must enforce the transition and confirmation rules with the current stored record, append history, and emit a notification with a stable event ID after a successful change. The browser's checks provide immediate feedback.

### Handoff from the AI branch

`voice_processing.py` exports `process_voice_order(audio_path, existing_order=..., keyterms=...)`. The result includes `action`, `items[].product`, `quantity`, `unit`, `changes`, `needs_clarification`, `clarification_question`, `confidence_status`, and language metadata. It recognizes `new_order`, `modify_order`, `confirm_order`, `reject_order`, and `unknown`.

- The shared backend invokes the processor, ties actions to the correct customer and order, resolves spoken names to catalog product IDs, validates units and quantities, and persists the result.
- A new or modified result starts or returns to `awaiting_confirmation`. If clarification is needed, persist `needs_clarification`, with the question or issue details. A `confirm_order` or `reject_order` action only changes the persisted confirmation state after the backend validates its target. The dashboard consumes that state and does not infer confirmation from an action string.
- The HTTP normalizer accepts optional current `voice_result` metadata with the AI's `needs_clarification`, `clarification_question`, `confidence_status`, and `language_code`. Persist only unresolved/current metadata on the order feed. Preserve flags such as `unrecognized_product`, `missing_quantity`, `uncertain_product_name`, `invalid_unit`, `ambiguous_instructions`, and `uncertain_extraction` in `issues`. The AI's language probability is not a product confidence score.
- The dashboard does not submit voice clips or call the processor. Customer recording, confirmation prompts, and status delivery belong to the customer frontend and its backend integration.

### Exact chat and FastAPI handoff

1. In Saumya's `src/App.jsx`, change the `startRecording` recorder's `onstop` handler to send the recorded blob through the shared authenticated voice API as agreed with the AI/backend owners. Use the returned extraction to render the chat draft and clarification prompts. Keep the existing chat and `OrderCard` UI.
2. Replace the local-only confirmation in `confirmOrder(messageId)` with the verified voice confirmation flow. Keep the local message ID for rendering and store the backend draft/order ID separately. Call the agreed persistence operation only when FastAPI has verified the confirmation for that draft. Show success only after the server returns the persisted order. Retry with the same idempotency key. A proposed missing-endpoint contract is `POST /api/orders` with `{"draft_id":"<server-draft-id>"}` and an `Idempotency-Key` header. If the shared confirmation operation already persists the order, reuse its response and skip the extra POST.
3. FastAPI should verify store membership, customer ownership, draft confirmation, catalog IDs, quantities, and units, then commit the order and creation event together. A newly confirmed order can enter fulfillment as `status: "pending"` with `confirmation_status: "confirmed"`. Serve the committed row with the same ID to shopkeeper list, detail and customer history. For draft review, expose a persisted draft only under the agreed protected feed with an unconfirmed state or blocking issues.
4. Use FastAPI's actual status transition contract for shopkeeper writes. Return the persisted record from PATCH when possible, and serve the same status from customer-authorized order detail for the same ID. Write one status notification per successful transition. In Saumya's chat, refresh the linked order card from the authenticated order-detail endpoint or the existing realtime transport, and surface the corresponding customer-scoped notification. Cache customer-only status separately from the chat confirmation badge.

## Inventory, forecasts, and notifications

- Canonical inventory uses `productId`, `name`, `category`, `unit`, `stock`, `lowStockAt`, and `price`. The adapter accepts `product_id`, `product_name`, `available_quantity`, `low_stock_at`, and `unit_price` aliases. Match SKU IDs and units to order items.
- Sales include valid totals from completed orders by creation date. Weekly totals group the selected dates by Monday. Peak times and all date filters use the browser's local time. Customer counts exclude cancelled orders.
- The forecast uses completed orders from the previous seven complete days. Each estimate requires matching purchases on at least three dates, stock in the same unit, and coverage of the start of the seven-day window in the order feed. The estimate and daily average use the same moving average. Suggested restock is the estimated shortage before any supplier pack-size or lead-time rules.
- Canonical notifications use `id`, `type`, `orderId`, `status` when known, `message`, `createdAt`, and `read`. The feed accepts `new_order`, `status_change` with a fulfillment status, `ready_for_pickup`, or status-specific `order_confirmed`, `order_packing`, `order_ready`, `order_completed`, and `order_cancelled`. Duplicate event IDs render once. Write and read state belong to the shopkeeper's backend feed. The customer frontend must show its own authorized status feed.
- The dashboard polls orders, notifications, open order detail, and selected customer history every four seconds. Requests for the same resource share an in-flight read. A successful mutation queues a fresh read after any pending one. Temporary fetch failures retain the last successful list and the current filters. Inventory refreshes every 30 seconds on its relevant pages.
- New confirmed, valid orders detected after the first successful snapshot show **New Order Received** automatically. Drafts can transition into this view under the same ID. The dashboard uses a browser-session notification while the backend event is pending, then displays one notification per arriving order when the event is returned. The API remains authoritative for shared notification persistence and customer delivery. Remount the dashboard when the authenticated shopkeeper or store changes.

## Integration checklist

1. Once the branches are combined by the team, inventory the actual customer entry point and router, shared API/auth configuration, FastAPI routers and schemas, AI entry point, and notification consumer. Compare each with the interfaces above.
2. Mount the dashboard in Saumya's frontend. Keep the customer's routes, package lockfile, and global styles. Reconcile any overlapping preview files under `frontend/`, especially `src/main.jsx`, `package.json`, `package-lock.json`, `index.html`, `vite.config.js`, `.gitignore`, and `.env.example`. The module folder and this checklist are the merge units.
3. Wrap the shared HTTP client and authentication in an injected adapter. Match all IDs, enums, timestamps, bodies, envelopes, and pagination to FastAPI's actual contract. Apply server authorization and scope by store and user. Connect Neon only through FastAPI if the backend uses it.
4. Wire `process_voice_order` into the backend. Check that Saumya's chat shows clarification and sends a separate confirmation tied to the correct order. Confirm that unresolved AI results cannot advance in the dashboard or through a direct status request.
5. Exercise the combined workflow with a test store. Send a real voice note through chat, inspect the extraction result, speak confirmation, verify the stored order and dashboard record use the same ID and items, move it through fulfillment, and verify the matching customer status notification. Include missing quantities, an invalid transition, and a retried status update that emits only one notification.
6. Build the unified frontend, run the backend's tests, and verify that both chat and dashboard routes load at desktop and mobile widths, including deep links. Record the actual app and backend revisions used for the run.

## Remaining integration dependencies and limits

Saumya's existing chat needs the recording upload, persisted confirmation, and authorized status reads described above. Member 3's AI processor must be wired into Member 4's FastAPI application. The combined workflow still requires the actual backend service and schemas, shared order store, catalog, authentication, and notification delivery. A local contract fixture can verify dashboard requests and synchronization. A real voice-to-customer-notification test requires the connected team app and an authorized test store.
