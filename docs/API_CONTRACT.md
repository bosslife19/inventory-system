# API Contract (v1)

Base URL: `/api/v1`. Auth: Laravel Sanctum bearer tokens. Every endpoint
below is scoped server-side to the caller's organization and hierarchy node
— a query param like `?facility_id=` only *filters within* that scope, it
never expands it. Another organization's ids answer 404 (or 422 in a body).

**Organizations and plans.** Everything outside "Auth", "Platform" and
"Owner console" is an organization's own data: the platform owner gets
**403** `{ code: "owner_account" }` there. Routes marked **[paid: feature]**
answer **402** `{ message, code: "feature_unavailable", feature }` when the
caller's organization's plan doesn't include that feature (see
`organization.features` on `/auth/me`). Adding an account or a facility
past a paid tier's cap answers **402** `{ message, code: "plan_limit_reached",
limit: accounts|facilities, max }`. Members of a suspended
organization get **401** `{ code: "organization_inactive" }`.

Update this file whenever a route, field, or status code changes — it is
what web and mobile are built against, and what `shared/types/` is
generated from.

The generated OpenAPI spec (`shared/types/openapi.json`, from
`./scripts/codegen.sh`) has the exact field-level types; this file is the
human-readable contract and the rules behind it.

## Auth
- `POST /auth/login` → token. Body `email, password, device_name?`. Throttled to 6/min. Bad credentials, or a deactivated account → 422 on `email`.
  - 200 → `{ "data": { "token": "…", "user": <User> } }`. Send the token as `Authorization: Bearer …`.
- `POST /auth/register` (public) — sign-up. Body `organization_name, name, email, phone?, password, password_confirmation,
  device_name?`. Throttled to 3 per 10 min. Creates a new organization on the **free** plan (with its stores) and makes
  you its admin on the password you chose (no temporary password). 201 → same body as `/auth/login`, so you're signed
  in. Email already in use, or password < 8 characters → 422. The owner upgrades it from the console once paid.
- `POST /auth/logout` → 204, revokes the token used for the request.
- `GET /auth/me` → current user + role + hierarchy node
  - `<User>` = `{ id, name, email, role, facility_id, lga_id, state_id, node: { level: facility|lga|state|national, id, name, path: [state?, lga?, facility?] }, store: { id, name } | null }`. Clients route on `role` / `node.level`.
  - `store`: the store an LGA / State / Federal officer keeps the Stock Card of (see "Stores" below); null for SDP staff and admins. Every facility endpoint works on its id.
  - `is_active`, `must_change_password`: see below.
  - `organization`: `{ id, name, logo_url | null, plan: free|paid (in force today), tier | null, paid_until | null, days_left | null,
    renewal_due (bool: ≤ 14 days left), features: [bulk_imports|delivery_scanning|multiple_accounts|multiple_facilities|push_notifications|supply_chain],
    limits | null }`; null for the platform owner (role `owner`), whom clients send to the owner console.
  - `tier`: `{ id, name, max_facilities | null, max_accounts | null }` — the paid tier in force today; null on the free plan
    or a paid plan without limits.
  - `limits`: `{ roles_in_use: [role], facility_in_use, max_accounts | null, accounts_in_use, max_facilities | null,
    facilities_in_use }`, null when the plan has no limits. Free plan: `roles_in_use` (one active account each) and
    `facility_in_use`, `max_facilities` 1, `max_accounts` null. Paid tier: `max_accounts` (every role together) and
    `max_facilities`, `roles_in_use` empty. Warnings only — the API re-checks (402).
- `POST /auth/password` — body `current_password, password, password_confirmation`. Changes your own password
  (≥ 8 characters, different from the current one), clears `must_change_password`, and signs out your other
  devices; this token stays valid. 200 → `<User>`.
- **Temporary passwords.** While `must_change_password` is true every other endpoint answers
  **403** `{ "message": "…", "code": "password_change_required" }` — clients send the user to change it.
- **Deactivated accounts.** Their tokens are revoked; any request still made with one gets 401.
- Sign-in is refused (422 on `email`) for members of a suspended organization.

## Platform (public)
- `GET /platform` → `{ data: { name, tagline, logo_url | null } }` — the owner's own branding, for the sign-in
  screens and beside each organization's logo. Defaults: "Stock Card", "Health supply chain · Nigeria".
- `GET /platform/logo/{file}`, `GET /organizations/{id}/logo/{file}` — the images behind `logo_url`; cacheable
  forever (each upload gets a new file name). 404 for any other file name.

## Billing (Paystack; organization admins, web only — 403 for anyone else)
Admins pay for a plan tier for 1, 3, 6 or 12 months through Paystack's checkout (card, bank transfer, USSD, …).
No automatic renewals: paying again extends the plan.
- `GET /billing/plans` → `{ data: [<PlanTier>] }`, the tiers on offer, in order.
  `<PlanTier>` = `{ id, name, description | null, monthly_price (whole naira), max_facilities | null, max_accounts | null
  (null = no limit), is_active, sort_order }`. Every tier unlocks every paid feature; tiers differ by limits.
- `POST /billing/checkout` — `plan_tier_id, months (1|3|6|12)` → 201 `{ data: <Payment>, authorization_url }`.
  Send the admin to `authorization_url`; Paystack sends them back to the web app's `/billing?reference=…`
  (`PAYSTACK_CALLBACK_URL`). The price is fixed now (`monthly_price × months`). A tier no longer on offer → 422;
  a paid plan with no end date → 422 on `plan_tier_id`; Paystack down or not configured → 502 / 503
  `{ code: "payment_gateway_error" }`. Throttled to 10/min.
- `POST /billing/payments/{reference}/verify` → `{ data: <Payment> }`. Asks Paystack how a pending payment went
  and applies it; a finished one is returned as it is (nothing is applied twice). Another organization's → 404.
- `GET /billing/payments` → `{ data: [<Payment>] }`, newest 50.
  `<Payment>` = `{ id, reference, plan_tier: { id, name }, months, amount (naira), currency, status:
  pending|success|failed|abandoned, channel | null, failure_reason | null, paid_by | null, paid_at | null,
  period_start | null, period_end | null, credit_days, created_at }`.
- **Applying a payment**: the organization goes on the paid plan in that tier. The same tier carries on from its
  current last day; a different tier starts today and the old tier's days left are converted at the two monthly
  prices (`credit_days`, added to the end); a paid plan the owner set without a tier keeps its days and the tier
  follows them; on the free plan or a lapsed one it starts today. `period_end` becomes `paid_until`.
- `POST /webhooks/paystack` (public; Paystack only) — signed with `x-paystack-signature` (HMAC-SHA512 of the body
  with the secret key; wrong → 401). `charge.success` settles the payment it names, like verify; anything else → 200
  and ignored. Set it in the Paystack dashboard to `{APP_URL}/api/v1/webhooks/paystack`.

## Owner console (`/owner/*`, role `owner` only — 403 for anyone else)
The owner sees organizations, never their Stock Cards. Organizations pay online (Billing above), or the owner
records a payment made another way by setting the plan, tier and `paid_until`.
- `GET /owner/plan-tiers` → `{ data: [<PlanTier>] }`, withdrawn ones too. `POST /owner/plan-tiers` — `name,
  monthly_price (≥ 100), description?, max_facilities?, max_accounts? (empty = no limit), is_active?, sort_order?`;
  `PUT /owner/plan-tiers/{id}` — the same, all optional. A new price applies to checkouts from then on. Never
  deleted: `is_active=false` withdraws a tier (organizations on it keep it until it lapses).
- `GET /owner/organizations/{id}/payments` → `{ data: [<Payment>] }`, newest 50.
- `PUT /owner/platform` — `name, tagline?`; `POST /owner/platform/logo` (multipart `logo`); `DELETE /owner/platform/logo`.
  Each → `{ data: <Platform> }`.
- `GET /owner/organizations` → `{ data: [<Organization>] }`, newest first.
  `<Organization>` = `{ id, name, logo_url, contact_name, contact_email, contact_phone, address, plan, plan_tier_id,
  plan_tier: { id, name, max_facilities, max_accounts } | null, paid_until,
  effective_plan, days_left, features, is_active, notes, admin_count, user_count, facility_count (SDPs), created_at }`.
- `POST /owner/organizations` — `name, plan (free|paid), plan_tier_id? (empty = no limits), paid_until? (Y-m-d; empty = no end date), contact_name?,
  contact_email?, contact_phone?, address?, notes?, admin?: { name, email }` → 201
  `{ data: <Organization>, admin: <User> | null, temporary_password: string | null }`. Creates the organization's
  stores; the admin (role `admin`) signs in with the temporary password and must change it.
- `GET|PUT /owner/organizations/{id}` — same fields, all optional, plus `is_active` (false suspends: members are
  signed out everywhere and can't sign in; nothing is deleted).
- `POST /owner/organizations/{id}/logo` (multipart `logo`: PNG / JPG / WebP, ≤ 1 MB, ≤ 2000 px; SVG refused) and
  `DELETE /owner/organizations/{id}/logo` → `{ data: <Organization> }`.
- `GET /owner/organizations/{id}/admins` → `{ data: [<User>] }`; `POST` the same — `name, email` → 201
  `{ data: <User>, temporary_password }`; `PUT /owner/organizations/{id}/admins/{user}` — `is_active`;
  `POST /owner/organizations/{id}/admins/{user}/reset-password` → `{ data: <User>, temporary_password }`.
  404 for an account that isn't an admin of that organization. Admins then manage everyone else (Users below).

## Hierarchy (admin-managed, read-only for everyone else)
Lists return only what the caller can see — own node and below, never above or sideways. Not paginated.
- `GET /states` — all for federal/admin, own state for state officers, empty for LGA/SDP users
- `GET /states/{id}/lgas` — 403 unless the caller can see that state
- `GET /lgas/{id}/facilities` — 403 unless the caller can see that LGA (SDP staff can't). SDPs only; the LGA's store is not listed.
- `POST /facilities` (admin) — body `lga_id, name, type (health_center|hospital|pharmacy|warehouse|other),
  address?, latitude?, longitude?, phone?, is_active?` → 201 `<Facility>`. Name unique within the LGA.
  **[paid: multiple_facilities]** On the free plan, 402 while the organization already has an open SDP.
- `PUT /facilities/{id}` (admin) — any of the same fields except `lga_id` (a facility can't move LGA: 422).
  `is_active: false` closes it (no new Stock Card entries; history kept). Stores can't be edited (403).
  Reopening one (`is_active: true`) is a 402 on the free plan while another SDP is open.
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
  **[paid: multiple_accounts]** On the free plan, 402 while an active account with that role already exists.
- `PUT /users/{id}` — any of `name, email, role, facility_id, lga_id, state_id, is_active`. Role and node
  are re-checked together as on create. `is_active: false` deactivates the account and signs it out
  everywhere (tokens revoked, FCM token cleared); `true` reactivates it. 200 → `<User>`.
  On the free plan, reactivating an account or changing its role is a 402 while another active account has that role.
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
- `GET /products` (filter: category, is_active — `true`/`false`/`1`/`0`). Each organization has its own catalog; it is not hierarchy-scoped within it. `sku` is unique per organization.
- `<Product>` = `{ id, name, sku, category, unit_of_measure, pack_size, requires_batch_tracking, requires_cold_chain,
  min_stock_level, max_stock_level, reorder_level, is_active, created_by }` — levels are the catalog defaults.
- `POST /products` (anyone signed in — every level may add products to the shared catalog) — body `name, sku,
  category, unit_of_measure, pack_size?, requires_batch_tracking, requires_cold_chain, min_stock_level, reorder_level,
  max_stock_level, is_active?` → 201 `<Product>`, `created_by` = the caller.
  - `sku` is trimmed, upper-cased and unique.
  - `unit_of_measure` (trimmed, lower-cased) is one of `piece, tablet, capsule, sachet, ampoule, vial, bottle, tube,
    pair, roll, pack, box, carton, bag, kit` — what every Stock Card quantity of the product counts.
  - `pack_size`: pieces in each unit, 1–1,000,000; required for `pack, box, carton, bag, kit` (422 on `pack_size`),
    optional (null) for the others.
  - Levels must read **EOP < min ≤ max** — `reorder_level` (EOP) lower than `min_stock_level` unless both are 0
    (422 on `reorder_level`), `max_stock_level` ≥ min (422 on `max_stock_level`).
- `PUT /products/{id}` (admins, or the user who added it; else 403) — any subset of the same fields, checked
  together with the stored values. `is_active: false` retires the product (hidden from entry forms; history kept —
  products are never deleted). `requires_batch_tracking` can't change once the product has any Stock Card entry (422).

## Stock levels per facility (min / EOP / max)
Each SDP and store sets its own levels per product — the right EOP differs between an SDP, an LGA store, a state
store and the national store. Without its own, a facility uses the catalog's. Everything that judges stock (level,
flags, alerts and their push, reorder max, the stock-status and reorder reports) uses the levels in force there.

**Once a product has an AMC at a facility, its levels are months of that AMC instead** (buffer-stock rule):
min = ceil(AMC × `INVENTORY_MIN_MONTHS_OF_STOCK`, default 2 — the buffer stock), EOP = ceil(AMC ×
`INVENTORY_EOP_MONTHS_OF_STOCK`, default 1), max = ceil(AMC × `INVENTORY_MAX_MONTHS_OF_STOCK`, default 5 — 3 months
of resupply + the 2 months of buffer). The AMC is the same one reorder suggestions use: the latest `amc_snapshots`
row, or the entered starting AMC while that covers less than `INVENTORY_AMC_MONTHS`. The fixed levels below apply
only while a product has no AMC (or an AMC of 0) there.

- `GET /facilities/{id}/product-levels` — anyone who can see the facility. Every active product (plus retired ones
  with levels or an AMC set here), by name: `[{ product: <Product>, min_stock_level, reorder_level, max_stock_level,
  source: "facility" | "catalog", updated_by_name, updated_at, entered_amc, amc_levels }]` — the min / EOP / max here
  are the fixed levels (`updated_by_name` / `updated_at` null for `catalog`; `entered_amc` null unless a starting AMC
  was entered here). `amc_levels`: `{ amc, min_stock_level, reorder_level, max_stock_level }`, the AMC-based levels
  in force instead, or null when the product has no AMC here.
- `PUT /facilities/{id}/product-levels/{product_id}` — body `min_stock_level, reorder_level, max_stock_level`, same
  EOP < min ≤ max rule. Who: whoever records at the facility (own SDP, own store, admin), else 403. 200 → the entry
  above. The product's level, flags and alerts there are re-evaluated at once (a new alert is notified as usual).
- `DELETE /facilities/{id}/product-levels/{product_id}` — back to the catalog's levels; same who. 204.
- `PUT /facilities/{id}/product-amcs/{product_id}` — body `amc_quantity` (number ≥ 0, issues per month): a starting
  AMC for a facility or store new to the platform. Reorder suggestions and the reorder report use it until the
  facility has a full `INVENTORY_AMC_MONTHS` window (default 3) of its own history, then the computed AMC. Same who
  as levels. 200 → the product-levels entry above.
- `DELETE /facilities/{id}/product-amcs/{product_id}` — clear the entered AMC; same who. 204.

## Stock — facility level (sdp_staff and above, scoped)
- `GET /facilities/{id}/stock-balances` — current on-hand per product/batch
  - `data`: one entry per product stocked at the facility: `{ product, levels: { min_stock_level, reorder_level, max_stock_level, source: "amc" | "facility" | "catalog", amc }, quantity_on_hand, usable_quantity, expired_quantity, expiring_soon_quantity, level, flags, batches: [{ batch_id, batch_no, expiry_date, expiry_status, quantity_on_hand, last_transaction_id }] }`. Batches are listed earliest expiry first and include zero-quantity rows.
  - `levels`: the min / EOP / max in force at this facility (see "Stock levels per facility") — use these, not `product.*_level`.
  - `usable_quantity` = on hand minus expired batches. Thresholds are judged on usable stock.
  - `level`: `stock_out` (usable 0) | `low_stock` (≤ EOP — raises the alert and push) | `reorder` (< min — time to order) | `ok`.
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
  - 201 → `{ "data": { id, facility_id, product_id, batch_id, batch_no, expiry_date, transaction_date, transaction_type, quantity, running_balance, count_difference, voucher_no, counterparty, comments, performed_by, delivery_note_id, created_at } }` — `running_balance` is the facility+product total after this entry. `count_difference` is set on `physical_count` (physical inventory) rows only: the counted quantity minus what the batch held before (negative = found short); it fills the Stock Card's Losses / Adjustment column.
  - 422 also for state-dependent failures, e.g. `{"errors": {"quantity": ["Insufficient stock: 10 on hand for batch AL001."]}}`.
- `GET /facilities/{id}/reorder-suggestions` — current AMC + suggested quantity to order per product
  - `data`: one entry per product stocked at the facility, products needing an order first (then
    lowest months of stock): `{ product, usable_quantity, level, amc_quantity, amc_source, amc_months_used,
    amc_period_month, months_of_stock, max_stock_quantity, basis, suggested_quantity }`.
  - `amc_quantity` from the latest `amc_snapshots` row (null if none, or no complete month of history) —
    except that while `amc_months_used` < `INVENTORY_AMC_MONTHS`, a starting AMC entered for the product
    (`facility_product_amcs`) is used instead. `amc_source`: `"computed"`, `"entered"`, or null with no AMC.
  - `max_stock_quantity` = ceil(AMC × `INVENTORY_MAX_MONTHS_OF_STOCK`, default 5: 3 months to the next quarterly resupply + 2 months buffer stock) when there is an
    AMC > 0 (`basis: "amc"`), else the max level in force at the facility (`basis: "product_max"`).
  - `suggested_quantity` = max(0, `max_stock_quantity` − live `usable_quantity`);
    `months_of_stock` = `usable_quantity` / AMC, one decimal (null without an AMC).
  - Display-only: nothing is written back.

## Delivery notes
Scanning happens **on the device** (ML Kit text recognition in the mobile app): the photo never
leaves the phone, the parsed lines are reviewed and corrected by staff, and only the reviewed data is
sent. There is no server-side scan endpoint.

- `GET /facilities/{id}/delivery-notes` (query: `status?`, `per_page?` ≤ 100) — newest first, paginated.
- `GET /delivery-notes/{id}`
- **[paid: delivery_scanning]** `POST /facilities/{id}/delivery-notes` — create a draft, or `confirm: true` to create and confirm in
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

- **[paid: supply_chain]** `GET /facilities/{id}/dispatch-destinations` — where this store may dispatch, active, by name:
  national → state stores; state store → LGA stores and SDPs in the state; LGA store → SDPs in the LGA.
  `data`: `[<Facility>]`. 403 for SDPs and for callers who can't record at the store.
- **[paid: supply_chain]** `POST /facilities/{id}/dispatches` — body `destination_facility_id, dispatched_date, voucher_no?,
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

## Reorder requests (requisitions up the chain)
A facility asks a store above it for stock; the store fulfils it with a dispatch or declines it. Both sides are
told (push + in-app notification, type `reorder_request`, push data `{ type, reorder_request_id, direction:
"incoming" | "outgoing", facility_id, url: "stockcard://reorder-requests?focus=<id>" }`): on a new request, the
officers keeping the store asked; on fulfilment or decline, whoever keeps the requester's Stock Card.

- `<ReorderRequest>` = `{ id, number ("REQ-000123"), status: pending|fulfilled|rejected|cancelled,
  facility: { id, name, store_level }, supplier: { id, name, store_level }, comments, requested_by_name, created_at,
  responded_by_name, responded_at, response_note, delivery_note: { id, delivery_note_no, status } | null,
  items: [{ id, product: { id, name, sku, unit_of_measure, pack_size, requires_batch_tracking }, quantity_requested,
  quantity_supplied }] }`.
- **[paid: supply_chain]** `GET /facilities/{id}/reorder-suppliers` — the stores this facility may ask, nearest first: SDP → its LGA store,
  state store, national store; LGA store → state, national; state store → national. `[<Facility>]`. 403 for the
  national store and for callers who can't record at the facility.
- **[paid: supply_chain]** `POST /facilities/{id}/reorder-requests` — body `supplier_facility_id, comments?, client_reference?,
  items: [{ product_id, quantity }]` (1–100, distinct active products). Who: whoever records at the facility (own
  SDP, own store, admin); facility active. A supplier not in the list above → 422 on `supplier_facility_id`.
  201 → `<ReorderRequest>`; a repeated `client_reference` returns the existing one with 200.
- `GET /facilities/{id}/reorder-requests` (query: `direction` (`incoming` = asked of this store | `outgoing` = made by
  this facility, required), `status?`, `per_page?` ≤ 100, `page?`) — anyone who can see the facility. Pending first,
  then newest; paginated `{ data, meta: { pagination } }`. Dashboards badge with `status=pending&per_page=1`.
- `GET /reorder-requests/{id}` — anyone who can see either facility.
- **[paid: supply_chain]** `POST /reorder-requests/{id}/fulfil` — body as a dispatch without the destination: `dispatched_date, voucher_no?,
  comments?, items: [{ product_id, batch_no?, quantity }]` (what is actually sent — may differ from what was
  asked). Who: whoever records at the store asked (403 otherwise). Same ledger rules and 422s as
  `POST /facilities/{id}/dispatches`; nothing changes on failure. Sets `quantity_supplied`, `delivery_note`, status
  `fulfilled`. 422 on `status` if no longer pending.
- `POST /reorder-requests/{id}/reject` — body `reason?`; the store asked. Pending only (422 on `status`).
- `POST /reorder-requests/{id}/cancel` — the requester's side. Pending only.

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
                     needs_reorder_count,         // products below their min level
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
                 needs_reorder_count,          // facilities with ≥1 product below its min level
                 last_transaction_date,
                 stock_out_products: [{ product: { id, name, sku }, facility_count }] }]   // top 3
  ```
  Sorted worst-first like the LGA children (stock-outs, then expired, low, expiring). Every child
  in scope is listed, including ones with no facilities yet.
- `facility_status` rule (all levels): no_data if nothing recorded; else stock_out if any product is
  stocked out; else low_stock (a product at/below its EOP); else reorder if any product is below its min or has
  expired stock; else ok.

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
`GET /reports/{report}` with `report` = `stock-card` | `stock-status` | `reorder` | `expiry` | `stock-movement`. Display-only
| `stock-movement` | `period` (required: `YYYY-MM` or `YYYY-Q1`…`Q4`) | Sheet2 of the client's E-Stock Cards template, one per facility + product with entries up to the period end: opening stock (balance at the period start; "Opening from" says whether that was the physical inventory taken at the end of the last period or the uncounted system balance), received (receipts + transfers in), used (issues + transfers out), losses / adj. (signed, + adds stock; physical-inventory differences excluded), closing = opening + received − used ± losses / adj., physical inventory (the balance after the period's last entry when that is a physical inventory, else null), difference = physical − closing, AMC (as at the period end, same rule as reorder suggestions), quantity to order = max stock (AMC × `INVENTORY_MAX_MONTHS_OF_STOCK`, or the max level without AMC), quantity required = max − (physical inventory, else closing), comments. |
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
| `stock-status` | `level?` (`stock_out` / `low_stock` / `reorder` / `ok`) | One per facility + product: on hand, usable, expired, expiring soon, level ("At / below EOP", "Below min"…), the min / EOP / max it was judged against (AMC-based or fixed), last entry (`facility_product_status`). |
| `reorder` | `needs_order?` (only rows with a quantity to order) | One per facility + product: usable, AMC (latest `amc_snapshots` row, or the entered starting AMC under the same rule as reorder suggestions), months of stock, max stock, basis, quantity to order — the reorder-suggestions arithmetic. |
| `expiry` | `within_days?` (0–730, default `INVENTORY_EXPIRING_SOON_DAYS`) | One per batch on hand that has expired or expires within the window, earliest first: batch, expiry, days left, status, quantity (`stock_balances`). |

## Bulk imports (CSV)
Many rows at once, each through the same validation, authorization and service as the matching
single-item endpoint, so a row is accepted exactly when that endpoint would accept it.
**[paid: bulk_imports]** for every `POST` below; `GET /imports/{kind}` (the columns) stays free.

| `kind` | Endpoint | Who | Each row is like |
|---|---|---|---|
| `products` | `POST /imports/products` | anyone signed in | `POST /products` |
| `facilities` | `POST /imports/facilities` | admin | `POST /facilities` (state + LGA by name) |
| `users` | `POST /imports/users` | admin; officers the level below in their area | `POST /users` (state / LGA / facility by name) |
| `product-levels` | `POST /facilities/{id}/imports/product-levels` | whoever keeps that facility's / store's card | `PUT …/product-levels/{product}` and/or `PUT …/product-amcs/{product}` |
| `stock-entries` | `POST /facilities/{id}/imports/stock-entries` | same | `POST /facilities/{id}/stock-transactions`, top to bottom |

- `GET /imports/{kind}` → `{ data: { kind, for_facility, max_rows, columns: [{ name, required,
  description, example }] } }` — the template's header row (in order) and its guide.
- `POST` multipart: `file` (CSV, ≤ 2 MB, ≤ 1000 data rows), `dry_run?` (default false).
  - The file: header row first. Headers match case-insensitively with spaces or underscores
    ("Product code" = `product_code`); unknown or missing required columns → 422 on `file`. `,` or `;`
    separated, UTF-8 (BOM fine) or Windows-1252; blank lines skipped; empty cells are null. yes/no
    columns take yes/no/true/false/1/0; dates YYYY-MM-DD or DD/MM/YYYY; numbers may carry thousands
    separators. Products are found by code, places by name (`state`, `lga`, `facility`).
  - **All or nothing**: every row runs in one DB transaction; if any row is refused, or `dry_run`, it all
    rolls back. A check therefore catches within-file clashes too (a code twice, an issue before the
    receipt that covers it). Alerts / status refresh only after a commit, so a check never pushes.
  - 200 → `{ data: { kind, dry_run, committed, total_rows, failed_rows, rows: [{ row, ok, label, errors:
    [{ column, message }], temporary_password? }] } }`. `row` = line number in the file (header = 1);
    `column` = the CSV column at fault, or null. `temporary_password` only for `users` once committed —
    shown this once, as with `POST /users`.
  - 403 when the caller may not run the import at all (e.g. a non-admin importing facilities); refusals
    of single rows (wrong area, unknown LGA…) are row errors instead.
- Each written row records its own audit event, as the single-item endpoint does.

## Audit log
- `GET /audit-events` (query: `category?` (`stock` | `deliveries` | `accounts` | `catalog` | `facilities` |
  `alerts`), `action?`, `actor_id?`, `facility_id?`, `lga_id?`, `state_id?`, `from?`, `to?` (inclusive dates,
  Africa/Lagos), `q?` (words in the summary), `per_page?` ≤ 100, `page?`) — newest first, paginated
  `{ data: [<AuditEvent>], meta: { pagination } }`.
  - `<AuditEvent>` = `{ id, occurred_at, action, category, summary, actor: { id, name, role } | null,
    place: { facility, lga, state } (names, nullable), subject: { type, id }, changes }`.
  - Scope: admins and federal officers everything; state officers events in their state; LGA officers in
    their LGA (incl. its store); SDP staff at their facility. Catalog changes are national only.
  - Read-only: entries are written by the actions themselves, never through the API.

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

## Notifications
Push is sent through FCM (Firebase Admin SDK, credentials in `FIREBASE_CREDENTIALS`, default
`storage/app/firebase-credentials.json`, never committed). Android only for now (iOS needs APNs
configured); notification `{ title, body }` on Android channel `stock-alerts`. Tokens FCM reports as
invalid are cleared. Every notice is also stored as an in-app notification, pushed or not. **[paid:
push_notifications]** — on the free plan nothing is pushed; the in-app notifications still are.

- **Per alert** — when `AlertEngine` raises a **new** alert, to the active people keeping that facility's
  Stock Card: its `sdp_staff` for an SDP; the LGA / State / Federal officers of the node for its store.
  Titles: `Stock-out: ORS`, `At EOP: ORS` (low_stock = usable at or below the EOP in force there),
  `Expired batch: …`, `Expiring soon: …`. Push data `{ alert_id, alert_type, facility_id,
  url: "stockcard://alerts?focus=<alert_id>" }`.
- **Daily digest** (`alerts:send-digests`, scheduled 08:30 Africa/Lagos) — to each active LGA, State and
  Federal officer and admin: the alerts raised since their previous digest (first ever: the last 24 h) at the
  facilities they can see, minus their own store (told per alert). Nothing new → nothing sent. Title
  e.g. `Kaduna North LGA: 3 new stock alerts` (or `Kaduna State`, `Nigeria`), body
  `1 stock-out, 2 at EOP across 2 facilities.`. Push data `{ type: "digest", url: "stockcard://notifications" }`.

- `POST /users/me/fcm-token` — body `{ token: string | null }`; stores the signed-in user's FCM token (null clears it,
  e.g. on sign-out). 204. The app sends it on sign-in and every foreground, since tokens rotate. Any role.
- `GET /notifications` (query: `unread?` (`true` = unread only), `type?` (`alert` | `digest`), `per_page?` ≤ 100,
  default 30, `page?`) — the caller's own, newest first:
  `{ data: [<Notification>], meta: { pagination, unread_count } }` (`unread_count` ignores the filters).
  - `<Notification>` = `{ id, type, alert_id, title, body, payload, created_at, pushed_at, read_at }`;
    `payload` = the push data (alert) or `{ url, counts: { stock_out, expired, low_stock, expiring_soon },
    facility_count, since }` (digest). `pushed_at` null = not pushed (no device, or a dead token).
- `POST /notifications/{id}/read` → 200 `<Notification>`; keeps the first read time. Someone else's → 404.
- `POST /notifications/read-all` → 204.

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
