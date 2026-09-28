# Stock Card — mobile (facility staff)

Expo (SDK 57) app for SDP staff: current stock, recording receipts / issues /
losses / counts **offline-first**, stock alerts, and reorder suggestions. Same
API and design system as the web dashboard. See `CLAUDE.md` for the rules.

## Run it

```bash
npm install
cp .env.example .env        # then edit EXPO_PUBLIC_API_URL
npx expo start              # Expo Go, a dev build, or press w for the web preview
```

`EXPO_PUBLIC_API_URL` must be reachable from the phone — use your computer's
LAN IP (e.g. `http://192.168.1.20:8001/api/v1`) and serve Laravel on all
interfaces: `php artisan serve --host=0.0.0.0 --port=8001`.

Demo account (from `DemoDataSeeder`): `sdp1@demo.test` / `password`.

## Offline sync

Every entry goes to a local outbox first and syncs in order when online (on
save, on reconnect, on foreground, every 30s). Each carries a UUID sent as
`client_reference`, so a retry after a lost response is never recorded twice.
Entries the server refuses (e.g. not enough stock) appear on the Account tab
to retry or discard.

## Push notifications

The app registers its FCM token via `POST /users/me/fcm-token`. Remote push
does **not** work in Expo Go on Android (SDK 53+) — use a development build
(`npx expo run:android`, or `npx eas-cli@latest build --profile development`)
with Firebase credentials configured. Sending pushes from the backend is not
wired up yet.

## Checks

```bash
npx tsc --noEmit
npx expo lint
```
