import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { ApiError } from '../services/api';
import { ProfilePage } from './ProfilePage';

const mocks = vi.hoisted(() => ({ setUser: vi.fn(), getProfile: vi.fn(), update: vi.fn() }));
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' }, setUser: mocks.setUser }) }));
vi.mock('../services/auth', () => ({ AuthError: class extends Error {}, refreshProfile: mocks.getProfile, updateUserProfile: mocks.update }));
const profile = { uid: 'u1', nombre: 'Ana', apellido: 'Pérez', username: 'ana_perez', email: 'ana@example.test', avatarUrl: null };
const response = { uid: 'u1', profileStatus: 'complete', profile };
function openProfile() { return render(<RouterProvider router={createMemoryRouter([{ path: "/", element: <ProfilePage /> }])} />); }
function click(name: string) { fireEvent.click(screen.getByRole('button', { name })); }
function change(label: string, value: string) { fireEvent.change(screen.getByLabelText(label), { target: { value } }); }
async function edit() { openProfile(); fireEvent.click(await screen.findByRole('button', { name: 'Editar perfil' })); mocks.setUser.mockClear(); }
function error(status: number, code: string) { return new ApiError(status, { success: false, code, message: code }); }

beforeEach(() => {
  vi.resetAllMocks();
  const setResult = (result: object) => ({ ...result, isCurrent: () => true });
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value(this: HTMLDialogElement) { this.open = true; } },
    close: { configurable: true, value(this: HTMLDialogElement, value = '') {
      if (!this.open) return;
      this.returnValue = value;
      this.open = false;
      this.dispatchEvent(new Event('close'));
    } },
  });
  mocks.getProfile.mockResolvedValue(setResult({ response, user: { id: "u1", username: profile.username } }));
  mocks.update.mockResolvedValue(setResult({ user: { id: 'u1', name: 'Ana María' }, profile: { ...profile, nombre: 'Ana María' } }));
});
afterEach(cleanup);

