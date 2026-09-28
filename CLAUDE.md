# CLAUDE.md — Root Orchestration Guide

This is a **monorepo** for a national health/product supply-chain inventory
system for Nigeria, modeled on the standard paper "Stock Card" / "Bin Card"
used at Service Delivery Points (SDPs), rolled up through LGA → State →
Federal.

If you are Claude Code and you were opened at the root of this repo, read
this file first, then read the sub-project `CLAUDE.md` for whichever part
you're about to touch. Never edit two sub-projects' business logic in the
same commit unless the task is explicitly cross-cutting (e.g. changing the
API contract).

## What this system does

- **SDP (facility) level**: front-line staff record receipts, issues,
  losses/adjustments and physical counts per product/batch — this is a
  digital Stock Card. They see their own stock, expiry status, and reorder
  suggestions.
- **LGA level**: read-only rollup of every SDP in the LGA (aggregate stock,
  flagged facilities, consolidated reorder needs).
- **State level**: rollup of every LGA in the state.
- **Federal level**: rollup of every state — national visibility.
- **Mobile app**: SDP staff scan an incoming delivery note (photo/barcode),
  the parsed line items become a draft receipt transaction for review, plus
  push notifications for low stock / expiring / expired stock.

## Repo layout

```
inventory-system/
  docs/                 <- SOURCE OF TRUTH for schema, API, roles, roadmap
  backend/               Laravel API (single source of truth for data)
  web/                    React dashboard (SDP/LGA/State/Federal views)
  mobile/                 React Native app (SDP staff, field use)
  shared/types/           Generated API types consumed by web + mobile
  scripts/                Setup / codegen scripts
```

## Non-negotiable rules for Claude Code

1. **`docs/API_CONTRACT.md` and `docs/DATABASE_SCHEMA.md` are the contract.**
   If a change requires adding/renaming a field or endpoint, update the doc
   in the same commit as the backend change, *before* touching web/mobile.
2. **Backend is the single source of truth for stock balances.** Never
   compute running balances client-side and persist them — always trust
   `stock_balances` from the API. Client apps may compute *display-only*
   projections (e.g. "days of stock left") but must not write them back.
3. **Role-based scoping happens server-side**, via a policy/middleware layer
   (see `backend/CLAUDE.md`), never trust a client-sent facility/LGA/state
   id for authorization — only for filtering within what the user is
   already scoped to.
4. **Every stock-affecting write is a transaction row, never an update.**
   `stock_balances` is a derived/materialized table recomputed from
   `stock_transactions`. This preserves the audit trail the paper Stock
   Card guarantees today — do not "fix" a balance by editing history.
5. **Offline-first on mobile.** SDPs frequently have poor connectivity.
   Mobile writes (deliveries, counts) must queue locally and sync, not
   assume a live connection.

## Working across sub-projects

Run Claude Code from this root directory so it can see all three apps at
once for cross-cutting work (e.g. "add a `notes` field to receipts" touches
backend migration + API contract + web form + mobile form + shared types).
For a single-app task (styling a dashboard screen, say), `cd web/` and
work with just that `CLAUDE.md` in context to save tokens.

## Build order

See `docs/ROADMAP.md`. Short version: backend + web for SDP/LGA first
(that's where the paper Stock Card is actually replaced), then State/
Federal read-only dashboards, then mobile + push notifications + delivery
scanning last, since mobile depends on the API contract being stable.
