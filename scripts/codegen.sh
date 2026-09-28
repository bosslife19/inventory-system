#!/usr/bin/env bash
# Regenerate shared/types from the backend's OpenAPI spec.
# Run from the inventory-system/ root after any API contract change.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"

echo "== Exporting OpenAPI spec (Scramble) =="
(cd "$root/backend" && php artisan scramble:export)

echo "== Generating TypeScript types =="
(cd "$root/shared/types" && npx openapi-typescript openapi.json -o api.ts)

echo "Done: shared/types/openapi.json, shared/types/api.ts"
