# CLAUDE.md — mobile (React Native, SDP staff)

Build this last (see `../docs/ROADMAP.md` Phase 4) — it depends on the
API contract being stable, since offline sync is much harder to retrofit
than to design in from the start.

## Stack
- **Expo** (managed workflow) recommended over bare React Native: you get
  camera, barcode scanning, and push notifications with far less native
  config, which matters more here than any Expo limitation you're likely
  to hit for this feature set.
- `expo-camera` + a barcode/OCR library for delivery note scanning.
- Firebase Cloud Messaging via `expo-notifications` (or
  `@react-native-firebase/messaging` if you eject) for push alerts.
- Local persistence + sync queue: WatermelonDB (built for exactly this
  offline-first pattern) or, if you want something lighter to start,
  `expo-sqlite` with a hand-rolled outbox table.
- Same generated types from `../shared/types/` as web — do not hand-write
  a second copy of the API types.

## Structure conventions
```
app/
  screens/
    StockScreen.tsx        <- current balances for the logged-in staff's facility
    RecordTransactionScreen.tsx
    ScanDeliveryScreen.tsx   <- camera capture -> POST /delivery-notes/scan -> review screen
    AlertsScreen.tsx
  lib/
    offlineQueue.ts          <- outbox: pending transactions not yet synced
    sync.ts                    <- flush outbox on connectivity regain
    push.ts                     <- FCM token registration, notification handlers
```

## Rules specific to this app

1. **Offline-first for transactions, not for delivery scanning.**
   Recording a stock transaction (receipt/issue/loss/adjustment) must work
   fully offline: write to the local outbox immediately, show it as
   "pending sync" in the UI, and flush to
   `POST /facilities/{id}/stock-transactions` when connectivity returns.
   Delivery note *scanning* (`POST /delivery-notes/scan`) requires
   connectivity since it's a server-side OCR call — degrade gracefully
   (let staff save the photo and retry scan later, or fall back to manual
   entry, which itself queues offline like any other transaction once
   turned into a delivery note).
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
