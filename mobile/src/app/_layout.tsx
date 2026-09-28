import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from '@expo-google-fonts/inter';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ToastProvider } from '@/components/ui/toast';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ApiError } from '@/lib/api';
import { clearOutbox, loadOutbox } from '@/lib/offlineQueue';
import { SessionProvider, useSession } from '@/lib/session';
import { storage } from '@/lib/storage';
import { setSyncQueryClient } from '@/lib/sync';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Keep cached data a week so the app opens with the last-known stock offline.
      gcTime: 7 * 24 * 60 * 60_000,
      // Offline: serve the cache and retry later instead of failing fast.
      networkMode: 'offlineFirst',
      retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
    },
  },
});
setSyncQueryClient(queryClient);

const persister = createAsyncStoragePersister({ storage, key: 'inventory.query-cache' });

function RootNavigator() {
  const { session } = useSession();
  const signedIn = session.status === 'signedIn';

  if (session.status === 'loading') return null;
  SplashScreen.hide();

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const scheme = useColorScheme();
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  const [outboxReady, setOutboxReady] = useState(false);

  useEffect(() => {
    void loadOutbox().finally(() => setOutboxReady(true));
  }, []);

  // Signing out drops everything tied to that user on this device.
  const onSignOut = useCallback(async () => {
    queryClient.clear();
    await Promise.all([persister.removeClient(), clearOutbox()]);
  }, []);

  if (!fontsLoaded || !outboxReady) return null;

  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const c = scheme === 'dark' ? Colors.dark : Colors.light;
  const navTheme = { ...base, colors: { ...base.colors, primary: c.primary, background: c.bg, card: c.surface, text: c.text, border: c.border } };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, maxAge: 7 * 24 * 60 * 60_000 }}>
        <ThemeProvider value={navTheme}>
          <ToastProvider>
            <SessionProvider onSignOut={onSignOut}>
              <StatusBar style="light" />
              <RootNavigator />
            </SessionProvider>
          </ToastProvider>
        </ThemeProvider>
      </PersistQueryClientProvider>
    </GestureHandlerRootView>
  );
}
