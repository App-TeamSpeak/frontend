import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function ProtectedRoute({ children, allowIncomplete = false, allowUnverified = false, showProfileStatus = false }: { children: ReactNode; allowIncomplete?: boolean; allowUnverified?: boolean; showProfileStatus?: boolean }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="page-panel route-loading-panel" role="status"><span className="dashboard-loading-badge">Cargando</span><strong>Cargando sesión…</strong><p>Estamos verificando tu cuenta de TeamSpeak.</p></div>;
  if (!user) return <Navigate replace to="/login" />;
  if (!allowUnverified && !user.emailVerified) return <Navigate replace to="/verificar-correo" />;
  if (allowUnverified && !user.emailVerified) return children;
  if (user.profileError && !showProfileStatus) return <Navigate replace to="/perfil" />;
  if (!allowIncomplete && !showProfileStatus && !user.username) return <Navigate replace to="/completar-username" />;
  if (allowIncomplete && user.username) return <Navigate replace to="/dashboard" />;
  return children;
}