describe('US-04', () => {
  it('announces loading and renders confirmed data and a dashboard link', async () => {
    openProfile();
    expect(screen.getByRole('status')).toHaveTextContent('Cargando perfil');
    expect(await screen.findByText(profile.email)).toBeInTheDocument();
    expect(screen.getByText(profile.username)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mis salas' })).toHaveAttribute('href', '/dashboard');
    expect(mocks.getProfile).toHaveBeenCalledWith("u1");
    expect(mocks.setUser).toHaveBeenCalledWith(expect.objectContaining({ username: profile.username }));
  });

  it('distinguishes inconsistency from an incomplete profile and retries', async () => {
    mocks.getProfile.mockRejectedValueOnce(error(409, 'PROFILE_INCONSISTENT'));
    mocks.getProfile.mockResolvedValueOnce({ response: { uid: 'u1', profileStatus: 'incomplete', profile: null }, isCurrent: () => true });
    openProfile();
    expect(await screen.findByRole('alert')).toHaveTextContent('requiere revisión');
    click('Reintentar');
    expect(await screen.findByRole('link', { name: 'Completar perfil' })).toHaveAttribute('href', '/completar-username');
  });

  it('reports invalid session without hiding it as an incomplete profile', async () => {
    mocks.getProfile.mockRejectedValueOnce(error(401, 'AUTH_INVALID'));
    openProfile();
    expect(await screen.findByRole('alert')).toHaveTextContent('Tu sesión expiró');
    expect(screen.queryByRole('link', { name: 'Completar perfil' })).not.toBeInTheDocument();
  });

  it('keeps email read-only and cancels a clean draft', async () => {
    await edit();
    expect(screen.getByLabelText('Correo electrónico')).toHaveAttribute('readonly');
    change('Nombre', ' Ana ');
    click('Cancelar');
    expect(screen.getByRole('button', { name: 'Editar perfil' })).toBeInTheDocument();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('validates empty names and rejects an invalid username before sending', async () => {
    await edit();
    change('Nombre', ' ');
    change('Apellido', '');
    change('Nombre de usuario', 'ana.perez');
    click('Guardar cambios');
    expect(screen.getByLabelText('Nombre')).toHaveAccessibleDescription('Escribe entre 1 y 100 caracteres.');
    expect(screen.getByLabelText('Apellido')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Nombre de usuario')).toHaveAttribute('aria-invalid', 'true');
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('sends changed fields, waits for confirmation and updates auth context once', async () => {
    let finish!: (value: unknown) => void;
    mocks.update.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    await edit();
    change('Nombre', ' Ana María ');
    change('Apellido', 'Gómez');
    change('Nombre de usuario', 'ana_gomez');
    click('Guardar cambios');
    expect(screen.getByRole('status')).toHaveTextContent('Guardando cambios');
    expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled();
    fireEvent.submit(screen.getByLabelText('Nombre').closest('form')!);
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith({ nombre: 'Ana María', apellido: 'Gómez', username: 'ana_gomez' });
    expect(mocks.setUser).not.toHaveBeenCalled();
    const user = { id: 'u1', name: 'Ana María' };
    finish({ user, isCurrent: () => true, profile: { ...profile, nombre: 'Ana María', apellido: 'Gómez', username: 'ana_gomez' } });
    expect(await screen.findByText('Cambios guardados.')).toBeInTheDocument();
    expect(mocks.setUser).toHaveBeenCalledWith(user);
    click('Volver al perfil');
    expect(screen.getByText('ana_gomez')).toBeInTheDocument();
  });

  it('leaves navigation blocked until the pending PATCH has updated context', async () => {
    let finish!: (value: unknown) => void;
    mocks.update.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const router = createMemoryRouter([
      { path: '/', element: <ProfilePage /> },
      { path: '/dashboard', element: <h1>Dashboard</h1> },
    ]);
    render(<RouterProvider router={router} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Editar perfil' }));
    mocks.setUser.mockClear();
    change('Nombre', 'Elena');
    click('Guardar cambios');
    fireEvent.click(screen.getByRole('link', { name: 'Mis salas' }));
    expect(router.state.location.pathname).toBe('/');
    expect(screen.getByRole('status')).toHaveTextContent('Guardando cambios');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.setUser).not.toHaveBeenCalled();

    const user = { id: 'u1', name: 'Elena' };
    await act(async () => finish({ user, isCurrent: () => true, profile: { ...profile, nombre: 'Elena' } }));
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeVisible();
    expect(mocks.setUser).toHaveBeenCalledExactlyOnceWith(user);
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith({ nombre: 'Elena' });
  });

  it('attaches a conflict to username and keeps the draft through a network failure and retry', async () => {
    mocks.update.mockRejectedValueOnce(error(409, 'USERNAME_TAKEN')).mockRejectedValueOnce(new TypeError('network'));
    await edit();
    change('Nombre', 'Ana María');
    change('Nombre de usuario', 'otro_user');
    click('Guardar cambios');
    expect(await screen.findByRole('alert')).toHaveTextContent('ya está en uso');
    expect(screen.getByLabelText('Nombre de usuario')).toHaveAccessibleDescription('Ese nombre de usuario ya está en uso.');
    change('Nombre de usuario', 'ana_perez');
    click('Guardar cambios');
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos guardar');
    expect(screen.getByLabelText('Nombre')).toHaveValue('Ana María');
    expect(mocks.setUser).not.toHaveBeenCalled();
    click('Reintentar');
    expect(await screen.findByText('Cambios guardados.')).toBeInTheDocument();
  });

  it('preserves avatar compatibility and sends null to remove an existing image', async () => {
    mocks.getProfile.mockResolvedValue({ isCurrent: () => true, response: { ...response, profile: { ...profile, avatarUrl: 'https://example.test/image.png' } } });
    await edit();
    const avatar = screen.getByLabelText('Avatar HTTPS (opcional)');
    fireEvent.click(screen.getByText('Opciones de avatar'));
    fireEvent.change(avatar, { target: { value: 'http://example.test/image.png' } });
    click('Guardar cambios');
    expect(avatar).toHaveAttribute('aria-invalid', 'true');
    expect(mocks.update).not.toHaveBeenCalled();
    fireEvent.change(avatar, { target: { value: '' } });
    expect(avatar.closest('details')).toHaveAttribute('open');
    click('Guardar cambios');
    expect(await screen.findByText('Cambios guardados.')).toBeInTheDocument();
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith({ avatarUrl: null });
  });

  it('keeps the draft when the backend refuses a change without verified email', async () => {
    mocks.update.mockRejectedValueOnce(error(403, 'EMAIL_NOT_VERIFIED'));
    await edit();
    change('Nombre', 'Ana María');
    click('Guardar cambios');
    expect(await screen.findByRole('alert')).toHaveTextContent('Verifica tu correo');
    expect(screen.getByLabelText('Nombre')).toHaveValue('Ana María');
    expect(mocks.setUser).not.toHaveBeenCalled();
  });

  it('confirms discard and restores confirmed values', async () => {
    await edit();
    change('Nombre', 'Borrador');
    click('Cancelar');
    expect(screen.getByRole('dialog', { name: '¿Descartar cambios?' })).toBeInTheDocument();
    click('Seguir editando');
    expect(screen.getByLabelText('Nombre')).toHaveValue('Borrador');
    click('Cancelar');
    click('Descartar');
    click('Editar perfil');
    expect(screen.getByLabelText('Nombre')).toHaveValue('Ana');
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('keeps account deletion visible and unavailable', async () => {
    openProfile();
    fireEvent.click(await screen.findByRole('button', { name: 'Eliminar cuenta' }));
    expect(screen.getByRole('dialog', { name: '¿Eliminar tu cuenta?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sí, eliminar cuenta' })).toBeDisabled();
    click('Cancelar');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
