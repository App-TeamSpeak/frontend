import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function ProtectedRoute({ children, allowIncomplete = false, allowUnverified = false, showProfileStatus = false }: { children: ReactNode; allowIncomplete?: boolean; allowUnverified?: boolean; showProfileStatus?: boolean }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="mx-auto my-9 grid w-full max-w-[560px] justify-items-start gap-3 rounded-[24px] border border-border bg-surface px-8 py-9 max-md:my-4 max-md:rounded-[20px] max-md:px-5 max-md:py-6" role="status"><span className="inline-flex min-h-[26px] items-center rounded-full border border-link/40 bg-subtle px-3 font-heading text-[11px] font-semibold tracking-[0.08em] text-link-strong">Cargando</span><strong className="font-heading text-[22px] font-semibold leading-[1.25] text-text">Cargando sesión…</strong><p className="mt-2 text-base leading-6 text-muted">Estamos verificando tu cuenta de TeamSpeak.</p></div>;
  if (!user) return <Navigate replace to="/login" />;
  if (!allowUnverified && !user.emailVerified) return <Navigate replace to="/verificar-correo" />;
  if (allowUnverified && !user.emailVerified) return children;
  if (user.profileError && !showProfileStatus) return <Navigate replace to="/perfil" />;
  if (!allowIncomplete && !showProfileStatus && !user.username) return <Navigate replace to="/completar-username" />;
  if (allowIncomplete && user.username) return <Navigate replace to="/dashboard" />;
  return children;
}
