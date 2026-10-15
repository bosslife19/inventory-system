# Roles & Permissions

| Capability | sdp_staff | lga_officer | state_officer | federal_officer | admin |
|---|---|---|---|---|---|
| Record stock transaction (own facility) | ✅ | ❌ | ❌ | ❌ | ✅ |
| Record stock transaction (own store) | — | ✅ (LGA store) | ✅ (state store) | ✅ (national store) | ✅ (any) |
| Dispatch from own store to the level below | ❌ | ✅ (to SDPs in LGA) | ✅ (to LGA stores + SDPs in state) | ✅ (to state stores) | ✅ |
| View a store's stock/history | ❌ | ✅ (own LGA store) | ✅ (own + LGA stores in state) | ✅ (any) | ✅ |
| View own facility stock/history | ✅ | ✅ (any facility in LGA) | ✅ (any facility in state) | ✅ (any facility) | ✅ |
| View LGA rollup | ❌ | ✅ (own LGA) | ✅ (any LGA in state) | ✅ | ✅ |
| View State rollup | ❌ | ❌ | ✅ (own state) | ✅ | ✅ |
| View Federal rollup | ❌ | ❌ | ❌ | ✅ | ✅ |
| Scan / submit delivery note | ✅ | ✅ (own store) | ✅ (own store) | ✅ (own store) | ✅ |
| Confirm / reject delivery note | ✅ (own facility) | ✅ (own store) | ✅ (own store) | ✅ (own store) | ✅ |
| View delivery notes | ✅ (own facility) | ✅ (any facility in LGA) | ✅ (any facility in state) | ✅ (any facility) | ✅ |
| View / acknowledge / resolve alerts | ✅ (own facility) | ✅ (any facility in LGA) | ✅ (any facility in state) | ✅ (any facility) | ✅ |
| Receive push alerts | ✅ (own facility) | ✅ (LGA-level digest) | ✅ (state-level digest) | ✅ (national digest) | ✅ |
| Manage product catalog | ❌ | ❌ | ❌ | ❌ | ✅ |
| Manage facilities (SDPs; states/LGAs come from the seed, stores are automatic) | ❌ | ❌ | ❌ | ❌ | ✅ |
| Manage users | ❌ | ✅ (staff of SDPs in own LGA) | ✅ (LGA officers in own state) | ✅ (state officers) | ✅ (everyone) |
| Change own password | ✅ | ✅ | ✅ | ✅ | ✅ |
| Reports & CSV export | ✅ (own facility) | ✅ (own LGA, its store, its SDPs) | ✅ (own state and below) | ✅ (national and below) | ✅ |

Each LGA, state and the nation has one **store** (a facility with
`store_level` set) — the officers of that node keep its Stock Card, just as
SDP staff keep theirs. Everything else officers see stays read-only.

Accounts, products and facilities are deactivated, never deleted, so the
Stock Card history that references them stays intact. New accounts and
reset passwords are temporary and must be changed at the next sign-in.

Everything is additionally scoped by hierarchy: an `lga_officer` for LGA
X can never see facility data outside LGA X, even read-only, regardless
of the endpoint.

Enforce this with Laravel Policies per model (`FacilityPolicy`,
`StockTransactionPolicy`, ...) plus the `ScopeToHierarchy` middleware
described in `API_CONTRACT.md` — don't rely on frontend route guards
alone, they're a UX nicety, not the security boundary.
