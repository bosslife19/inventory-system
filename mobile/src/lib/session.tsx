import * as Device from 'expo-device';
import { createContext, use, useCallback, useEffect, useMemo, useState } from 'react';

import { ApiError, api, setAuthToken, setUnauthorizedHandler, unwrap } from './api';
import { tokenStore } from './secure';
import { storage } from './storage';
import type { User } from './types';

const USER_KEY = 'inventory.user';

type Session =
  | { status: 'loading'; user: null }
  | { status: 'signedOut'; user: null; expired: boolean }
  | { status: 'signedIn'; user: User };

interface SessionApi {
  session: Session;
  signIn: (email: string, password: string) => Promise<void>;
  /** Clears the token, cached data and anything left in the outbox. */
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionApi | null>(null);

export function useSession(): SessionApi {
  const ctx = use(SessionContext);
  if (!ctx) throw new Error('useSession() outside SessionProvider');
  return ctx;
}

/** The signed-in user. Only valid inside the protected (app) routes. */
export function useUser(): User {
  const { session } = useSession();
  if (session.status !== 'signedIn') throw new Error('useUser() while signed out');
  return session.user;
}

/**
 * Sign-in state. A stored token is restored on launch; if the server can't
 * be reached, the last known user is used so staff can keep recording
 * offline (mobile/CLAUDE.md rule 1). Only a 401 signs them out.
 */
export function SessionProvider({ children, onSignOut }: { children: React.ReactNode; onSignOut: () => Promise<void> }) {
  const [session, setSession] = useState<Session>({ status: 'loading', user: null });

  const clearLocal = useCallback(
    async (expired: boolean) => {
      setAuthToken(null);
      await Promise.all([tokenStore.clear(), storage.removeItem(USER_KEY), onSignOut()]);
      setSession({ status: 'signedOut', user: null, expired });
    },
    [onSignOut],
  );

  useEffect(() => {
    setUnauthorizedHandler(() => void clearLocal(true));
    return () => setUnauthorizedHandler(null);
  }, [clearLocal]);

  useEffect(() => {
    (async () => {
      const token = await tokenStore.get();
      if (!token) return setSession({ status: 'signedOut', user: null, expired: false });
      setAuthToken(token);
      try {
        const user = (await unwrap(api.GET('/auth/me'))).data;
        await storage.setItem(USER_KEY, JSON.stringify(user));
        setSession({ status: 'signedIn', user });
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return clearLocal(true);
        const cached = await storage.getItem(USER_KEY);
        if (cached) setSession({ status: 'signedIn', user: JSON.parse(cached) as User });
        else setSession({ status: 'signedOut', user: null, expired: false });
      }
    })();
  }, [clearLocal]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { token, user } = (
      await unwrap(
        api.POST('/auth/login', {
          body: { email, password, device_name: Device.modelName ?? 'mobile' },
        }),
      )
    ).data;
    setAuthToken(token);
    await Promise.all([tokenStore.set(token), storage.setItem(USER_KEY, JSON.stringify(user))]);
    setSession({ status: 'signedIn', user });
  }, []);

  const signOut = useCallback(async () => {
    // Best effort: stop pushes to this device and revoke the token server-side.
    try {
      await api.POST('/users/me/fcm-token', { body: { token: null } });
      await api.POST('/auth/logout');
    } catch {
      // offline — the token still gets dropped locally
    }
    await clearLocal(false);
  }, [clearLocal]);

  const value = useMemo(() => ({ session, signIn, signOut }), [session, signIn, signOut]);
  return <SessionContext value={value}>{children}</SessionContext>;
}

/** The signed-in staff member's facility. Only valid inside the facility app (see (app)/_layout). */
export function useFacilityId(): number {
  const id = useUser().facility_id;
  if (id == null) throw new Error('useFacilityId() for a user without a facility');
  return id;
}
