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
- `POST /auth/login` → token. Body `email, password, device_name?`. Throttled to 6/min. Bad credentials, or a deactivated account → 422 on `email`.
  - 200 → `{ "data": { "token": "…", "user": <User> } }`. Send the token as `Authorization: Bearer …`.
- `POST /auth/logout` → 204, revokes the token used for the request.
- `GET /auth/me` → current user + role + hierarchy node
  - `<User>` = `{ id, name, email, role, facility_id, lga_id, state_id, node: { level: facility|lga|state|national, id, name, path: [state?, lga?, facility?] }, store: { id, name } | null }`. Clients route on `role` / `node.level`.
  - `store`: the store an LGA / State / Federal officer keeps the Stock Card of (see "Stores" below); null for SDP staff and admins. Every facility endpoint works on its id.
  - `is_active`, `must_change_password`: see below.
- `POST /auth/password` — body `current_password, password, password_confirmation`. Changes your own password
  (≥ 8 characters, different from the current one), clears `must_change_password`, and signs out your other
  devices; this token stays valid. 200 → `<User>`.
- **Temporary passwords.** While `must_change_password` is true every other endpoint answers
  **403** `{ "message": "…", "code": "password_change_required" }` — clients send the user to change it.
- **Deactivated accounts.** Their tokens are revoked; any request still made with one gets 401.

