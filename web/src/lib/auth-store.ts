import { create } from 'zustand'

// The Sanctum bearer token is the only auth state kept client-side; the user
// itself is server state (GET /auth/me via React Query).

const KEY = 'inventory.token'

function read(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

function write(token: string | null) {
  try {
    if (token) localStorage.setItem(KEY, token)
    else localStorage.removeItem(KEY)
  } catch {
    // Storage blocked (private mode etc.) — token lives in memory for this tab.
  }
}

interface AuthState {
  token: string | null
  /**
   * True after an explicit sign-out: the login screen then shouldn't send the
   * next person back to the previous user's page. False when the session
   * expired, where returning to the same page is what the user wants.
   */
  signedOut: boolean
  setToken: (token: string) => void
  clear: (reason: 'signed_out' | 'expired') => void
}

export const useAuthStore = create<AuthState>((set) => ({
  token: read(),
  signedOut: false,
  setToken: (token) => {
    write(token)
    set({ token, signedOut: false })
  },
  clear: (reason) => {
    write(null)
    set({ token: null, signedOut: reason === 'signed_out' })
  },
}))
