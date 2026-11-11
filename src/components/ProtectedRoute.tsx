import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function ProtectedRoute({ children, allowIncomplete = false, allowUnverified = false }: { children: ReactNode; allowIncomplete?: boolean; allowUnverified?: boolean }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="page-panel" role="status">Cargando sesión…</div>;
  if (!user) return <Navigate replace to="/login" />;
  if (!allowUnverified && !user.emailVerified) return <Navigate replace to="/verificar-correo" />;
  if (!allowIncomplete && !user.username) return <Navigate replace to="/completar-username" />;
  if (allowIncomplete && user.username) return <Navigate replace to="/dashboard" />;
  return children;
}
