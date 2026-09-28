# Roles & Permissions

| Capability | sdp_staff | lga_officer | state_officer | federal_officer | admin |
|---|---|---|---|---|---|
| Record stock transaction (own facility) | ✅ | ❌ | ❌ | ❌ | ✅ |
| View own facility stock/history | ✅ | ✅ (any facility in LGA) | ✅ (any facility in state) | ✅ (any facility) | ✅ |
| View LGA rollup | ❌ | ✅ (own LGA) | ✅ (any LGA in state) | ✅ | ✅ |
| View State rollup | ❌ | ❌ | ✅ (own state) | ✅ | ✅ |
| View Federal rollup | ❌ | ❌ | ❌ | ✅ | ✅ |
| Scan / submit delivery note | ✅ | ❌ | ❌ | ❌ | ✅ |
| Confirm delivery note into ledger | ✅ (own facility) | ❌ | ❌ | ❌ | ✅ |
| Receive push alerts | ✅ (own facility) | ✅ (LGA-level digest) | ✅ (state-level digest) | ✅ (national digest) | ✅ |
| Manage product catalog | ❌ | ❌ | ❌ | ❌ | ✅ |
| Manage hierarchy (states/LGAs/facilities) | ❌ | ❌ | ❌ | ❌ | ✅ |
| Manage users | ❌ | ❌ (facility staff in own LGA, optional) | ❌ | ❌ | ✅ |

Everything is additionally scoped by hierarchy: an `lga_officer` for LGA
X can never see facility data outside LGA X, even read-only, regardless
of the endpoint.

Enforce this with Laravel Policies per model (`FacilityPolicy`,
`StockTransactionPolicy`, ...) plus the `ScopeToHierarchy` middleware
described in `API_CONTRACT.md` — don't rely on frontend route guards
alone, they're a UX nicety, not the security boundary.
