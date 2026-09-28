/**
 * API base URL, per docs/API_CONTRACT.md. Set EXPO_PUBLIC_API_URL in
 * mobile/.env — on a phone, "localhost" is the phone itself, so point it at
 * the dev machine's LAN IP (e.g. http://192.168.1.20:8001/api/v1).
 */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8001/api/v1';
