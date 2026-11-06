import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { MainLayout } from './layouts/MainLayout';
import { AccessibilityPage, CompleteUsernamePage, HelpPage, NotFoundPage, ProfilePage, RecoveryPage } from './pages/PlaceholderPages';
import { LoginPage, RegisterPage } from './pages/AuthPages';
import { DashboardPage } from './pages/DashboardPage';
import { RoomPage } from './pages/RoomPage';
import { RoomEntryPage } from './pages/RoomEntryPage';
import { HomePage } from './pages/HomePage';
import { VerificationPage } from './pages/VerificationPage';

export default function App() {
  return <BrowserRouter><Routes><Route element={<MainLayout />}>
    <Route element={<HomePage />} path="/" />
    <Route element={<RegisterPage />} path="/registro" />
    <Route element={<LoginPage />} path="/login" />
    <Route element={<CompleteUsernamePage />} path="/completar-username" />
    <Route element={<DashboardPage />} path="/dashboard" />
    <Route element={<ProfilePage />} path="/perfil" />
    <Route element={<RecoveryPage />} path="/recuperar-contrasena" />
    <Route element={<RoomEntryPage create />} path="/salas/crear" />
    <Route element={<RoomEntryPage />} path="/salas/unirse" />
    <Route element={<RoomPage />} path="/salas/:id" />
    <Route element={<HelpPage />} path="/ayuda" />
    <Route element={<AccessibilityPage />} path="/accesibilidad" />
    <Route element={<VerificationPage />} path="/verificacion" />
    <Route element={<NotFoundPage />} path="*" />
  </Route></Routes></BrowserRouter>;
}
