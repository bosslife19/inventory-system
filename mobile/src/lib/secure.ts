import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'inventory.token';

/** The Sanctum bearer token lives in the OS keychain / keystore. */
export const tokenStore = {
  get: () => SecureStore.getItemAsync(TOKEN_KEY),
  set: (token: string) => SecureStore.setItemAsync(TOKEN_KEY, token),
  clear: () => SecureStore.deleteItemAsync(TOKEN_KEY),
};
