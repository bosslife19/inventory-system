#!/usr/bin/env bash
# One-time project scaffolding. Run from the inventory-system/ root.
# Requires: composer, php 8.3+, node 20+, and (for mobile) an Expo-capable
# environment. This script scaffolds each app in place — it does not
# install PHP/Node/Expo themselves.

set -e

echo "== Backend (Laravel) =="
if [ ! -f backend/artisan ]; then
  composer create-project laravel/laravel backend
else
  echo "backend/ already initialized, skipping"
fi

echo "== Web (React + Vite + TS) =="
if [ ! -f web/package.json ]; then
  npm create vite@latest web -- --template react-ts
  (cd web && npm install && npm install @tanstack/react-query zustand recharts react-router-dom)
else
  echo "web/ already initialized, skipping"
fi

echo "== Mobile (Expo) =="
if [ ! -f mobile/package.json ]; then
  npx create-expo-app@latest mobile --template
  (cd mobile && npm install expo-camera expo-notifications expo-sqlite)
else
  echo "mobile/ already initialized, skipping"
fi

echo "== Shared types =="
mkdir -p shared/types
[ -f shared/types/package.json ] || (cd shared/types && npm init -y && npm install -D openapi-typescript)

echo
echo "Done. Next steps:"
echo "  1. cd backend && cp .env.example .env && php artisan key:generate"
echo "  2. Configure database in backend/.env, then: php artisan migrate"
echo "  3. Start Claude Code at the repo root and read CLAUDE.md, then docs/ROADMAP.md Phase 1"
