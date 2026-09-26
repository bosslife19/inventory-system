# web — Stock Card dashboard

React + Vite + TypeScript dashboard for SDP, LGA, State and Federal users.
Conventions and rules: [`CLAUDE.md`](./CLAUDE.md). API: [`../docs/API_CONTRACT.md`](../docs/API_CONTRACT.md).

## Run locally

```sh
# 1. API (from backend/)
php artisan migrate:fresh --seed   # 37 states, 774 LGAs, Kaduna demo data
php artisan serve                  # http://127.0.0.1:8000

# 2. Web (from web/)
npm install
npm run dev                        # http://localhost:5173, proxies /api → :8000
```

Demo logins (password `password`): `sdp1@demo.test` … `sdp4@demo.test`,
`lga@demo.test`, `state@demo.test`, `federal@demo.test`, `admin@demo.test`.

## How it's put together

- **Types** come from `../shared/types/api.ts` (generated — run
  `../scripts/codegen.sh` after backend contract changes). `src/lib/types.ts`
  only aliases them.
- **API client**: `src/lib/api-client.ts` — `openapi-fetch` over the generated
  paths, adds the Sanctum bearer token, clears it on 401.
- **Server state** lives in React Query (`src/lib/queries.ts`); rollups poll
  every 60s (no WebSockets on shared hosting). The only client state is the
  auth token (`src/lib/auth-store.ts`, Zustand).
- **Routing** (`src/App.tsx`): one shell; after login each role lands on
  `/sdp`, `/lga`, `/state` or `/federal`, and drills down via
  `/facilities/:id`, `/lgas/:id`, `/states/:id`. The API enforces access;
  routes only decide what to show.

## Production build

```sh
npm run build   # → dist/
```

Serve `dist/` with a fallback to `index.html` for client-side routes. If the
API is on another origin, build with `VITE_API_URL=https://api.example.org/api/v1`.
