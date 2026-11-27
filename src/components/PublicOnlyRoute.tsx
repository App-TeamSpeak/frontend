import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { RouteLoadingCard } from './RouteLoadingCard';

export function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { loading, user } = useAuth();

  if (loading) {
    return <RouteLoadingCard />;
  }

  if (!user) return children;
  if (!user.emailVerified) return <Navigate replace to="/verificar-correo" />;
  if (user.profileError) return <Navigate replace to="/perfil" />;
  if (!user.username) return <Navigate replace to="/completar-username" />;
  return <Navigate replace to="/dashboard" />;
}
