import { createContext, useContext } from 'react'
import type { User } from './types'

export const UserContext = createContext<User | null>(null)

/** The signed-in user. Only valid below RequireAuth. */
export function useUser(): User {
  const user = useContext(UserContext)
  if (!user) throw new Error('useUser() used outside RequireAuth')
  return user
}
