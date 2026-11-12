import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { useOptionalAuth } from '../auth/AuthContext';
export function Header() {
  const { pathname } = useLocation();
  const isDashboardPage = pathname === '/dashboard';
  const isRoomPage = /^\/salas\/(?!crear$|unirse$)[^/]+$/.test(pathname);
  const auth = useOptionalAuth();
  const isAuthPage = pathname === '/login' || pathname === '/registro' || pathname === '/completar-username' || pathname === '/verificar-correo';
  const showGlobalNavigation = Boolean(auth?.user?.username) && !isAuthPage;
  const isPanelPage = isDashboardPage || showGlobalNavigation;
  const brandTarget = isPanelPage || isRoomPage ? '/dashboard' : '/';
  const brandLabel = isPanelPage || isRoomPage ? 'TeamSpeak · Mis salas' : 'TeamSpeak · Inicio';
  const navigate = useNavigate();
  const [logoutState, setLogoutState] = useState<'idle' | 'confirm'>('idle');
  const logoutTriggerRef = useRef<HTMLButtonElement>(null);
  const logoutCancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (logoutState !== 'confirm') return;
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
  const confirmLogout = () => { auth?.logout(); setLogoutState('idle'); navigate('/login', { replace: true }); };
  return <><header className={`site-header${isPanelPage ? ' dashboard-header' : ''}${pathname === '/registro' ? ' register-header' : ''}`}><div className="header-inner"><Link className="brand" to={brandTarget} aria-label={brandLabel}><span aria-hidden="true">T</span>TeamSpeak</Link>{showGlobalNavigation && <><nav aria-label="Navegación del panel"><ul><li><NavLink end to="/dashboard">Mis salas</NavLink></li><li><NavLink aria-label="Ayuda principal" to="/ayuda">Ayuda</NavLink></li></ul></nav><div className="header-profile-actions"><Link className="profile-avatar" to="/perfil" aria-label="Perfil">{initials}</Link><button ref={logoutTriggerRef} className="header-logout-icon" type="button" aria-label="Cerrar sesión" title="Cerrar sesión" onClick={() => setLogoutState('confirm')}><svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1 2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></svg></button></div></>}</div></header>{logoutState === 'confirm' && <div className="logout-dialog-backdrop"><div className="logout-dialog" role="dialog" aria-modal="true" aria-labelledby="logout-title"><h2 id="logout-title">¿Cerrar sesión?</h2><p>Podrás volver a ingresar cuando quieras.</p><div className="logout-dialog-actions"><button ref={logoutCancelRef} className="button secondary" type="button" onClick={() => { setLogoutState('idle'); logoutTriggerRef.current?.focus(); }}>Cancelar</button><button className="button primary" type="button" onClick={confirmLogout}>Cerrar sesión</button></div></div></div>}</>;
}
