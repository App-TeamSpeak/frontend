import { Outlet, useLocation } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { AccountDeletionProvider } from '../components/AccountDeletionDialog';
import { Footer } from '../components/Footer';
import { Header } from '../components/Header';
import { useOptionalAuth } from '../auth/AuthContext';
export function MainLayout() {
  const { pathname, hash } = useLocation();
  const auth = useOptionalAuth();
  const main = useRef<HTMLElement>(null);
  const previous = useRef(pathname);
  const isAuthPage = pathname === '/login' || pathname === '/registro' || pathname === '/completar-username' || pathname === '/verificar-correo' || pathname === '/recuperar-contrasena' || pathname === '/sesion-cerrada';
  const isRegisterPage = pathname === '/registro';
  const isDashboardPage = pathname === '/dashboard';
  const isRoomPage = /^\/salas\/(?!crear$|unirse$)[^/]+$/.test(pathname);
  const isPanelPage = isDashboardPage || (Boolean(auth?.user?.username) && !isAuthPage && !isRoomPage);
  useEffect(() => {
    if (previous.current !== pathname) {
      if (!hash) window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      main.current?.focus({ preventScroll: true });
      previous.current = pathname;
    }
  }, [pathname, hash]);
  const mainClass = isRoomPage
    ? 'main-content w-full flex-1 focus:outline-none focus:shadow-none'
    : isAuthPage
      ? 'main-content mx-auto w-full max-w-[1440px] flex-1 min-h-0 px-4 pt-4 pb-9 min-[1101px]:px-[5%] min-[1101px]:pt-7 focus:outline-none focus:shadow-none'
      : isPanelPage
        ? 'main-content mx-auto w-full max-w-[1440px] flex-1 px-5 pt-6 pb-9 md:px-[5%] md:pt-8 md:pb-6 focus:outline-none focus:shadow-none'
        : 'main-content mx-auto w-full max-w-[1440px] flex-1 px-5 pt-6 pb-9 md:px-[5%] md:pt-9 md:pb-12 focus:outline-none focus:shadow-none';
  return <div className={`${isAuthPage ? 'min-h-dvh' : 'min-h-screen'} flex flex-col bg-canvas${isDashboardPage ? ' min-[1101px]:h-screen min-[1101px]:min-h-0 min-[1101px]:overflow-hidden' : isPanelPage ? ' panel-shell' : ''}${isRoomPage ? ' room-app-shell' : ''}`}><a className="skip-link" href="#main-content">Saltar al contenido</a><Header /><main ref={main} className={mainClass} id="main-content" tabIndex={-1}><AccountDeletionProvider><Outlet /></AccountDeletionProvider></main><Footer /></div>;
}
