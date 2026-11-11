import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { loading, user } = useAuth();

  if (loading) {
    return <div className="route-loading" role="status">Cargando sesión…</div>;
  }

  if (!user) return children;
  if (!user.emailVerified) return <Navigate replace to="/verificar-correo" />;
  if (!user.username) return <Navigate replace to="/completar-username" />;
  return <Navigate replace to="/dashboard" />;
}
