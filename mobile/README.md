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

## Delivery note scanning (on-device OCR)

Home → **Scan delivery**: photograph the note (or pick a photo), and Google
ML Kit reads it **on the phone** — offline, and the photo is never uploaded.
`src/lib/delivery-parser.ts` turns the text into draft lines (product,
batch, expiry, quantity, plus the note number, supplier and date); staff
review every line against the paper, fix or add lines, then **Confirm
receipt**, which queues the note like any entry and posts one receipt per
line on the server.

OCR needs a development / production build
(`@infinitered/react-native-mlkit-text-recognition` is a native module). In
Expo Go and the web preview the scan screen falls back to typing the lines
in. Parser tests: `npm test`.

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
npm test
```
