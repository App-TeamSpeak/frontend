import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { useOptionalAuth } from '../auth/AuthContext';
export function Header() {
  const { pathname } = useLocation();
  const isDashboardPage = pathname === '/dashboard';
  const isRoomPage = /^\/salas\/(?!crear$|unirse$)[^/]+$/.test(pathname);
  const auth = useOptionalAuth();
  const isAuthPage = pathname === '/login' || pathname === '/registro' || pathname === '/completar-username' || pathname === '/verificar-correo' || pathname === '/recuperar-contrasena' || pathname === '/sesion-cerrada';
  const showGlobalNavigation = Boolean(auth?.user?.username) && !isAuthPage;
  const isPanelPage = isDashboardPage || showGlobalNavigation;
  const brandTarget = isPanelPage || isRoomPage ? '/dashboard' : '/';
  const brandLabel = isPanelPage || isRoomPage ? 'TeamSpeak · Mis salas' : 'TeamSpeak · Inicio';
  const navigate = useNavigate();
  const [logoutState, setLogoutState] = useState<'idle' | 'confirm' | 'loading' | 'error'>('idle');
  const [failedAvatar, setFailedAvatar] = useState('');
  const logoutTriggerRef = useRef<HTMLButtonElement>(null);
  const logoutCancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (logoutState !== 'confirm' && logoutState !== 'error') return;
    logoutCancelRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setLogoutState('idle');
        logoutTriggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [logoutState]);
  const initials = auth?.user?.name.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase() || 'US';
  const avatarUrl = auth?.user?.avatarUrl;
  const closeLogoutDialog = () => {
    setLogoutState('idle');
    logoutTriggerRef.current?.focus();
  };
  const confirmLogout = async () => {
    setLogoutState('loading');
    try {
      await auth?.logout();
      setLogoutState('idle');
      navigate('/login', { replace: true });
    } catch {
      setLogoutState('error');
    }
  };
  const dialogTitle = logoutState === 'loading' ? 'Cerrando sesión'
    : logoutState === 'error' ? 'No pudimos cerrar tu sesión'
    : '¿Cerrar sesión?';
  const headerInnerClass = isPanelPage
    ? 'flex min-h-[76px] w-full flex-nowrap items-center justify-between gap-2 px-4 py-3 max-[359px]:flex-wrap md:gap-6 md:px-16 md:py-4'
    : 'mx-auto flex min-h-[76px] max-w-[1440px] flex-wrap items-center justify-between gap-2 px-6 py-4 md:flex-nowrap md:gap-6 md:px-[5%]';
  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `inline-flex min-h-[32px] items-center font-heading no-underline transition-colors duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none ${isActive ? 'font-semibold text-link' : 'text-muted hover:text-text'}`;
  const logoutPrimaryClass =
    'inline-flex min-h-[48px] w-full items-center justify-center rounded-[10px] border border-transparent bg-primary px-5 py-3 font-heading text-sm font-semibold text-text transition-colors duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] hover:bg-primary-hover active:enabled:translate-y-px disabled:cursor-not-allowed disabled:border-0 disabled:bg-border disabled:text-muted disabled:opacity-100 motion-reduce:transition-none motion-reduce:active:transform-none';
  const logoutCancelClass =
    'inline-flex min-h-[40px] w-full items-center justify-center rounded-[10px] border-0 bg-transparent px-3 py-2.5 font-heading text-sm font-semibold text-link transition-colors duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] hover:bg-subtle hover:text-link-strong active:enabled:translate-y-px motion-reduce:transition-none motion-reduce:active:transform-none';
  return <>
    <header className={`site-header bg-surface${isAuthPage ? ' shrink-0' : ''}`}>
      <div className={headerInnerClass}>
        <Link className={`inline-flex items-center gap-4 font-heading font-semibold ${isPanelPage ? 'min-w-0 max-md:gap-2 max-md:text-base text-lg' : 'text-lg'}`} to={brandTarget} aria-label={brandLabel}>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-primary text-text" aria-hidden="true">T</span>
          TeamSpeak
        </Link>
        {showGlobalNavigation && <>
          <nav className="max-[359px]:order-3 max-[359px]:w-full max-[359px]:basis-full" aria-label="Navegación del panel">
            <ul className="flex flex-nowrap justify-center gap-3 text-[13px] max-[359px]:gap-x-5 max-[359px]:gap-y-2 md:gap-6 md:text-sm">
              <li><NavLink className={navLinkClass} end to="/dashboard">Mis salas</NavLink></li>
              <li><NavLink className={navLinkClass} aria-label="Ayuda principal" to="/ayuda">Ayuda</NavLink></li>
            </ul>
          </nav>
          <div className="relative h-10 w-10 shrink-0 max-md:flex max-md:w-auto max-md:items-center max-md:gap-1.5">
            <Link className="grid h-10 w-10 max-md:h-9 max-md:w-9 max-md:text-[13px] shrink-0 place-items-center overflow-hidden rounded-full bg-[#dce8ff] font-heading text-sm font-semibold leading-none text-[#1d4ed8] no-underline transition-colors duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] [@media(hover:hover)_and_(pointer:fine)]:hover:bg-[#c9dcff] motion-reduce:transition-none" to="/perfil" aria-label="Perfil">
              {avatarUrl && avatarUrl !== failedAvatar ? <img className="h-full w-full object-cover" src={avatarUrl} alt="" referrerPolicy="no-referrer" onError={() => setFailedAvatar(avatarUrl)} /> : initials}
            </Link>
            <button ref={logoutTriggerRef} className="grid h-10 w-10 max-md:h-9 max-md:w-9 shrink-0 place-items-center overflow-visible rounded-full border border-border bg-transparent p-0 text-muted md:absolute md:top-0 md:left-14 transition-colors duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] [@media(hover:hover)_and_(pointer:fine)]:hover:border-link [@media(hover:hover)_and_(pointer:fine)]:hover:bg-subtle [@media(hover:hover)_and_(pointer:fine)]:hover:text-link motion-reduce:transition-none" type="button" aria-label="Cerrar sesión" title="Cerrar sesión" onClick={() => setLogoutState('confirm')}>
              <svg className="block h-5 w-5 overflow-visible" aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1 2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></svg>
            </button>
          </div>
        </>}
      </div>
    </header>
    {logoutState !== 'idle' && <div className="fixed inset-0 z-20 grid place-items-center bg-(--overlay) p-5">
      <div className="w-full max-w-[600px] max-md:max-w-[358px] rounded-[24px] border border-border bg-auth-surface px-[52px] py-[34px] max-md:p-5 shadow-[0_24px_64px_var(--dialog-shadow)]" role="dialog" aria-modal="true" aria-labelledby="logout-title">
        <h2 className="font-heading text-[32px] font-semibold leading-[40px] max-md:text-2xl max-md:leading-8" id="logout-title">{dialogTitle}</h2>
        {logoutState === 'confirm' && <>
          <p className="mt-3.5 text-base leading-6 text-muted">Podrás volver a ingresar cuando quieras.</p>
          <div className="mt-3.5 grid gap-3.5">
            <button className={logoutPrimaryClass} type="button" onClick={() => void confirmLogout()}>Cerrar sesión</button>
            <button ref={logoutCancelRef} className={logoutCancelClass} type="button" onClick={closeLogoutDialog}>Cancelar</button>
          </div>
        </>}
        {logoutState === 'loading' && <>
          <p className="mt-3.5 text-base leading-6 text-muted" role="status">Espera un momento.</p>
          <div className="mt-3.5 grid gap-3.5">
            <button className={logoutPrimaryClass} type="button" disabled>Cerrando sesión…</button>
          </div>
        </>}
        {logoutState === 'error' && <>
          <p className="mt-3.5 text-base leading-6 text-muted" role="alert">Revisa tu conexión y vuelve a intentarlo.</p>
          <div className="mt-3.5 grid gap-3.5">
            <button className={logoutPrimaryClass} type="button" onClick={() => void confirmLogout()}>Reintentar</button>
            <button ref={logoutCancelRef} className={logoutCancelClass} type="button" onClick={closeLogoutDialog}>Volver a mis salas</button>
          </div>
        </>}
      </div>
    </div>}
  </>;
}
