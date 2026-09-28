# CLAUDE.md — mobile (React Native, SDP staff)

Build this last (see `../docs/ROADMAP.md` Phase 4) — it depends on the
API contract being stable, since offline sync is much harder to retrofit
than to design in from the start.

## Stack
- **Expo** (managed workflow) recommended over bare React Native: you get
  camera, barcode scanning, and push notifications with far less native
  config, which matters more here than any Expo limitation you're likely
  to hit for this feature set.
- `expo-camera` + on-device OCR (`@infinitered/react-native-mlkit-text-recognition`, Google ML Kit)
  for delivery note scanning. Needs a development build — not available in Expo Go or on web,
  where the app falls back to manual entry.
- Firebase Cloud Messaging via `expo-notifications` (or
  `@react-native-firebase/messaging` if you eject) for push alerts.
- Local persistence + sync queue: WatermelonDB (built for exactly this
  offline-first pattern) or, if you want something lighter to start,
  `expo-sqlite` with a hand-rolled outbox table.
- Same generated types from `../shared/types/` as web — do not hand-write
  a second copy of the API types.

## Structure conventions
Expo Router (SDK 57): every file under `src/app/` is a route; keep everything
else outside it. See `AGENTS.md` — check the versioned Expo docs, not memory.
```
src/
  app/
    _layout.tsx               <- fonts, persisted React Query cache, session, Stack.Protected
    sign-in.tsx
    (app)/_layout.tsx          <- signed-in stack; wires sync + push; non-facility users get a notice
    (app)/(tabs)/              <- index (Home), stock, alerts, account — custom floating TabBar
    (app)/record.tsx           <- RecordTransaction sheet (modal): saves to the outbox first
    (app)/product/[id].tsx     <- one product's Stock Card
  components/                 <- ui/ kit (Text, Card, Button, Badge, KpiTile, ...) + domain pieces
  constants/theme.ts          <- design tokens: same blue / white / black palette as web/src/index.css
  lib/
    api.ts, types.ts           <- openapi-fetch over ../shared/types (type-only imports)
    session.tsx                <- token in SecureStore; works offline with the last known user
    offlineQueue.ts            <- outbox: pending transactions not yet synced (expo-sqlite kv-store)
    sync.ts                    <- flush outbox on enqueue / reconnect / foreground / every 30s
    push.ts                    <- FCM token registration, notification tap -> /alerts?focus=<id>
    *.web.ts                   <- web-preview fallbacks (localStorage, no push)
```

## Rules specific to this app

1. **Offline-first, including delivery scanning.**
   Recording a stock transaction (receipt/issue/loss/adjustment) must work
   fully offline: write to the local outbox immediately, show it as
   "pending sync" in the UI, and flush to
   `POST /facilities/{id}/stock-transactions` when connectivity returns.
   Delivery notes are read by on-device OCR, so scanning works offline too;
   the reviewed note is queued the same way and sent to
   `POST /facilities/{id}/delivery-notes` with `confirm: true`. OCR output is
   only ever a draft: staff review every line before it is confirmed.
2. **Never let two devices' offline queues silently overwrite each
   other's effect on the same balance.** Because balances are always
   *derived* from the ledger (per `DATABASE_SCHEMA.md`), this is naturally
   safe as long as each queued item is synced as its own transaction row,
   not as a delta merged with the current on-screen balance — sync the
   action, not a snapshot.
3. **Push notification payloads should deep-link** into the relevant
   screen (e.g. `AlertsScreen` filtered to that alert), not just show a
   generic banner.
4. Register/refresh the FCM token on login and on app foreground via
   `POST /users/me/fcm-token` — tokens rotate, don't assume one persists.
