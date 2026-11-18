import { createBrowserRouter, createRoutesFromElements, Navigate, Route, RouterProvider } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { AuthProvider } from './auth/AuthContext';
import { MainLayout } from './layouts/MainLayout';
import { AccessibilityPage, CompleteUsernamePage, EmailVerificationPage, HelpPage, LoggedOutPage, NotFoundPage, RecoveryPage } from './pages/PlaceholderPages';
import { LoginPage, RegisterPage } from './pages/AuthPages';
import { DashboardPage } from './pages/DashboardPage';
import { ProfilePage } from './pages/ProfilePage';
import { RoomPage } from './pages/RoomPage';
import { RoomCreationSession } from './pages/RoomCreation';
import { RoomEntryPage } from './pages/RoomEntryPage';
import { ProtectedRoute } from './components/ProtectedRoute';
import { PublicOnlyRoute } from './components/PublicOnlyRoute';

const routes = createRoutesFromElements(
  <Route element={<MainLayout />}>
    <Route element={<Navigate replace to="/login" />} path="/" />
    <Route element={<PublicOnlyRoute><RegisterPage /></PublicOnlyRoute>} path="/registro" />
    <Route element={<PublicOnlyRoute><LoginPage /></PublicOnlyRoute>} path="/login" />
    <Route element={<ProtectedRoute allowIncomplete><CompleteUsernamePage /></ProtectedRoute>} path="/completar-username" />
    <Route element={<ProtectedRoute allowIncomplete allowUnverified><EmailVerificationPage /></ProtectedRoute>} path="/verificar-correo" />
    <Route element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} path="/dashboard" />
    <Route element={<ProtectedRoute showProfileStatus><ProfilePage /></ProtectedRoute>} path="/perfil" />
    <Route element={<ProtectedRoute><RoomEntryPage create /></ProtectedRoute>} path="/salas/crear" />
    <Route element={<ProtectedRoute><RoomEntryPage /></ProtectedRoute>} path="/salas/unirse" />
    <Route element={<ProtectedRoute><RoomPage /></ProtectedRoute>} path="/salas/:id" />
    <Route element={<HelpPage />} path="/ayuda" />
    <Route element={<AccessibilityPage />} path="/accesibilidad" />
    <Route element={<RecoveryPage />} path="/recuperar-contrasena" />
    <Route element={<LoggedOutPage />} path="/sesion-cerrada" />
    <Route element={<NotFoundPage />} path="*" />
  </Route>,
);

export default function App() {
  const [router, setRouter] = useState<ReturnType<typeof createBrowserRouter>>();
  useEffect(() => {
    const instance = createBrowserRouter(routes);
    setRouter(instance);
    return () => instance.dispose();
  }, []);
  return <AuthProvider><RoomCreationSession>{router && <RouterProvider router={router} />}</RoomCreationSession></AuthProvider>;
}
