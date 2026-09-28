import Storage from 'expo-sqlite/kv-store';

/**
 * Durable key-value storage on the device (SQLite-backed), for the offline
 * outbox and the cached server data that lets the app open without signal.
 * AsyncStorage-shaped, so the React Query persister can use it directly.
 */
export const storage = {
  getItem: (key: string) => Storage.getItemAsync(key),
  setItem: (key: string, value: string) => Storage.setItemAsync(key, value),
  removeItem: async (key: string) => {
    await Storage.removeItemAsync(key);
  },
};
