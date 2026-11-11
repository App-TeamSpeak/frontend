import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { getSession, logoutUser, type AuthUser } from '../services/auth';

type AuthContextValue = { user: AuthUser | null; setUser: (user: AuthUser | null) => void; logout: () => void };
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => getSession());
  const value = useMemo(() => ({ user, setUser, logout: () => { logoutUser(); setUser(null); } }), [user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth debe utilizarse dentro de AuthProvider');
  return value;
}

export function useOptionalAuth() { return useContext(AuthContext); }
