import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { configureAuth, logoutUser, subscribeToAuth, type AuthUser } from '../services/auth';
type AuthContextValue = { user: AuthUser | null; loading: boolean; setUser: (user: AuthUser | null) => void; logout: () => Promise<void> };
const AuthContext = createContext<AuthContextValue | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null); const [loading, setLoading] = useState(true);
  useEffect(() => { let active = true; let unsubscribe: (() => void) | undefined; void configureAuth().catch(() => undefined).then(() => { if (!active) return; unsubscribe = subscribeToAuth(next => { if (active) { setUser(next); setLoading(false); } }); }).catch(() => { if (active) setLoading(false); }); return () => { active = false; unsubscribe?.(); }; }, []);
  const value = useMemo(() => ({ user, loading, setUser, logout: async () => { await logoutUser(); setUser(null); } }), [loading, user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error('useAuth debe utilizarse dentro de AuthProvider'); return value; }
export function useOptionalAuth() { return useContext(AuthContext); }
