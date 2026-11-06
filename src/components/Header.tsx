import { Link, NavLink, useLocation } from 'react-router-dom';
const navigation = [{ to: '/', label: 'Inicio', end: true }, { to: '/dashboard', label: 'Mis salas' }, { to: '/verificacion', label: 'Base técnica' }, { to: '/ayuda', label: 'Ayuda' }, { to: '/perfil', label: 'Perfil' }];
export function Header() {
  const { pathname } = useLocation();
  const auth = ['/login', '/registro'].includes(pathname);
  return <header className="site-header"><div className="header-inner"><Link className="brand" to="/" aria-label="TeamSpeak · Inicio"><span aria-hidden="true">T</span>TeamSpeak</Link>{!auth && <nav aria-label="Navegación principal"><ul>{navigation.map(({ to, label, end }) => <li key={to}><NavLink end={end} to={to}>{label}</NavLink></li>)}</ul></nav>}</div></header>;
}
