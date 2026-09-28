# Build Roadmap

Order matters: backend + web for the SDP/LGA layer first, since that's
where the paper Stock Card is actually being replaced and where you can
validate the transaction/balance model against the Excel template before
building anything else on top of it.

## Phase 0 — Scaffold (this deliverable)
- Repo structure, docs, OpenAPI contract stub.
- Laravel app boots, MySQL connected, base auth (Sanctum) working.
- React app boots, hits `/auth/me`.

## Phase 1 — Core ledger (backend + web, SDP + LGA)
- Migrations for hierarchy, products, batches, stock_transactions, stock_balances.
- Seeders: Nigeria states/LGAs (public dataset), a handful of demo facilities/products.
- `POST stock-transactions` via `StockLedgerService` (inline balance update) + scheduled `stock:reconcile`.
- Web: SDP dashboard (current stock, record transaction form, history table).
- Web: LGA dashboard (facility list with balances, flagged low/expiring items).
- Role-based auth + `ScopeToHierarchy` enforced end-to-end.
- **Milestone check**: can you fully replace one paper Stock Card for one
  product at one facility, including the running-balance history view?

## Phase 2 — Alerts & reordering
- Scheduled jobs: low stock / expiring-soon / expired / stock-out detection.
- AMC calculation job + reorder suggestion endpoint.
- In-app notifications on web (bell icon, list, acknowledge/resolve).

## Phase 3 — State & Federal rollups
- Aggregation tables/queries, State and Federal dashboard views on web.
- Drill-down: Federal → State → LGA → Facility, worst-first sorting.

## Phase 4 — Mobile app
- React Native (Expo) shell, auth, SDP-scoped views mirroring web (read + record transaction).
- Push notifications (FCM) for the alerts built in Phase 2.
- Delivery note scanning: camera capture → OCR/barcode parse → draft
  delivery note → staff review/edit → confirm → posts receipt transactions.
- Offline queue for transactions recorded with no connectivity.

## Phase 5 — Hardening
- Reporting/export (CSV/PDF) per facility and per rollup level.
- Audit log / who-changed-what view (mostly free given the append-only ledger).
- Load-test the rollup queries at realistic scale (thousands of facilities).

## Explicitly deferred (don't build until asked)
- Multi-country support (the schema is Nigeria-specific — 2-level state/LGA
  hierarchy — don't generalize prematurely).
- Supplier/procurement management beyond delivery note capture.
- SMS notification channel (push covers the mobile-first case; add SMS
  only if field feedback says push isn't reliable enough).
