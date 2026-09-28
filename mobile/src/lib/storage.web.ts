/**
 * Web preview fallback for storage.ts: expo-sqlite's web support is alpha,
 * so the browser build uses localStorage. The app itself targets phones.
 */
function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export const storage = {
  getItem: async (key: string) => safe(() => localStorage.getItem(key), null),
  setItem: async (key: string, value: string) => safe(() => localStorage.setItem(key, value), undefined),
  removeItem: async (key: string) => safe(() => localStorage.removeItem(key), undefined),
};