## Hierarchy (admin-managed, read-only for everyone else)
Lists return only what the caller can see — own node and below, never above or sideways. Not paginated.
- `GET /states` — all for federal/admin, own state for state officers, empty for LGA/SDP users
- `GET /states/{id}/lgas` — 403 unless the caller can see that state
- `GET /lgas/{id}/facilities` — 403 unless the caller can see that LGA (SDP staff can't). SDPs only; the LGA's store is not listed.
- `POST /facilities` (admin) — body `lga_id, name, type (health_center|hospital|pharmacy|warehouse|other),
  address?, latitude?, longitude?, phone?, is_active?` → 201 `<Facility>`. Name unique within the LGA.
- `PUT /facilities/{id}` (admin) — any of the same fields except `lga_id` (a facility can't move LGA: 422).
  `is_active: false` closes it (no new Stock Card entries; history kept). Stores can't be edited (403).
- `GET /facilities/{id}` — includes `store_level` (null for SDPs, else `lga|state|national`), `lga {id,name} | null` (null for state and national stores) and `state {id,name} | null` (null only for the national store)

## Users (account management)
Admins manage every account; each officer manages the accounts one level below, in their area: federal →
state officers, state officer → LGA officers in their state, LGA officer → staff of the SDPs in their LGA.
Nobody manages their own account here (403) — they use `POST /auth/password`.

- `GET /users` (query: `role?, is_active?, q?` (name/email contains)`, facility_id?, lga_id?, state_id?,
  per_page?` ≤ 100`, page?`) — the accounts the caller manages, by name, paginated
  `{ data: [<User>], meta: { pagination } }`. 403 for SDP staff.
- `POST /users` — body `name, email, role, facility_id? | lga_id? | state_id?, temporary_password?`.
  The id matching the role is required (facility = an SDP, not a store) and must be in the caller's area;
  a role the caller can't manage is a 422 on `role`. Email is trimmed, lower-cased and unique.
  201 → `{ data: <User>, temporary_password }` — generated (10 characters, no look-alike letters) unless
  given; shown only in this response. The account must change it at first sign-in.
- `PUT /users/{id}` — any of `name, email, role, facility_id, lga_id, state_id, is_active`. Role and node
  are re-checked together as on create. `is_active: false` deactivates the account and signs it out
  everywhere (tokens revoked, FCM token cleared); `true` reactivates it. 200 → `<User>`.
- `POST /users/{id}/reset-password` — sets a new temporary password, signs the account out everywhere.
  200 → `{ data: <User>, temporary_password }`.

## Stores
Every LGA, every state and the nation has one store: a facility with `store_level` set, keeping its own
Stock Card on the same ledger as the SDPs. The officers of that node record at it (receipts from suppliers,
issues to external parties, losses, adjustments, counts) through the ordinary facility endpoints below, and
dispatch stock down the chain (see "Dispatches"). Visibility follows the hierarchy: an LGA store is visible
to that LGA and above, a state store to that state and federal, the national store to federal only. SDP
staff never see stores. Rollups and their activity charts count SDPs only.

## Products
- `GET /products` (filter: category, is_active — `true`/`false`/`1`/`0`). The catalog is not hierarchy-scoped.
- `POST /products` (admin) — body `name, sku, category, unit_of_measure, requires_batch_tracking,
  requires_cold_chain, min_stock_level, reorder_level, max_stock_level, is_active?` → 201 `<Product>`.
  `sku` is trimmed, upper-cased and unique. Levels must read min ≤ reorder (EOP) ≤ max (422 on
  `reorder_level` / `max_stock_level`).
- `PUT /products/{id}` (admin) — any subset of the same fields. `is_active: false` retires the product (hidden
  from entry forms; history kept — products are never deleted). `requires_batch_tracking` can't change once
  the product has any Stock Card entry (422).

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
  - who: `sdp_staff` for their own facility, an LGA / State / Federal officer for their own store (`user.store.id`), `admin` for any; facility must be active. Otherwise 403 (checked before validation).
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
  - who: whoever may record transactions at the facility (own SDP, own store, admin), facility active.
- `POST /delivery-notes/{id}/confirm` — body `received_date?` (`YYYY-MM-DD`, not in the future; replaces
  the note's date — for a dispatch, when it actually arrived, not before `dispatched_date`). Posts every
  item as a `receipt` through the ledger, all or nothing; a ledger rule failure is a 422 naming the line
  (`items.N.field`, or `received_date` for back-dating). Each item gets `stock_transaction_id`. 422 if
  not a draft.
- `POST /delivery-notes/{id}/reject` — body `reason?`; drafts only. For a dispatch, each line goes back
  onto the sender's Stock Card as a `receipt` from "<receiver> (returned)", dated today, and the item
  gets `return_transaction_id`.
- Response `data`: `{ id, facility_id, facility: { id, name }, delivery_note_no, source,
  source_facility: { id, name } | null, dispatched_date, received_date, status, capture_method,
  comments, client_reference, created_by_name, confirmed_by_name, confirmed_at, rejected_by_name,
  rejected_at, rejection_reason, created_at, items: [{ id, product: { id, name, sku, unit_of_measure },
  batch_no, expiry_date, quantity, stock_transaction_id, source_transaction_id, return_transaction_id }] }`.

## Dispatches (store → facility below it)
A store issuing stock down the chain. The sender's side is immediate — an `issue` per line on its Stock
Card; the receiver gets a draft delivery note (`source_facility` set) and confirms or rejects it like any
delivery, so stock only lands in their balance once someone there has signed for it.

- `GET /facilities/{id}/dispatch-destinations` — where this store may dispatch, active, by name:
  national → state stores; state store → LGA stores and SDPs in the state; LGA store → SDPs in the LGA.
  `data`: `[<Facility>]`. 403 for SDPs and for callers who can't record at the store.
- `POST /facilities/{id}/dispatches` — body `destination_facility_id, dispatched_date, voucher_no?,
  comments?, client_reference?, items: [{ product_id, batch_no?, quantity }]` (1–100 items).
  - who: as for recording at the store; the facility must be a store (SDPs record an `issue`).
  - `destination_facility_id` must be one of the destinations, else 422 on that field.
  - `batch_no` required for batch-tracked products (a batch the store holds), forbidden otherwise.
  - Ledger rules apply per line (enough stock, unexpired batch, no back-dating to `dispatched_date`);
    a failure is a 422 on `items.N.field` (or `dispatched_date`) and nothing is recorded.
  - `voucher_no` becomes the note's `delivery_note_no` and each issue's voucher; `DSP-000123` (note id)
    when omitted. Each issue's counterparty is the receiver's name.
  - `client_reference` works as elsewhere: a repeat returns the existing note with 200.
  - 201 → the receiver's draft delivery note (shape above).
- `GET /facilities/{id}/dispatches` (query: `status?`, `per_page?` ≤ 100, `page?`) — what the store has
  sent, newest first, paginated like delivery notes. `status` is the receiver's: `draft` = in transit /
  not yet signed for. Anyone who can see the store.

## Rollups (LGA / State / Federal — read only, SDPs only)
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
      "node": { "level": "lga", id, name, "parent": { "level": "state", id, name }, "store": { id, name } },  // store = the node's own store
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
  `{ level: "state", id, name, parent: { level: "country", id: null, name: "Nigeria" }, store }` or
  `{ level: "country", id: null, name: "Nigeria", parent: null, store }`. `child_count` counts LGAs / states;
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
  The area variants count SDPs only; a store's own activity is
  `GET /facilities/{store id}/stock-activity`.

## Reports
`GET /reports/{report}` with `report` = `stock-card` | `stock-status` | `reorder` | `expiry`. Display-only
reads, like the dashboards; nothing is written back.

- Common query: `area` (`facility` | `lga` | `state` | `national`), `id` (the facility / LGA / state id; omit
  for national), `product_id?`, `category?`, `format?` (`json` default | `csv`), `limit?` (JSON only, ≤ 5000,
  default 2000).
- Scope: the area must be within what the caller can see (403 otherwise; 404 for an unknown id). `facility`
  may be an SDP or a store; `lga` / `state` / `national` cover SDPs only, like the rollups.
- JSON 200 → `{ data: { report, title, scope: { area, id, name }, generated_at, columns: [{ key, label,
  type: text|number|date }], rows: [{ <column key>: value }], truncated } }`. `truncated` = more rows than
  `limit`; the CSV has them all. Area reports add `state`, `lga`, `facility` columns; one-facility reports don't.
- CSV: streamed, UTF-8 with BOM (opens cleanly in Excel), header row of column labels, every row;
  `Content-Disposition` filename `<report>-<area-name>-<YYYY-MM-DD>.csv`.

| Report | Extra query | Rows (from) |
|---|---|---|
| `stock-card` | `from?`, `to?` (inclusive dates). `area` must be `facility` (else 422 on `area`). | One per ledger entry in card order (date, voucher, received from / issued to, entry type, batch, expiry, received, issued, losses / adj. (signed), balance, by, comments). With `product_id` and `from`, the first row is the opening balance carried forward. |
| `stock-status` | `level?` (`stock_out` / `low_stock` / `reorder` / `ok`) | One per facility + product: on hand, usable, expired, expiring soon, level, min / EOP / max, last entry (`facility_product_status`). |
| `reorder` | `needs_order?` (only rows with a quantity to order) | One per facility + product: usable, AMC (latest `amc_snapshots` row), months of stock, max stock, basis, quantity to order — the reorder-suggestions arithmetic. |
| `expiry` | `within_days?` (0–730, default `INVENTORY_EXPIRING_SOON_DAYS`) | One per batch on hand that has expired or expires within the window, earliest first: batch, expiry, days left, status, quantity (`stock_balances`). |

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
