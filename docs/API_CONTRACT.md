# API Contract (v1)

Base URL: `/api/v1`. Auth: Laravel Sanctum bearer tokens. Every endpoint
below is scoped server-side to the caller's hierarchy node — a query param
like `?facility_id=` only *filters within* that scope, it never expands it.

Update this file whenever a route, field, or status code changes — it is
what web and mobile are built against, and what `shared/types/` is
generated from.

The generated OpenAPI spec (`shared/types/openapi.json`, from
`./scripts/codegen.sh`) has the exact field-level types; this file is the
human-readable contract and the rules behind it.

## Auth
- `POST /auth/login` → token. Body `email, password, device_name?`. Throttled to 6/min. Bad credentials → 422 on `email`.
  - 200 → `{ "data": { "token": "…", "user": <User> } }`. Send the token as `Authorization: Bearer …`.
- `POST /auth/logout` → 204, revokes the token used for the request.
- `GET /auth/me` → current user + role + hierarchy node
  - `<User>` = `{ id, name, email, role, facility_id, lga_id, state_id, node: { level: facility|lga|state|national, id, name, path: [state?, lga?, facility?] } }`. Clients route on `role` / `node.level`.

## Hierarchy (admin-managed, read-only for everyone else)
Lists return only what the caller can see — own node and below, never above or sideways. Not paginated.
- `GET /states` — all for federal/admin, own state for state officers, empty for LGA/SDP users
- `GET /states/{id}/lgas` — 403 unless the caller can see that state
- `GET /lgas/{id}/facilities` — 403 unless the caller can see that LGA (SDP staff can't)
- `GET /facilities/{id}` — includes `lga {id,name}` and `state {id,name}`

## Products
- `GET /products` (filter: category, is_active — `true`/`false`/`1`/`0`). The catalog is not hierarchy-scoped.
- `POST /products` (admin)
- `PUT /products/{id}` (admin)

## Stock — facility level (sdp_staff and above, scoped)
- `GET /facilities/{id}/stock-balances` — current on-hand per product/batch
  - `data`: one entry per product stocked at the facility: `{ product, quantity_on_hand, usable_quantity, expired_quantity, expiring_soon_quantity, level, flags, batches: [{ batch_id, batch_no, expiry_date, expiry_status, quantity_on_hand, last_transaction_id }] }`. Batches are listed earliest expiry first and include zero-quantity rows.
  - `usable_quantity` = on hand minus expired batches. Thresholds are judged on usable stock.
  - `level`: `stock_out` (usable 0) | `low_stock` (< min) | `reorder` (≤ reorder_level / EOP) | `ok`.
  - `flags` ⊆ `stock_out, expired, low_stock, expiring_soon` (same values as `alerts.alert_type`), most severe first. "Expiring soon" = within `INVENTORY_EXPIRING_SOON_DAYS` (default 90).
  - These are display-only interpretations of `stock_balances`; nothing is written back.
- `GET /facilities/{id}/stock-transactions` — ledger history (filters: product_id, date range, transaction_type)
  - query: `product_id?, transaction_type?, from?, to?` (inclusive `YYYY-MM-DD`), `order?` (`desc` default | `asc` = paper-card order), `per_page?` (≤ 200, default 50), `page?`.
  - 200 → `{ "data": [<StockTransaction>], "meta": { "pagination": { current_page, per_page, total, last_page } } }`; each row also has `product_name` and `performed_by_name`.
- `POST /facilities/{id}/stock-transactions` — record receipt / issue / loss / adjustment_in / adjustment_out / physical_count / transfer_in / transfer_out
  - body: `product_id, batch_no?, expiry_date?, transaction_type, quantity, voucher_no?, counterparty?, comments?, transaction_date, client_reference?`
  - `client_reference`: optional idempotency key (≤ 64 chars; the mobile outbox sends a UUID per queued entry).
    If an entry with the same `client_reference` already exists at this facility, nothing is recorded and the
    existing entry comes back with **200** instead of 201 — so a sync retried after a lost response can't
    double-count. The first request's payload wins.
  - who: `sdp_staff` for their own facility, `admin` for any; facility must be active. Otherwise 403 (checked before validation).
  - `quantity`: integer, always positive (≥ 0 for `physical_count`, which sets the batch balance to the counted total). Direction comes from `transaction_type`.
  - `transaction_date`: `YYYY-MM-DD`, not in the future (Africa/Lagos), and not earlier than the latest entry for that product at the facility.
  - `batch_no`: required if the product is batch-tracked, forbidden (with `expiry_date`) if not. Trimmed and upper-cased. An unknown batch is created on `receipt` / `transfer_in` / `adjustment_in` / `physical_count` (then `expiry_date` is required); other types must reference a known batch. If given for a known batch, `expiry_date` must match. Expired batches can't be `issue`d.
  - `counterparty`: required for `receipt`, `issue`, `transfer_in`, `transfer_out`.
  - 201 → `{ "data": { id, facility_id, product_id, batch_id, batch_no, expiry_date, transaction_date, transaction_type, quantity, running_balance, voucher_no, counterparty, comments, performed_by, delivery_note_id, created_at } }` — `running_balance` is the facility+product total after this entry.
  - 422 also for state-dependent failures, e.g. `{"errors": {"quantity": ["Insufficient stock: 10 on hand for batch AL001."]}}`.
- `GET /facilities/{id}/reorder-suggestions` — current AMC + suggested quantity to order per product
  - `data`: one entry per product stocked at the facility, products needing an order first (then
    lowest months of stock): `{ product, usable_quantity, level, amc_quantity, amc_months_used,
    amc_period_month, months_of_stock, max_stock_quantity, basis, suggested_quantity }`.
  - `amc_quantity` from the latest `amc_snapshots` row (null if none, or no complete month of history).
  - `max_stock_quantity` = ceil(AMC × `INVENTORY_MAX_MONTHS_OF_STOCK`, default 3) when there is an
    AMC > 0 (`basis: "amc"`), else the product's `max_stock_level` (`basis: "product_max"`).
  - `suggested_quantity` = max(0, `max_stock_quantity` − live `usable_quantity`);
    `months_of_stock` = `usable_quantity` / AMC, one decimal (null without an AMC).
  - Display-only: nothing is written back.

## Delivery notes
Scanning happens **on the device** (ML Kit text recognition in the mobile app): the photo never
leaves the phone, the parsed lines are reviewed and corrected by staff, and only the reviewed data is
sent. There is no server-side scan endpoint.

- `GET /facilities/{id}/delivery-notes` (query: `status?`, `per_page?` ≤ 100) — newest first, paginated.
- `GET /delivery-notes/{id}`
- `POST /facilities/{id}/delivery-notes` — create a draft, or `confirm: true` to create and confirm in
  one step (what the phone sends after staff review a scan).
  - body: `delivery_note_no?, source, received_date, capture_method? ("manual" | "ocr"), comments?,
    confirm?, client_reference?, items: [{ product_id, batch_no?, expiry_date?, quantity }]` (1–100 items).
  - Batch rules per line as for stock transactions (`items.N.batch_no` errors). `source` becomes each
    receipt's counterparty and `delivery_note_no` its voucher no.
  - `client_reference` works like on stock transactions: a repeat returns the existing note with 200.
  - who: `sdp_staff` (own facility) and `admin`, facility active — same as recording transactions.
- `POST /delivery-notes/{id}/confirm` — posts every item as a `receipt` through the ledger, all or
  nothing; a ledger rule failure is a 422 naming the line (`items.N.field`, or `received_date` for
  back-dating). Each item gets `stock_transaction_id`. 422 if not a draft.
- `POST /delivery-notes/{id}/reject` — body `reason?`; drafts only.
- Response `data`: `{ id, facility_id, delivery_note_no, source, received_date, status, capture_method,
  comments, client_reference, created_by_name, confirmed_by_name, confirmed_at, rejected_by_name,
  rejected_at, rejection_reason, created_at, items: [{ id, product: { id, name, sku, unit_of_measure },
  batch_no, expiry_date, quantity, stock_transaction_id }] }`.

## Rollups (LGA / State / Federal — read only)
- `GET /lgas/{id}/stock-summary` — aggregated balances + flagged facilities across the LGA
- `GET /states/{id}/stock-summary` — aggregated across LGAs
- `GET /federal/stock-summary` — aggregated across states
- Each rollup response includes: total on-hand per product, count of
  facilities in `low_stock` / `expiring_soon` / `expired` / `stock_out`
  state, and a drill-down list of the child nodes sorted worst-first.
- Who: LGA — own LGA and above; State — own state, federal, admin; Federal — federal, admin.
  Children and facilities are always limited to the caller's scope.
- LGA (computed live from `stock_balances`):
  ```
  { "data": {
      "node": { "level": "lga", id, name, "parent": { "level": "state", id, name } },
      "child_count": 3,
      "facility_count": 3,                                                  // same as child_count at LGA level
      "facility_counts": { stock_out, expired, low_stock, expiring_soon },   // facilities with ≥1 product so flagged
      "facility_status": { stock_out, low_stock, reorder, ok, no_data },     // facilities by most serious issue, each once
      "products": [{ product, quantity_on_hand, usable_quantity, expired_quantity,
                     facility_counts: {…}, facilities_needing_reorder }],
      "children": [{ "level": "facility", id, name, type, is_active, product_count,
                     flag_counts: {…},            // this facility's products carrying each flag
                     last_transaction_date,       // most recent Stock Card entry (YYYY-MM-DD) or null
                     needs_reorder_count,         // products at/below reorder level
                     flagged_products: [<stock-balances entry>] }]   // worst first
  } }
  ```
- State and Federal: the same top-level shape one level up, aggregated from
  `facility_product_status` (see DATABASE_SCHEMA.md). `node` is
  `{ level: "state", id, name, parent: { level: "country", id: null, name: "Nigeria" } }` or
  `{ level: "country", id: null, name: "Nigeria", parent: null }`. `child_count` counts LGAs / states;
  `facility_count` counts facilities beneath. Children are areas rather than facilities:
  ```
  "children": [{ "level": "lga" | "state", id, name,
                 geopolitical_zone,            // states only, else null
                 facility_count, reporting_facility_count,   // reporting = ≥1 product on the Stock Card
                 flag_counts: {…},             // facilities here with ≥1 product so flagged
                 needs_reorder_count,          // facilities with ≥1 product at/below reorder level
                 last_transaction_date,
                 stock_out_products: [{ product: { id, name, sku }, facility_count }] }]   // top 3
  ```
  Sorted worst-first like the LGA children (stock-outs, then expired, low, expiring). Every child
  in scope is listed, including ones with no facilities yet.
- `facility_status` rule (all levels): no_data if nothing recorded; else stock_out if any product is
  stocked out; else low_stock; else reorder if any product is at/below EOP or has expired stock; else ok.

## Recording activity
- `GET /facilities/{id}/stock-activity`, `GET /lgas/{id}/stock-activity`, `GET /states/{id}/stock-activity`,
  `GET /federal/stock-activity`
  (query: `weeks`, 4–52, default 12, ending with the current week) —
  Stock Card entries per week, for dashboard charts. Counts entries, not
  quantities (units differ across products):
  ```
  { "data": {
      "weeks": [{ "week_start": "2026-09-21", received, issued, other }],  // Monday-start weeks, oldest first
      "totals": { received, issued, other },
      "last_transaction_date": "2026-09-25" | null
  } }
  ```
  `received` = receipt + transfer_in; `issued` = issue + transfer_out;
  `other` = losses, adjustments and physical counts. The LGA variant only
  counts facilities within the caller's scope; so do State and Federal.

## Alerts
- `GET /alerts` (scoped to caller's node and below; filters: alert_type, severity, status,
  facility_id, page, per_page) — most severe first, then newest. Without `status`, returns
  alerts needing attention (`open` + `acknowledged`). Paginated like the ledger history:
  ```
  { "data": [{ id, alert_type, severity, status,
               condition_active,              // false once the stock situation has cleared
               facility: { id, name }, product: { id, name, sku, unit_of_measure },
               batch: { id, batch_no, expiry_date } | null,   // expiry alerts only
               created_at, acknowledged_at, acknowledged_by_name,
               resolved_at, resolved_by_name }],              // resolved_by_name null = auto-resolved
    "meta": { "pagination": { current_page, per_page, total, last_page } } }
  ```
  An unread count for the bell is `GET /alerts?status=open&per_page=1` → `meta.pagination.total`.
- `POST /alerts/{id}/acknowledge` — open → acknowledged; no-op if already acknowledged;
  422 if resolved. Returns the alert.
- `POST /alerts/{id}/resolve` — closes it; no-op if already resolved. Returns the alert.
- Alerts are raised and auto-resolved by the backend only (see `alerts` in
  DATABASE_SCHEMA.md); clients never create them.

## Notifications (mobile)
Push is sent through FCM (Firebase Admin SDK, credentials in `FIREBASE_CREDENTIALS`, default
`storage/app/firebase-credentials.json`, never committed) when `AlertEngine` raises a **new** alert,
to the `sdp_staff` of that facility who have registered a token. Android only for now (iOS needs
APNs configured). Payload: notification `{ title, body }` on Android channel `stock-alerts`, and
data `{ alert_id, alert_type, url: "stockcard://alerts?focus=<alert_id>" }` for the deep link.
Tokens FCM reports as invalid are cleared. LGA / State / Federal digests are not built yet.

- `POST /users/me/fcm-token` — body `{ token: string | null }`; stores the signed-in user's FCM token (null clears it,
  e.g. on sign-out). 204. The app sends it on sign-in and every foreground, since tokens rotate.
- `GET /notifications` — in-app list
- `POST /notifications/{id}/read`

## Standard response shape
```json
{ "data": ..., "meta": { "pagination": { ... } } }
```
Errors: `{ "message": "...", "errors": { "field": ["..."] } }` with 4xx.

## Auth scoping middleware (backend implementation note)
A single `ScopeToHierarchy` middleware/policy resolves the caller's
allowed facility/LGA/state id set once per request and every query in the
controller/service layer filters through it — controllers never trust a
client-supplied id without checking it's within that set.

Implemented as `App\Support\HierarchyScope` (the one definition of "own
node and below"). `ScopeToHierarchy` binds it per request for list
filtering, and `FacilityPolicy`, `LgaPolicy`, `StatePolicy` and
`StockTransactionPolicy` use it to authorize single records. An
out-of-scope id → 403; an unknown id → 404; no/invalid token → 401.
