import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { MainLayout } from './layouts/MainLayout';
import { AccessibilityPage, CompleteUsernamePage, DashboardPage, HelpPage, LoginPage, NotFoundPage, ProfilePage, RegisterPage, RoomPage } from './pages/PlaceholderPages';
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
    <Route element={<RoomPage />} path="/salas/:id" />
    <Route element={<HelpPage />} path="/ayuda" />
    <Route element={<AccessibilityPage />} path="/accesibilidad" />
    <Route element={<VerificationPage />} path="/verificacion" />
    <Route element={<NotFoundPage />} path="*" />
  </Route></Routes></BrowserRouter>;
}
