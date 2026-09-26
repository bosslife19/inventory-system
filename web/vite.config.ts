import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Generated API types (../shared/types/api.ts) — see shared/types/README.md
      '@shared': fileURLToPath(new URL('../shared/types', import.meta.url)),
    },
  },
  server: {
    fs: { allow: ['..'] },
    // In dev, the Laravel API runs on :8000 (php artisan serve). In production set
    // VITE_API_URL if the API is on a different origin; otherwise same-origin /api/v1.
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
})
