const TOKEN_KEY = 'inventory.mobile.token';

/** Web preview fallback for secure.ts (SecureStore is native-only). */
export const tokenStore = {
  get: async () => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: async (token: string) => {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      // storage blocked: token lives in memory for this tab
    }
  },
  clear: async () => {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      // ignore
    }
  },
};
