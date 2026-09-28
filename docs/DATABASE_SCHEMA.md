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

**facilities** (the SDPs)
`id, lga_id (fk), name, type (enum: health_center|hospital|pharmacy|warehouse|other), address, latitude, longitude, phone, is_active, created_at, updated_at`

## Identity & access

**users**
`id, name, email, password, role (enum: sdp_staff|lga_officer|state_officer|federal_officer|admin), facility_id (nullable fk), lga_id (nullable fk), state_id (nullable fk), fcm_token (nullable, for push), created_at, updated_at`

> Exactly one of `facility_id` / `lga_id` / `state_id` is set, matching
> `role`. `federal_officer` and `admin` have all three null.

## Product catalog

**products**
`id, name, sku, category, unit_of_measure, requires_batch_tracking (bool), requires_cold_chain (bool), min_stock_level, max_stock_level, reorder_level (the Excel "EOP"), is_active, created_at, updated_at`

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
delivery_note_id          fk, nullable  -- set when created from a confirmed delivery note (FK constraint added in Phase 4 with delivery_notes)
running_balance            integer  -- denormalized snapshot at time of insert, for fast history display.
                                    --   Scoped per facility + product (summed across batches), like the paper Stock Card.
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
`id, facility_id (fk), delivery_note_no, source (string, e.g. supplier/warehouse name), received_date, status (enum: draft|confirmed|rejected), scanned_document_path (nullable), created_by (fk users), confirmed_by (fk users, nullable), created_at, updated_at`

**delivery_note_items**
`id, delivery_note_id (fk), product_id (fk), batch_no, expiry_date, quantity, created_at, updated_at`

> On `confirmed`, a backend job creates one `stock_transactions` row
> (type=`receipt`) per item, auto-creating the `batches` row if needed.

## Consumption & reordering (the Excel "Bin Card" summary sheet)

**amc_snapshots** (Average Monthly Consumption, recomputed monthly)
`id, facility_id (fk), product_id (fk), period_month (date, first-of-month), amc_quantity (decimal), months_of_stock (decimal), suggested_reorder_quantity (integer), created_at`

## Alerts & notifications

**alerts**
`id, facility_id (fk), product_id (fk), batch_id (nullable fk), alert_type (enum: low_stock|expiring_soon|expired|stock_out), severity (enum: info|warning|critical), status (enum: open|acknowledged|resolved), created_at, resolved_at`

**notifications**
`id, user_id (fk), alert_id (fk), channel (enum: push|in_app), sent_at, read_at (nullable)`

## Rollup tables (optional but recommended at scale)

**lga_stock_summary**, **state_stock_summary** — refreshed on a schedule
(or via queue listener), pre-aggregating `stock_balances` up the hierarchy
so State/Federal dashboards don't scan every facility row live. Same
shape as `stock_balances` but keyed by `lga_id`/`state_id` + `product_id`.

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
| LOSSES/ADJUSTMENT | `stock_transactions` row with `transaction_type=loss`, `adjustment_in` or `adjustment_out` |
| STOCK BALANCE | `stock_transactions.running_balance` (history) / `stock_balances.quantity_on_hand` (current) |
| Min SL / Max SL / EOP | `products.min_stock_level` / `max_stock_level` / `reorder_level` |
| Average Monthly Consumption | `amc_snapshots.amc_quantity` |
| Quantity to order | `amc_snapshots.suggested_reorder_quantity` |
