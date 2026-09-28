# shared/types

**Generated** TypeScript API types, shared by `web/` and `mobile/`. Don't
edit `openapi.json` or `api.ts` by hand — regenerate them.

## Regenerate

From the repo root, after any backend route / FormRequest / Resource change:

```sh
./scripts/codegen.sh
```

That runs:
1. `php artisan scramble:export` in `backend/` → `shared/types/openapi.json`
   (spec inferred by `dedoc/scramble` from routes, FormRequests and API
   Resources — no annotations; config in `backend/config/scramble.php`).
2. `openapi-typescript openapi.json -o api.ts` here.

Commit both files with the backend change so web/mobile always build
against the contract that matches the code.

## Use

```ts
import type { components, paths } from '@shared/api'

type ProductStock = components['schemas']['ProductStockResource']
```

`web/` resolves `@shared/*` to this directory (see `web/vite.config.ts`
and `web/tsconfig.app.json`) and pairs it with `openapi-fetch` for a typed
client in `web/src/lib/api-client.ts`.

The browsable docs are served locally at `http://localhost:8000/docs/api`
while `php artisan serve` is running.
