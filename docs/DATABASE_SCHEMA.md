# Database Schema (v1)

Source of truth for table names/fields. Update this file in the same
commit as any migration change. Types are illustrative (Laravel migration
shorthand), adjust as needed but keep names stable — web/mobile/shared
types depend on them.

## Hierarchy

**states**
`id, name (unique), geopolitical_zone (enum: north_central|north_east|north_west|south_east|south_south|south_west), created_at, updated_at`

**lgas**
`id, state_id (fk), name, created_at, updated_at`
unique on `(state_id, name)`

**facilities** (the SDPs, and one store per LGA / state / the nation)
`id, lga_id (nullable fk), state_id (nullable fk), name, type (enum: health_center|hospital|pharmacy|warehouse|other), store_level (nullable enum: lga|state|national), store_key (nullable string, unique), address, latitude, longitude, phone, is_active, created_at, updated_at`

> `store_level` null = an SDP, which always has `lga_id`. Otherwise the row is
> the store of a hierarchy node, keeping its own Stock Card on the same
> ledger: an LGA store has `lga_id`; a state store has `state_id` (and no
> `lga_id`); the national store has neither. `store_key` (`lga:12`,
> `state:3`, `national`) enforces one store per node; it is null for SDPs.
> Stores are created with their node (model events, and
> `Facility::ensureStores()` after the bulk hierarchy seed), named
> "<LGA> LGA Store", "<State> State Store", "National Store", type `warehouse`.
> Rollups (LGA/State/Federal summaries and activity) count SDPs only.

## Identity & access

**users**
`id, name, email, password, role (enum: sdp_staff|lga_officer|state_officer|federal_officer|admin), facility_id (nullable fk), lga_id (nullable fk), state_id (nullable fk), is_active (bool, default true), must_change_password (bool, default false), created_by (nullable fk users), fcm_token (nullable, for push), created_at, updated_at`

