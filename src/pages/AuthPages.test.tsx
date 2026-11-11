import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthError, continueWithGoogle, loginUser, registerUser } from '../services/auth';
import { AuthPage, isValidEmail } from './AuthPages';

const setUser = vi.fn();
vi.mock('../auth/AuthContext', () => ({ useOptionalAuth: () => ({ setUser }) }));
vi.mock('../services/auth', () => ({
  AuthError: class AuthError extends Error { code: string; constructor(code: string, message: string) { super(message); this.code = code; } },
  continueWithGoogle: vi.fn(),
  loginUser: vi.fn(),
  registerUser: vi.fn(),
}));

function LocationProbe() { return <output data-testid="location">{useLocation().pathname}</output>; }
const renderAuth = (register = false) => render(<MemoryRouter><AuthPage register={register} /><LocationProbe /></MemoryRouter>);
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('AuthPage', () => {
  it.each(['ana@test.edu', 'a@b.co'])('accepts a valid email: %s', email => expect(isValidEmail(email)).toBe(true));
  it.each(['ana', 'ana@', 'ana@@test.edu', 'ana@.edu', 'ana@edu.'])('rejects an invalid email: %s', email => expect(isValidEmail(email)).toBe(false));

  it('valida el login y permite mostrar la contraseña', () => {
    renderAuth();
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
    expect(screen.getByText('Completa el campo correo electrónico.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar contraseña' }));
    expect(screen.getByLabelText('Contraseña')).toHaveAttribute('type', 'text');
  });
  it('muestra la ayuda de contraseña en registro', () => {
    renderAuth(true);
    fireEvent.click(screen.getByRole('button', { name: '¿Qué contraseña usar?' }));
    expect(screen.getByRole('dialog', { name: 'Crea una contraseña segura' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Entendido' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('submits login, updates auth context and navigates to dashboard', async () => {
    vi.mocked(loginUser).mockResolvedValue({ user: { id: 'u1', name: 'Ana', apellido: 'M', email: 'ana@test.edu', username: 'ana_user', avatarUrl: null, emailVerified: true } });
    renderAuth();
    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'ana@test.edu' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'secret1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/dashboard'));
    expect(setUser).toHaveBeenCalled();
  });

  it('shows mapped login errors and clears them when editing', async () => {
    vi.mocked(loginUser).mockRejectedValue(new AuthError('auth/invalid-credential', 'Verifica tus datos'));
    renderAuth();
    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'ana@test.edu' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'secret1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Verifica tus datos');
    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'otra@test.edu' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('registers and sends the user to email verification', async () => {
    vi.mocked(registerUser).mockResolvedValue({ user: { id: 'u1', name: 'Ana', apellido: 'M', email: 'ana@test.edu', avatarUrl: null, emailVerified: false } });
    renderAuth(true);
    for (const [label, value] of [['Nombre', 'Ana'], ['Apellido', 'M'], ['Correo electrónico', 'ana@test.edu'], ['Contraseña', 'secret1'], ['Confirmar contraseña', 'secret1']] as const) fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/verificar-correo'));
  });

  it('validates registration password confirmation and handles a closed Google popup', async () => {
    renderAuth(true);
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByLabelText('Apellido'), { target: { value: 'M' } });
    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'ana@test.edu' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'secret1' } });
    fireEvent.change(screen.getByLabelText('Confirmar contraseña'), { target: { value: 'different' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    expect(await screen.findByText('Las contraseñas no coinciden.')).toBeInTheDocument();

    vi.mocked(continueWithGoogle).mockRejectedValue(new AuthError('auth/popup-closed-by-user', 'Cerraste la ventana'));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar con Google' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });
});
