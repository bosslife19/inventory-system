# CLAUDE.md — backend (Laravel API)

Read `../docs/DATABASE_SCHEMA.md` and `../docs/API_CONTRACT.md` before
writing any migration or route — they're the contract, not this file.

## Stack
- Laravel (latest LTS), PHP 8.3+, MySQL.
- Auth: Laravel Sanctum (SPA/token auth for web + mobile).
- **Deployment target is shared/cPanel-style hosting — see "Hosting
  constraints" in `../docs/ARCHITECTURE.md` before writing anything
  queue- or daemon-shaped.** In short: `QUEUE_CONNECTION=sync` (or
  `database`), cache/session drivers `database` or `file`, no Redis, no
  Reverb, periodic work driven by Laravel's scheduler via a single cron
  entry (`* * * * * php artisan schedule:run`), not a `queue:work`
  daemon.
- Push: Firebase Admin SDK (Kreait's `firebase-php` or similar) for FCM
  — call this inline (it's a single HTTP call to FCM, cheap enough not
  to need a queue).
- Testing: Pest.

## Structure conventions
```
app/
  Http/Controllers/Api/V1/     <- one controller per resource, matches API_CONTRACT.md
  Http/Middleware/ScopeToHierarchy.php
  Models/
  Policies/                     <- one per model needing hierarchy scoping
  Services/StockLedgerService.php   <- all balance-affecting writes go through here
  Services/AlertEngine.php
  Services/StockStatusSnapshot.php  <- facility_product_status, for State/Federal rollups
  Console/Commands/ReconcileStockBalances.php   <- scheduled, not queued
  Console/Commands/ComputeMonthlyAmc.php          <- scheduled, not queued
  Console/Commands/RefreshStockStatus.php          <- scheduled, not queued (rollup status + alerts)
database/
  migrations/
  seeders/NigeriaStatesLgasSeeder.php
  seeders/DemoDataSeeder.php
```

## Rules specific to this app

1. **Never write to `stock_balances` directly from a controller.** Every
   controller that records a transaction calls
   `StockLedgerService::record(...)`, which — inline, in one DB
   transaction, no queue involved — applies the signed delta to the
   existing balance and inserts the `stock_transactions` row with the
   resulting `running_balance`. This is an O(1) operation regardless of
   ledger length, so there's no need to offload it to a background job;
   see "Balance recalculation" in `../docs/ARCHITECTURE.md` for the exact
   algorithm per `transaction_type`. A separate scheduled command
   (`ReconcileStockBalances`, run nightly via the scheduler) re-sums the
   full ledger and corrects any drift — that's the only place a full
   table scan happens.
2. **Batch handling**: if `products.requires_batch_tracking` is true, a
   transaction without a resolvable `batch_id`/`batch_no` should be
   rejected at the request-validation layer, not silently allowed through.
3. **Hierarchy scoping is a policy, not a scope-on-request-param.** Write
   `FacilityPolicy@view`, `StockTransactionPolicy@viewAny`, etc., driven
   off `$user->role` + `$user->facility_id/lga_id/state_id`, and apply via
   `authorize()` in every controller method — don't trust query params.
4. **Delivery note confirmation is the only place receipts get created
   from mobile scanning.** OCR runs on the phone; the backend only ever
   receives lines a person has reviewed, and `DeliveryNoteService::confirm()`
   posts them through `StockLedgerService` — drafts never touch the ledger.
5. Expose an OpenAPI spec (e.g. via `dedoc/scramble`, zero-annotation) so
   `shared/types/` can be generated from it — keep route model binding and
   Form Request validation classes clean since most generators read those.

## Seeding Nigeria's hierarchy
Seed all 36 states + FCT and their LGAs once, from a public dataset
(commonly available as JSON — verify current LGA counts/boundaries before
using since minor administrative changes do happen). Don't hardcode this
list inline in a migration; keep it as a seeder input file under
`database/seeders/data/`.
