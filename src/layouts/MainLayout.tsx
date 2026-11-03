import { Outlet } from 'react-router-dom';
import { Footer } from '../components/Footer';
import { Header } from '../components/Header';
export function MainLayout() { return <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100"><a className="skip-link" href="#main-content">Saltar al contenido</a><Header /><main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10" id="main-content"><Outlet /></main><Footer /></div>; }
