import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useOptionalAuth } from '../auth/AuthContext';
export function Header() {
  const { pathname } = useLocation();
  const isDashboardPage = pathname === '/dashboard';
  const isRoomPage = /^\/salas\/(?!crear$|unirse$)[^/]+$/.test(pathname);
  const isAuthPage = pathname === '/login' || pathname === '/registro' || pathname === '/completar-username';
  const usesSalonBrand = isDashboardPage || isRoomPage || isAuthPage;
  const brandTarget = isDashboardPage || isRoomPage ? '/dashboard' : '/login';
  const brandLabel = isDashboardPage || isRoomPage ? 'Salón · Mis salas' : 'Salón · Iniciar sesión';
  const auth = useOptionalAuth();
  const navigate = useNavigate();
  const [logoutState, setLogoutState] = useState<'idle' | 'confirm'>('idle');
  const initials = auth?.user?.name.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase() || 'US';
  const confirmLogout = () => { auth?.logout(); setLogoutState('idle'); navigate('/login', { replace: true }); };
  return <><header className={`site-header${isDashboardPage ? ' dashboard-header' : ''}${pathname === '/registro' ? ' register-header' : ''}`}><div className="header-inner"><Link className="brand" to={brandTarget} aria-label={brandLabel}><span aria-hidden="true">{usesSalonBrand ? 'S' : 'T'}</span>{usesSalonBrand ? 'Salón' : 'TeamSpeak'}</Link>{isDashboardPage && <><nav aria-label="Navegación del panel"><ul><li><NavLink end to="/dashboard">Mis salas</NavLink></li><li><NavLink aria-label="Ayuda principal" to="/ayuda">Ayuda</NavLink></li></ul></nav><Link className="profile-avatar" to="/perfil" aria-label="Perfil">{initials}</Link><button className="header-logout" type="button" onClick={() => setLogoutState('confirm')}>Cerrar sesión</button></>}</div></header>{logoutState === 'confirm' && <div className="logout-dialog-backdrop"><div className="logout-dialog" role="dialog" aria-modal="true" aria-labelledby="logout-title"><h2 id="logout-title">¿Cerrar sesión?</h2><p>Podrás volver a ingresar cuando quieras.</p><div className="logout-dialog-actions"><button className="button secondary" type="button" onClick={() => setLogoutState('idle')}>Cancelar</button><button className="button primary" type="button" onClick={confirmLogout}>Cerrar sesión</button></div></div></div>}</>;
}