> Exactly one of `facility_id` / `lga_id` / `state_id` is set, matching
> `role`. `federal_officer` and `admin` have all three null.
>
> Accounts are never deleted (the ledger's `performed_by` points at them):
> `is_active = false` blocks sign-in and revokes every token.
> `must_change_password` is set when an account is created or its password
> reset by someone else (a temporary password); until the user changes it,
> the API only allows `/auth/me`, `/auth/password` and `/auth/logout`.
> Products and facilities likewise are retired with `is_active`, never deleted.

## Product catalog

**products**
`id, name, sku, category, unit_of_measure (enum: piece|tablet|capsule|sachet|ampoule|vial|bottle|tube|pair|roll|pack|box|carton|bag|kit), pack_size (nullable — pieces in each unit; required for pack|box|carton|bag|kit), requires_batch_tracking (bool), requires_cold_chain (bool), min_stock_level, max_stock_level, reorder_level (the Excel "EOP"), is_active, created_by (nullable fk users), created_at, updated_at`

> Every Stock Card quantity for a product counts `unit_of_measure`s. Any level may add a
> product (`created_by`); admins and the creator may edit it. Levels read
> **EOP < min ≤ max** (EOP 0 with min 0 allowed): usable stock at or below the EOP
> (emergency order point) raises the `low_stock` alert and its push; below min only marks
> the product as due for an order. These are the catalog defaults — each facility may set
> its own (`facility_product_levels`).

**facility_product_levels** (a facility's or store's own levels, overriding the catalog's)
`id, facility_id (fk), product_id (fk), min_stock_level, reorder_level (its EOP), max_stock_level, updated_by (nullable fk users), created_at, updated_at`
unique on `(facility_id, product_id)`

> Set by whoever keeps that Stock Card (its SDP staff, the officers of a store, admins), since
> the right EOP differs between an SDP, an LGA store, a state store and the national store.
> Same EOP < min ≤ max rule. Read by `StockStatusService` (levels, flags, alerts), the
> reorder arithmetic (max), and the stock-status / reorder reports.

**batches**
`id, product_id (fk), batch_no, manufacture_date (nullable), expiry_date, created_at, updated_at`
unique on `(product_id, batch_no)`

## Stock ledger — the digital Stock Card

**stock_transactions** (append-only; mirrors the Excel "Stock Cards" sheet row-for-row)
```
id
facility_id            fk
product_id             fk
batch_id               fk, nullable (null only if product doesn't need batch tracking)
transaction_date        date
voucher_no               string, nullable
counterparty             string, nullable  -- "Received From / Issued To"; required for receipt/issue/transfer_in/transfer_out
transaction_type         enum: receipt | issue | loss | adjustment_in | adjustment_out | physical_count | transfer_in | transfer_out
quantity                  integer  -- always positive; direction is implied by transaction_type:
                                   --   +  receipt, transfer_in, adjustment_in
                                   --   -  issue, loss, transfer_out, adjustment_out
                                   --   =  physical_count sets the balance to the counted quantity
comments                  text, nullable
performed_by              fk -> users
delivery_note_id          fk -> delivery_notes, nullable  -- set when created from a confirmed delivery note
client_reference          string(64), nullable  -- idempotency key from offline clients; unique per (facility_id, client_reference)
running_balance            integer  -- denormalized snapshot at time of insert, for fast history display.
                                    --   Scoped per facility + product (summed across batches), like the paper Stock Card.
count_difference           integer, nullable  -- physical_count only: counted minus what the batch held before
                                    --   (negative = found short). Shown in the Losses / Adjustment column.
created_at, updated_at
```

**stock_balances** (materialized, one row per facility+product+batch — updated inline by `StockLedgerService::record()` in the same DB transaction as each `stock_transactions` insert, and corrected nightly by `php artisan stock:reconcile`; see "Balance recalculation" in `ARCHITECTURE.md`)
```
id
facility_id      fk
product_id       fk
batch_id         fk, nullable
batch_key        stored generated column = COALESCE(batch_id, 0) (internal, not exposed by the API)
quantity_on_hand   integer
last_transaction_id  fk
updated_at
```
unique on `(facility_id, product_id, batch_key)` — uses `batch_key` rather than `batch_id` because
NULLs are distinct in unique indexes, which would allow duplicate rows for non-batch products.

## Delivery notes (mobile scanning flow)

**delivery_notes**
`id, facility_id (fk — the receiver), delivery_note_no (nullable), source (string, e.g. supplier/warehouse name), source_facility_id (nullable fk facilities — the store that dispatched it), dispatched_date (nullable date), received_date, status (enum: draft|confirmed|rejected), scanned_document_path (nullable, unused while OCR is on-device), capture_method (enum: manual|ocr), comments (nullable), created_by (fk users), confirmed_by (fk users, nullable), confirmed_at, rejected_by (fk users, nullable), rejected_at, rejection_reason (nullable), client_reference (nullable; unique per facility), created_at, updated_at`

**delivery_note_items**
`id, delivery_note_id (fk), product_id (fk), batch_no (nullable for non-batch-tracked products), expiry_date (nullable), quantity, stock_transaction_id (fk, nullable — set on confirmation), source_transaction_id (fk stock_transactions, nullable — the sender's issue, for a dispatch), return_transaction_id (fk stock_transactions, nullable — the receipt back onto the sender's card if the receiver rejected it), created_at, updated_at`

> On confirmation, `DeliveryNoteService` posts one `stock_transactions` row
> (type=`receipt`) per item through `StockLedgerService`, inline and all
> or nothing, auto-creating the `batches` row if needed.
> `stock_transactions.delivery_note_id` is a foreign key to `delivery_notes`.
>
> **Dispatches** (a store issuing down the chain) are delivery notes with
> `source_facility_id` set. `DispatchService` posts one `issue` per line on
> the sender's card immediately (counterparty = receiver, voucher =
> `delivery_note_no`, generated as `DSP-000123` if not given) and creates the
> receiver's note as a draft. Confirming posts the receipts as above
> (counterparty = the sender store). Rejecting posts each line back onto the
> sender's card as a `receipt` from "<receiver> (returned)".

## Reorder requests (requisitions up the chain)

**reorder_requests**
`id, facility_id (fk — who is asking: an SDP, LGA store or state store), supplier_facility_id (fk facilities — the store asked), status (pending|fulfilled|rejected|cancelled), comments (nullable), requested_by (fk users), responded_by (nullable fk users), responded_at (nullable), response_note (nullable — decline reason or note sent with the stock), delivery_note_id (nullable fk delivery_notes — the dispatch that fulfilled it), client_reference (nullable; unique per facility), created_at, updated_at`

**reorder_request_items**
`id, reorder_request_id (fk, cascade), product_id (fk), quantity_requested, quantity_supplied (nullable — set on fulfilment from the dispatch lines; 0 for a product not sent), created_at, updated_at`

> The store asked must be above the requester in its own chain: an SDP may ask its LGA
> store, its state store or the national store; an LGA store its state store or the
> national store; a state store the national store. Fulfilling = a dispatch from the
> store asked to the requester (`DispatchService`, allowed across several levels for a
> request) — issues on the supplier's card now, a draft delivery note the requester
> confirms. Numbered `REQ-000123` from the id. Each step notifies the other side
> (`notifications.type = reorder_request`).

## Consumption & reordering (the Excel "Bin Card" summary sheet)

**amc_snapshots** (Average Monthly Consumption, recomputed monthly)
`id, facility_id (fk), product_id (fk), period_month (date, first-of-month), amc_quantity (decimal, nullable), months_used (tinyint), months_of_stock (decimal, nullable), suggested_reorder_quantity (integer), created_at`
unique on `(facility_id, product_id, period_month)`

> Written by the scheduled `stock:compute-amc` early each month (re-runs
> overwrite). AMC = `issue` quantities over the last `INVENTORY_AMC_MONTHS`
> (default 3) complete months before `period_month`, divided by the number
> of those months the product was on the facility's Stock Card
> (`months_used`; a month it first appeared part-way through is excluded).
> Losses, adjustments and transfers are not consumption. Null when there is
> no complete month yet. `months_of_stock` / `suggested_reorder_quantity`
> record the position at computation time; see the reorder-suggestions
> endpoint for the live formula.

**facility_product_amcs** (a starting AMC a facility or store enters while its history is short)
`id, facility_id (fk), product_id (fk), amc_quantity (decimal), updated_by (nullable fk users), created_at, updated_at`
unique on `(facility_id, product_id)`

> For a facility or store newly onboarded. Set by whoever keeps that Stock
> Card (same rule as `facility_product_levels`). Used in place of the
> computed AMC while `amc_snapshots.months_used` < `INVENTORY_AMC_MONTHS`;
> `amc_snapshots.amc_quantity` itself always stays the computed figure.

## Alerts & notifications

**alerts**
`id, facility_id (fk), product_id (fk), batch_id (nullable fk), alert_type (enum: low_stock|expiring_soon|expired|stock_out), severity (enum: info|warning|critical), status (enum: open|acknowledged|resolved), acknowledged_at, acknowledged_by (nullable fk users), resolved_at, resolved_by (nullable fk users), condition_cleared_at, created_at, updated_at`

> Raised and auto-resolved by `AlertEngine` (after every ledger write, and
> by the scheduled `stock:refresh-status`). One alert per episode of a
> condition keyed by (facility, product, batch, alert_type): `batch_id` is
> set for `expired`/`expiring_soon` (per batch), null for `stock_out`/
> `low_stock` (per product). `condition_cleared_at` is null while the
> condition still holds — at most one such row per key. When it clears the
> engine sets it (and resolves the alert if still open, leaving
> `resolved_by` null). A user resolving an alert whose condition still
> holds suppresses it until the condition clears and recurs.
> Severity: stock_out/expired = critical, low_stock = warning,
> expiring_soon = info. `low_stock` means usable stock is at or below the EOP in force at
> that facility (its own levels, else the catalog's).

**notifications** (what each user was told — written by the backend only)
`id, user_id (fk), type (alert|digest|reorder_request), alert_id (nullable fk alerts, cascade), title, body, data (json, nullable), pushed_at (nullable), read_at (nullable), created_at, updated_at`

> `alert`: one row per new alert per person keeping that facility's Stock Card (SDP staff of
> the SDP; the LGA / State / Federal officers of a store), written by `AlertNotifier` as the
> alert is raised. `digest`: one row per LGA / State / Federal officer and admin per
> `alerts:send-digests` run (daily, 08:30 Africa/Lagos) that found new alerts in their area —
> facilities they can see, minus their own store — since their previous digest (first ever:
> the last 24 hours). `pushed_at` is set when FCM accepted the push (null: no device
> registered, or the token was dead). Not Laravel's database-notification table.

## Audit log

**audit_events** (append-only — who did what, where, when)
`id, occurred_at, actor_id (nullable fk users), action (string, e.g. stock.recorded), subject_type (nullable, e.g. stock_transaction | delivery_note | user | product | facility | alert), subject_id (nullable), facility_id, lga_id, state_id (nullable fks — where it happened), summary (string ≤ 500, human-readable), changes (json, nullable), ip (nullable)`

> Written by `App\Support\AuditLog::record()` inside the same DB transaction
> as the action. Actions: `stock.recorded`; `delivery_note.created|confirmed|rejected`;
> `dispatch.created`; `user.created|updated|deactivated|reactivated|password_reset|password_changed`;
> `auth.signed_in`; `product.created|updated|retired|reactivated`; `product.levels_set|levels_reset|amc_entered|amc_cleared` (filed at the facility); `reorder_request.created|cancelled` (at the requester), `reorder_request.fulfilled|rejected` (at the store asked);
> `facility.created|updated|closed|reopened`; `alert.acknowledged|resolved`.
> `changes` is `{ field: [before, after] }` for edits, the values set for
> creations; passwords and tokens are never included.
> Where: a facility event carries the facility, its LGA and state (a state
> store: state only; the national store: facility only); an account event
> the account's own node; a product added by an SDP / LGA / State user at their node; other catalog events none (national). Reading is scoped
> on these columns (`HierarchyScope::scopeAuditEvents`).
> History from before the log existed: `php artisan audit:backfill`
> (idempotent) logs Stock Card entries, delivery notes and accounts.

## Rollup tables

**facility_product_status** (derived — materialized stock status per facility + product)
`id, facility_id (fk), product_id (fk), quantity_on_hand, usable_quantity, expired_quantity, expiring_soon_quantity, level (enum: stock_out|low_stock (≤ EOP)|reorder (< min)|ok), flag_stock_out, flag_expired, flag_low_stock, flag_expiring_soon (bools), last_transaction_date (nullable), refreshed_at`
unique on `(facility_id, product_id)`

> The same interpretation StockStatusService gives `stock_balances`
> (usable vs expired, level, flags), stored so State/Federal rollups are
> GROUP BY queries over one small row per facility + product instead of
> reading every balance row live. Keyed at facility + product rather than
> pre-summed per LGA/state, so one table serves every level and a facility
> still counts once per flag. Refreshed by `StockStatusSnapshot` after every
> ledger write (for that product) and by the daily `stock:refresh-status`
> pass (expiry changes with the date). Never edited by hand; the facility's
> own screens and the LGA rollup still read `stock_balances` directly.

## Mapping back to the Excel template

| Excel column | Table.field |
|---|---|
| DATE | `stock_transactions.transaction_date` |
| VOUCHER NO | `stock_transactions.voucher_no` |
| RECEIVED FROM / ISSUED TO | `stock_transactions.counterparty` |
| BATCH NO | `batches.batch_no` via `stock_transactions.batch_id` |
| EXPIRY DATE | `batches.expiry_date` |
| QUANTITY RECEIVED | `stock_transactions` row with `transaction_type=receipt`, `quantity` |
| QUANTITY ISSUED | `stock_transactions` row with `transaction_type=issue`, `quantity` |
| LOSSES/ADJUSTMENT | `stock_transactions` row with `transaction_type=loss`, `adjustment_in` or `adjustment_out`; for a physical inventory (`physical_count`), its `count_difference` |
| STOCK BALANCE | `stock_transactions.running_balance` (history) / `stock_balances.quantity_on_hand` (current) |
| Min SL / Max SL / EOP | `facility_product_levels` for that facility, else `products.min_stock_level` / `max_stock_level` / `reorder_level` |
| Average Monthly Consumption | `amc_snapshots.amc_quantity`, or `facility_product_amcs.amc_quantity` while history is short |
| Quantity to order | `amc_snapshots.suggested_reorder_quantity` |
