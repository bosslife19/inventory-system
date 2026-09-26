# CLAUDE.md — web (React dashboard)

Read `../docs/API_CONTRACT.md` and `../docs/ROLES_AND_PERMISSIONS.md`
before building a screen — the role determines which dashboard a logged-in
user lands on.

## Stack
- React + Vite + TypeScript.
- React Query (TanStack Query) for all server state — don't duplicate
  server data into local component state beyond form drafts.
- Zustand (or React context) only for pure client/UI state (sidebar open,
  active filters).
- Recharts for rollup charts (stock levels, alert counts over time).
- API client: generated into `../shared/types/` from the backend's OpenAPI
  spec — import types from there, don't hand-write duplicate interfaces.

## Structure conventions
```
src/
  routes/
    sdp/            <- facility dashboard: current stock, record transaction, history
    lga/            <- LGA rollup: facility list, drill-down
    state/          <- state rollup: LGA list, drill-down
    federal/         <- national rollup
    delivery-notes/   <- review/confirm delivery notes (incl. ones scanned via mobile)
  components/
    stock/            <- StockBalanceTable, TransactionForm, RunningBalanceHistory
    alerts/            <- AlertBadge, AlertList
    rollup/             <- RollupSummaryCard, DrillDownTable (shared across LGA/State/Federal)
  lib/
    api-client.ts       <- thin wrapper around generated client, adds auth header
    auth.ts
```

## Rules specific to this app

1. **One dashboard shell, role-driven routing.** After login, route to
   `/sdp`, `/lga`, `/state`, or `/federal` based on `role` from
   `GET /auth/me` — don't build four separate apps.
2. **Rollup screens (`lga/`, `state/`, `federal/`) share one
   `RollupSummaryCard` + `DrillDownTable` component pair** parameterized by
   level, since the shape of the response is identical per
   `API_CONTRACT.md` — resist the urge to build three near-duplicate
   screens.
3. **The transaction form is the most important screen in this app** — it
   replaces a paper form a health worker fills daily. Keep it fast:
   product search/select, batch/expiry auto-suggested from existing
   batches for that product, quantity, optional voucher/counterparty/
   comment, then submit. Validate batch/expiry requirement client-side to
   match `products.requires_batch_tracking`, but the backend is the real
   gate.
4. **Never compute or display a stock balance the client derived itself**
   — always show `stock_balances.quantity_on_hand` or a transaction's
   `running_balance` from the API response.
5. Alerts surface as a bell icon with count + list, using
   `GET /alerts` scoped to the logged-in user automatically by the
   backend — no client-side filtering of what the user "shouldn't" see.
