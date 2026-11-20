import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { loading, user } = useAuth();

  if (loading) {
    return <div className="page-panel route-loading-panel" role="status"><span className="dashboard-loading-badge">Cargando</span><strong>Cargando sesión…</strong><p>Estamos verificando tu cuenta de TeamSpeak.</p></div>;
  }

  if (!user) return children;
  if (!user.emailVerified) return <Navigate replace to="/verificar-correo" />;
  if (user.profileError) return <Navigate replace to="/perfil" />;
  if (!user.username) return <Navigate replace to="/completar-username" />;
  return <Navigate replace to="/dashboard" />;
}
