import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AccessibilityPage, EmailVerificationPage, HelpPage, LoggedOutPage, NotFoundPage, ProfilePage, RecoveryPage } from './PlaceholderPages';

const mocks = vi.hoisted(() => ({
  setUser: vi.fn(),
  refreshCurrentUser: vi.fn(),
  resendVerification: vi.fn(),
  resetPassword: vi.fn(),
  updateUserProfile: vi.fn(),
  deleteUserAccount: vi.fn(),
}));
const user = { id: 'u1', name: 'Ana', apellido: 'Martínez', username: 'ana_user', email: 'ana@test.edu', avatarUrl: null, emailVerified: false };
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user, setUser: mocks.setUser }) }));
vi.mock('../services/auth', () => ({
  AuthError: class AuthError extends Error {},
  refreshCurrentUser: mocks.refreshCurrentUser,
  resendVerification: mocks.resendVerification,
  resetPassword: mocks.resetPassword,
  updateUserProfile: mocks.updateUserProfile,
  deleteUserAccount: mocks.deleteUserAccount,
  completeProfile: vi.fn(),
}));
vi.mock('../services/api', () => ({ ApiError: class ApiError extends Error {}, api: {} }));

function LocationProbe() { return <span data-testid="location">{useLocation().pathname}</span>; }
function renderPage(element: ReactNode) { return render(<MemoryRouter><LocationProbe />{element}</MemoryRouter>); }

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('PlaceholderPages', () => {
  it('renders the complete help center and public informational pages', () => {
    renderPage(<HelpPage />);
    expect(screen.getByRole('heading', { name: 'Ayuda' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Tu cuenta' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Salas de estudio' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Chat y controles' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Si algo no funciona' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Recuperar contraseña' })).toHaveAttribute('href', '/recuperar-contrasena');
    cleanup();
    renderPage(<AccessibilityPage />);
    expect(screen.getByRole('heading', { name: 'Accesibilidad' })).toBeInTheDocument();
    cleanup();
    renderPage(<LoggedOutPage />);
    expect(screen.getByRole('heading', { name: 'Sesión cerrada' })).toBeInTheDocument();
    cleanup();
    renderPage(<NotFoundPage />);
    expect(screen.getByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument();
  });

  it('checks email verification and supports resending the message', async () => {
    mocks.refreshCurrentUser.mockResolvedValue({ emailVerified: true });
    mocks.resendVerification.mockResolvedValue(undefined);
    renderPage(<EmailVerificationPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Ya verifiqué mi correo' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/dashboard'));
    expect(mocks.setUser).toHaveBeenCalledWith(expect.objectContaining({ emailVerified: true }));

    cleanup();
    mocks.refreshCurrentUser.mockResolvedValue({ emailVerified: false });
    renderPage(<EmailVerificationPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Ya verifiqué mi correo' }));
    expect(await screen.findByRole('status')).toHaveTextContent('todavía no está verificado');
    fireEvent.click(screen.getByRole('button', { name: 'Reenviar correo' }));
    expect(await screen.findByRole('status')).toHaveTextContent('nuevo correo');
  });

  it('recovers a password and reports service errors', async () => {
    mocks.resetPassword.mockResolvedValue(undefined);
    renderPage(<RecoveryPage />);
    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'ana@test.edu' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar enlace' }));
    expect(await screen.findByRole('status')).toHaveTextContent('recibirás instrucciones');
    expect(mocks.resetPassword).toHaveBeenCalledWith('ana@test.edu');

    cleanup();
    mocks.resetPassword.mockRejectedValue(new Error('No disponible'));
    renderPage(<RecoveryPage />);
    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'ana@test.edu' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar enlace' }));
    expect(await screen.findByRole('status')).toHaveTextContent('No disponible');
  });

  it('updates profile data and confirms account deletion', async () => {
    mocks.updateUserProfile.mockResolvedValue({ user: { ...user, name: 'Ana María' } });
    mocks.deleteUserAccount.mockResolvedValue(undefined);
    renderPage(<ProfilePage />);
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Ana María' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Perfil actualizado');
    expect(mocks.setUser).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar cuenta' }));
    expect(screen.getByRole('dialog', { name: '¿Eliminar tu cuenta?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar cuenta' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sí, eliminar cuenta' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/login'));
  });
});
