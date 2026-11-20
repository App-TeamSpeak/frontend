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
  return <><header className={`site-header${isPanelPage ? ' dashboard-header' : ''}${pathname === '/registro' ? ' register-header' : ''}`}><div className="header-inner"><Link className="brand" to={brandTarget} aria-label={brandLabel}><span aria-hidden="true">T</span>TeamSpeak</Link>{showGlobalNavigation && <><nav aria-label="Navegación del panel"><ul><li><NavLink end to="/dashboard">Mis salas</NavLink></li><li><NavLink aria-label="Ayuda principal" to="/ayuda">Ayuda</NavLink></li></ul></nav><div className="header-profile-actions"><Link className="profile-avatar" to="/perfil" aria-label="Perfil">{avatarUrl && avatarUrl !== failedAvatar ? <img src={avatarUrl} alt="" referrerPolicy="no-referrer" onError={() => setFailedAvatar(avatarUrl)} /> : initials}</Link><button ref={logoutTriggerRef} className="header-logout-icon" type="button" aria-label="Cerrar sesión" title="Cerrar sesión" onClick={() => setLogoutState('confirm')}><svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1 2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></svg></button></div></>}</div></header>{logoutState !== 'idle' && <div className="logout-dialog-backdrop"><div className="logout-dialog" role="dialog" aria-modal="true" aria-labelledby="logout-title"><h2 id="logout-title">{dialogTitle}</h2>{logoutState === 'confirm' && <><p>Podrás volver a ingresar cuando quieras.</p><div className="logout-dialog-actions"><button className="button primary logout-primary" type="button" onClick={() => void confirmLogout()}>Cerrar sesión</button><button ref={logoutCancelRef} className="button secondary logout-cancel" type="button" onClick={closeLogoutDialog}>Cancelar</button></div></>}{logoutState === 'loading' && <><p role="status">Espera un momento.</p><div className="logout-dialog-actions"><button className="button primary logout-primary" type="button" disabled>Cerrando sesión…</button></div></>}{logoutState === 'error' && <><p role="alert">Revisa tu conexión y vuelve a intentarlo.</p><div className="logout-dialog-actions"><button className="button primary logout-primary" type="button" onClick={() => void confirmLogout()}>Reintentar</button><button ref={logoutCancelRef} className="button secondary logout-cancel" type="button" onClick={closeLogoutDialog}>Volver a mis salas</button></div></>}</div></div>}</>;
}
