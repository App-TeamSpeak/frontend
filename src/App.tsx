import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { MainLayout } from './layouts/MainLayout';
import { AccessibilityPage, CompleteUsernamePage, EmailVerificationPage, HelpPage, LoggedOutPage, NotFoundPage, ProfilePage, RecoveryPage } from './pages/PlaceholderPages';
import { LoginPage, RegisterPage } from './pages/AuthPages';
import { DashboardPage } from './pages/DashboardPage';
import { RoomPage } from './pages/RoomPage';
import { RoomEntryPage } from './pages/RoomEntryPage';

function ProtectedRoute({ children, allowIncomplete = false, allowUnverified = false }: { children: ReactNode; allowIncomplete?: boolean; allowUnverified?: boolean }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="page-panel" role="status">Cargando sesión…</div>;
  if (!user) return <Navigate replace to="/login" />;
  if (!allowUnverified && !user.emailVerified) return <Navigate replace to="/verificar-correo" />;
  if (!allowIncomplete && !user.username) return <Navigate replace to="/completar-username" />;
  if (allowIncomplete && user.username) return <Navigate replace to="/dashboard" />;
  return children;
}

export default function App() {
  return <BrowserRouter><AuthProvider><Routes><Route element={<MainLayout />}>
    <Route element={<Navigate replace to="/login" />} path="/" />
    <Route element={<RegisterPage />} path="/registro" />
    <Route element={<LoginPage />} path="/login" />
    <Route element={<ProtectedRoute allowIncomplete><CompleteUsernamePage /></ProtectedRoute>} path="/completar-username" />
    <Route element={<ProtectedRoute allowIncomplete allowUnverified><EmailVerificationPage /></ProtectedRoute>} path="/verificar-correo" />
    <Route element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} path="/dashboard" />
    <Route element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} path="/perfil" />
    <Route element={<ProtectedRoute><RoomEntryPage create /></ProtectedRoute>} path="/salas/crear" />
    <Route element={<ProtectedRoute><RoomEntryPage /></ProtectedRoute>} path="/salas/unirse" />
    <Route element={<ProtectedRoute><RoomPage /></ProtectedRoute>} path="/salas/:id" />
    <Route element={<HelpPage />} path="/ayuda" />
    <Route element={<AccessibilityPage />} path="/accesibilidad" />
    <Route element={<RecoveryPage />} path="/recuperar-contrasena" />
    <Route element={<LoggedOutPage />} path="/sesion-cerrada" />
    <Route element={<NotFoundPage />} path="*" />
  </Route></Routes></AuthProvider></BrowserRouter>;
}
