import { Outlet, useLocation } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { Footer } from '../components/Footer';
import { Header } from '../components/Header';
import { useOptionalAuth } from '../auth/AuthContext';
export function MainLayout() {
  const { pathname } = useLocation();
  const auth = useOptionalAuth();
  const main = useRef<HTMLElement>(null);
  const previous = useRef(pathname);
  const isAuthPage = pathname === '/login' || pathname === '/registro' || pathname === '/completar-username' || pathname === '/verificar-correo';
  const isRegisterPage = pathname === '/registro';
  const isDashboardPage = pathname === '/dashboard';
  const isRoomPage = /^\/salas\/(?!crear$|unirse$)[^/]+$/.test(pathname);
  const isPanelPage = isDashboardPage || (Boolean(auth?.user?.username) && !isAuthPage && !isRoomPage);
  useEffect(() => { if (previous.current !== pathname) { main.current?.focus(); previous.current = pathname; } }, [pathname]);
  return <div className={`app-shell${isAuthPage ? ' auth-shell' : ''}${isRegisterPage ? ' register-shell' : ''}${isDashboardPage ? ' dashboard-shell' : isPanelPage ? ' panel-shell' : ''}${isRoomPage ? ' room-app-shell' : ''}`}><a className="skip-link" href="#main-content">Saltar al contenido</a><Header /><main ref={main} className="main-content" id="main-content" tabIndex={-1}><Outlet /></main><Footer /></div>;
}
