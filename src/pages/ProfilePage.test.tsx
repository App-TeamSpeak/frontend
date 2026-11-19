import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { api, ApiError } from '../services/api';
import { AccountDeletionProvider } from '../components/AccountDeletionDialog';
import { readDeletionTracking } from '../services/deletionTracking';
import { ProfilePage } from './ProfilePage';
import { ProfileEmailChange } from '../components/ProfileEmailChange';

const mocks = vi.hoisted(() => ({ identity: { uid: 'u1', providerData: [{ providerId: 'password' }] }, signedOut: false, reauthenticateDeletion: vi.fn(), clearCache: vi.fn(), canChangeEmail: undefined as boolean | undefined, requestEmail: vi.fn(), confirmEmail: vi.fn(), setUser: vi.fn(), getProfile: vi.fn(), update: vi.fn(), deleteAccount: vi.fn(), logout: vi.fn(), firebaseDelete: vi.fn(), signOut: vi.fn() }));
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', canChangeEmail: mocks.canChangeEmail }, setUser: mocks.setUser, logout: mocks.logout }) }));
vi.mock('../services/auth', () => ({ AuthError: class extends Error {}, refreshProfile: mocks.getProfile, updateUserProfile: mocks.update, requestVerifiedEmailChange: mocks.requestEmail, confirmVerifiedEmailChange: mocks.confirmEmail, deleteUserAccount: mocks.deleteAccount, logoutUser: mocks.logout, currentFirebaseUser: () => mocks.signedOut ? null : mocks.identity, reauthenticateForDeletion: mocks.reauthenticateDeletion, clearAuthProfileCache: mocks.clearCache }));
vi.mock('firebase/auth', async importOriginal => ({
  ...await importOriginal<typeof import('firebase/auth')>(), deleteUser: mocks.firebaseDelete, signOut: mocks.signOut,
}));
const profile = { uid: 'u1', nombre: 'Ana', apellido: 'Pérez', username: 'ana_perez', email: 'ana@example.test', avatarUrl: null };
const response = { uid: 'u1', profileStatus: 'complete', profile };
function openProfile(failNavigation = false) {
  const router = createMemoryRouter([
    { path: '/', element: <AccountDeletionProvider><ProfilePage /></AccountDeletionProvider> },
    { path: '/login', element: <h1>Iniciar sesión</h1> },
  ]);
  if (failNavigation) vi.spyOn(router, 'navigate').mockRejectedValueOnce(new Error('navegación interrumpida'));
  return { ...render(<RouterProvider router={router} />), router };
}
function click(name: string) { fireEvent.click(screen.getByRole('button', { name })); }
function change(label: string, value: string) { fireEvent.change(screen.getByLabelText(label), { target: { value } }); }
async function edit() { openProfile(); fireEvent.click(await screen.findByRole('button', { name: 'Editar perfil' })); mocks.setUser.mockClear(); }
function error(status: number, code: string) { return new ApiError(status, { success: false, code, message: code }); }

beforeEach(() => {
  vi.resetAllMocks();
  sessionStorage.clear();
  mocks.canChangeEmail = undefined;
  mocks.identity = { uid: 'u1', providerData: [{ providerId: 'password' }] };
  mocks.signedOut = false;
  mocks.logout.mockImplementation(async () => { mocks.signedOut = true; });
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

});

describe('US-05', () => {
  it('confirma, cancela y reinicia el diálogo sin operaciones destructivas ni cierre de sesión', async () => {
    const deleteProfile = vi.spyOn(api, 'deleteProfile').mockResolvedValue({ status: 'pending', statusToken: 'fixture' });
    try {
      openProfile();
      const entry = await screen.findByRole('button', { name: 'Eliminar cuenta' });
      fireEvent.click(entry);
      expect(screen.getByRole('dialog', { name: 'Eliminar cuenta' })).toHaveAccessibleDescription(/Esta acción es definitiva/);
      expect(screen.getByText(/perderás el acceso a TeamSpeak/)).toBeVisible();
      expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus();
      const confirmation = screen.getByRole('checkbox', { name: /Entiendo las consecuencias/ });
      const destructive = screen.getByRole('button', { name: 'Eliminar mi cuenta' });
      expect(confirmation).not.toBeChecked();
      expect(destructive).toBeDisabled();
      fireEvent.click(confirmation);
      expect(confirmation).toBeChecked();
      expect(destructive).toBeEnabled();
      fireEvent.click(confirmation);
      expect(confirmation).not.toBeChecked();
      fireEvent.click(confirmation);
      click('Cancelar');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(entry).toHaveFocus();
      fireEvent.click(entry);
      expect(confirmation).not.toBeChecked();
      click('Cancelar');
      expect(screen.getByText(profile.email)).toBeVisible();
      expect(mocks.update).not.toHaveBeenCalled();
      expect(deleteProfile).not.toHaveBeenCalled();
      expect(mocks.deleteAccount).not.toHaveBeenCalled();
      expect(mocks.firebaseDelete).not.toHaveBeenCalled();
      expect(mocks.logout).not.toHaveBeenCalled();
      expect(mocks.signOut).not.toHaveBeenCalled();
    } finally {
      deleteProfile.mockRestore();
    }
  });

  it('espera completed por token, conserva sesión en pending y navega al login', async () => {
    const entropy = vi.spyOn(crypto, 'getRandomValues');
    mocks.deleteAccount.mockImplementationOnce(async token => {
      expect(token).toMatch(/^[A-Za-z0-9_-]{64}$/);
      expect(readDeletionTracking('u1')?.token).toBe(token);
      return { status: 'pending' };
    });
    const status = vi.spyOn(api, 'getDeletionStatus').mockResolvedValueOnce({ status: 'completed' });
    try {
      openProfile();
      fireEvent.click(await screen.findByRole('button', { name: 'Eliminar cuenta' }));
      fireEvent.click(screen.getByRole('checkbox'));
      click('Eliminar mi cuenta');
      expect(await screen.findByText(/eliminación aún está pendiente/)).toBeVisible();
      expect(mocks.logout).not.toHaveBeenCalled();
      click('Consultar estado');
      expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
      expect(entropy).toHaveBeenCalledWith(expect.any(Uint8Array));
      expect(status).toHaveBeenCalledWith(mocks.deleteAccount.mock.calls[0][0], expect.any(AbortSignal));
      expect(readDeletionTracking('u1')).toBeNull();
      expect(mocks.deleteAccount).toHaveBeenCalledOnce();
      expect(mocks.logout).toHaveBeenCalledOnce();
      expect(mocks.setUser).toHaveBeenCalledWith(null);
    } finally {
      entropy.mockRestore();
      status.mockRestore();
    }
  });

  it('navega al login cuando el DELETE confirma completed y Firebase cierra la sesión', async () => {
    mocks.deleteAccount.mockResolvedValueOnce({ status: 'completed', statusToken: 'fixture' });
    openProfile();
    fireEvent.click(await screen.findByRole('button', { name: 'Eliminar cuenta' }));
    fireEvent.click(screen.getByRole('checkbox'));
    click('Eliminar mi cuenta');
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
    expect(mocks.logout).toHaveBeenCalledOnce();
    expect(mocks.setUser).toHaveBeenLastCalledWith(null);
    expect(mocks.deleteAccount).toHaveBeenCalledOnce();
  });

  it.each(['DELETE', 'seguimiento'])('conserva completed de %s si falla logout y reintenta solo la limpieza', async source => {
    mocks.deleteAccount.mockResolvedValueOnce({
      status: source === 'DELETE' ? 'completed' : 'pending', statusToken: 'fixture',
    });
    const status = vi.spyOn(api, 'getDeletionStatus').mockResolvedValueOnce({ status: 'completed' });
    let finish!: () => void;
    mocks.logout.mockRejectedValueOnce(new Error('falló el cierre local')).mockImplementationOnce(
      () => new Promise<void>(resolve => { finish = () => { mocks.signedOut = true; resolve(); }; }),
    );
    try {
      const { router } = openProfile();
      const navigation = vi.spyOn(router, 'navigate');
      fireEvent.click(await screen.findByRole('button', { name: 'Eliminar cuenta' }));
      fireEvent.click(screen.getByRole('checkbox'));
      click('Eliminar mi cuenta');
      if (source === 'seguimiento') {
        fireEvent.click(await screen.findByRole('button', { name: 'Consultar estado' }));
      }
      expect(await screen.findByText(/problema al cerrar la sesión en este dispositivo/)).toBeVisible();
      expect(screen.getByText('El servidor confirmó la eliminación de tu cuenta.')).toBeVisible();
      expect(screen.queryByText(/el resultado de la eliminación sigue sin confirmarse/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Eliminar mi cuenta' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Consultar estado' })).not.toBeInTheDocument();
      expect(navigation).not.toHaveBeenCalled();
      expect(mocks.clearCache).toHaveBeenCalled();
      const retry = screen.getByRole('button', { name: 'Reintentar cierre de sesión' });
      fireEvent.click(retry);
      fireEvent.click(retry);
      expect(mocks.logout).toHaveBeenCalledTimes(2);
      await act(async () => finish());
      expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
      expect(mocks.deleteAccount).toHaveBeenCalledOnce();
      expect(status).toHaveBeenCalledTimes(source === 'seguimiento' ? 1 : 0);
      expect(navigation).toHaveBeenCalledOnce();
    } finally {
      status.mockRestore();
    }
  });

  it('reintenta solo la navegación si el login no se pudo abrir', async () => {
    mocks.deleteAccount.mockResolvedValueOnce({ status: 'completed', statusToken: 'fixture' });
    const { router } = openProfile(true);
    fireEvent.click(await screen.findByRole('button', { name: 'Eliminar cuenta' }));
    fireEvent.click(screen.getByRole('checkbox'));
    click('Eliminar mi cuenta');
    expect(await screen.findByText(/no pudimos abrir el inicio de sesión/)).toBeVisible();
    expect(screen.getByText('El servidor confirmó la eliminación de tu cuenta.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Reintentar cierre de sesión' })).not.toBeInTheDocument();
    click('Ir al inicio de sesión');
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
    expect(mocks.logout).toHaveBeenCalledOnce();
    expect(mocks.deleteAccount).toHaveBeenCalledOnce();
    expect(router.navigate).toHaveBeenCalledTimes(2);
  });

  it('descarta la confirmación de la cuenta anterior antes de limpiar otra sesión', async () => {
    let finish!: (value: { status: string; statusToken: string }) => void;
    mocks.deleteAccount.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const { router } = openProfile();
    fireEvent.click(await screen.findByRole('button', { name: 'Eliminar cuenta' }));
    fireEvent.click(screen.getByRole('checkbox'));
    click('Eliminar mi cuenta');
    mocks.identity = { uid: 'u2', providerData: [{ providerId: 'password' }] };
    await act(async () => finish({ status: 'completed', statusToken: 'fixture' }));
    expect(mocks.logout).not.toHaveBeenCalled();
    expect(mocks.clearCache).not.toHaveBeenCalled();
    expect(mocks.deleteAccount).toHaveBeenCalledOnce();
    expect(router.state.location.pathname).toBe('/');
  });

  it('requiere contraseña tras AUTH_RECENT_REQUIRED y conserva la sesión ante credenciales rechazadas', async () => {
    mocks.deleteAccount.mockRejectedValueOnce(error(401, 'AUTH_RECENT_REQUIRED'))
      .mockResolvedValueOnce({ status: 'completed', statusToken: 'fixture' });
    mocks.reauthenticateDeletion.mockRejectedValueOnce(new Error('Contraseña incorrecta')).mockResolvedValueOnce(undefined);
    openProfile();
    fireEvent.click(await screen.findByRole('button', { name: 'Eliminar cuenta' }));
    fireEvent.click(screen.getByRole('checkbox'));
    click('Eliminar mi cuenta');
    expect(await screen.findByLabelText('Contraseña actual')).toBeVisible();
    change('Contraseña actual', 'incorrecta');
    fireEvent.submit(screen.getByLabelText('Contraseña actual').closest('form')!);
    expect(await screen.findByText('Contraseña incorrecta')).toBeVisible();
    expect(mocks.deleteAccount).toHaveBeenCalledOnce();
    expect(mocks.logout).not.toHaveBeenCalled();
    change('Contraseña actual', 'fixture-password');
    fireEvent.submit(screen.getByLabelText('Contraseña actual').closest('form')!);
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
    expect(mocks.reauthenticateDeletion).toHaveBeenLastCalledWith(mocks.identity, 'password', 'fixture-password');
    expect(mocks.deleteAccount).toHaveBeenCalledTimes(2);
    expect(mocks.deleteAccount.mock.calls[0][0]).toBe(mocks.deleteAccount.mock.calls[1][0]);
  });

  it('usa el comprobante tras una respuesta perdida y muestra bloqueo sin repetir DELETE', async () => {
    mocks.deleteAccount.mockRejectedValueOnce(new Error('respuesta perdida'));
    const status = vi.spyOn(api, 'getDeletionStatus').mockResolvedValueOnce({ status: 'blocked' });
    try {
      openProfile();
      fireEvent.click(await screen.findByRole('button', { name: 'Eliminar cuenta' }));
      fireEvent.click(screen.getByRole('checkbox'));
      click('Eliminar mi cuenta');
      expect(await screen.findByText('El resultado de la eliminación sigue sin confirmarse.')).toBeVisible();
      click('Consultar estado');
      expect(await screen.findByText('El proceso está bloqueado. Contacta a soporte.')).toBeVisible();
      expect(status).toHaveBeenCalledWith(mocks.deleteAccount.mock.calls[0][0], expect.any(AbortSignal));
      expect(mocks.deleteAccount).toHaveBeenCalledOnce();
      expect(mocks.logout).not.toHaveBeenCalled();
    } finally {
      status.mockRestore();
    }
  });


  it('recupera tras recargar sin Firebase y vuelve a consultar luego de un fallo temporal', async () => {
    mocks.deleteAccount.mockRejectedValueOnce(new TypeError('offline'));
    const status = vi.spyOn(api, 'getDeletionStatus')
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce({ status: 'completed' });
    try {
      const page = openProfile();
      fireEvent.click(await screen.findByRole('button', { name: 'Eliminar cuenta' }));
      fireEvent.click(screen.getByRole('checkbox'));
      click('Eliminar mi cuenta');
      await screen.findByText(/el resultado de la eliminación sigue sin confirmarse/i);
      const token = mocks.deleteAccount.mock.calls[0][0];
      page.unmount();
      mocks.signedOut = true;
      openProfile();
      click('Ver seguimiento de eliminación');
      click('Consultar estado');
      await screen.findByText(/no pudimos comprobar el estado/i);
      click('Consultar estado');
      await screen.findByRole('heading', { name: 'Iniciar sesión' });
      expect(status.mock.calls.map(([receipt]) => receipt)).toEqual([token, token]);
      expect(readDeletionTracking('u1')).toBeNull();
      expect(mocks.deleteAccount).toHaveBeenCalledOnce();
      expect(mocks.logout).not.toHaveBeenCalled();
    } finally {
      status.mockRestore();
    }
  });

  it('conserva el comprobante ante discrepancia y 404 sin indicar éxito', async () => {
    mocks.deleteAccount.mockRejectedValueOnce(error(409, 'DELETION_STATUS_TOKEN_MISMATCH'));
    const status = vi.spyOn(api, 'getDeletionStatus').mockRejectedValueOnce(error(404, 'DELETION_STATUS_NOT_FOUND'));
    try {
      openProfile();
      fireEvent.click(await screen.findByRole('button', { name: 'Eliminar cuenta' }));
      fireEvent.click(screen.getByRole('checkbox'));
      click('Eliminar mi cuenta');
      await screen.findByText(/solicitud existente tiene otro comprobante/);
      click('Consultar estado');
      await screen.findByText(/estado no se pudo verificar/);
      const token = mocks.deleteAccount.mock.calls[0][0];
      expect(status).toHaveBeenCalledWith(token, expect.any(AbortSignal));
      expect(readDeletionTracking('u1')?.token).toBe(token);
      expect(mocks.deleteAccount).toHaveBeenCalledOnce();
      expect(mocks.logout).not.toHaveBeenCalled();
    } finally {
      status.mockRestore();
    }
  });

  it('muestra VALIDATION_ERROR y vuelve a requerir confirmación explícita', async () => {
    mocks.deleteAccount.mockRejectedValueOnce(error(400, 'VALIDATION_ERROR'));
    openProfile();
    fireEvent.click(await screen.findByRole('button', { name: 'Eliminar cuenta' }));
    fireEvent.click(screen.getByRole('checkbox'));
    click('Eliminar mi cuenta');
    await screen.findByText(/servidor rechazó la solicitud/);
    expect(screen.getByRole('button', { name: 'Eliminar mi cuenta' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Consultar estado' })).not.toBeInTheDocument();
    expect(readDeletionTracking('u1')).toBeNull();
    expect(mocks.deleteAccount).toHaveBeenCalledOnce();
  });

  it('trata 409 ACCOUNT_DELETION_BLOCKED como bloqueo sin terminar la sesión', async () => {
    mocks.deleteAccount.mockRejectedValueOnce(error(409, 'ACCOUNT_DELETION_BLOCKED'));
    openProfile();
    fireEvent.click(await screen.findByRole('button', { name: 'Eliminar cuenta' }));
    fireEvent.click(screen.getByRole('checkbox'));
    click('Eliminar mi cuenta');
    expect(await screen.findByRole('alert')).toHaveTextContent('El proceso está bloqueado');
    expect(screen.getByRole('link', { name: 'Ir a ayuda' })).toHaveAttribute('href', '/ayuda');
    expect(screen.queryByRole('button', { name: 'Eliminar mi cuenta' })).not.toBeInTheDocument();
    expect(mocks.logout).not.toHaveBeenCalled();
    expect(mocks.deleteAccount).toHaveBeenCalledOnce();
  });

});

describe('Cambio de correo', () => {
  it('solicita reautenticación, distingue verificación pendiente y conserva el borrador de perfil', async () => {
    mocks.canChangeEmail = true;
    const target = 'nuevo@example.test';
    mocks.requestEmail.mockRejectedValueOnce(error(401, 'AUTH_RECENT_REQUIRED')).mockResolvedValueOnce(undefined);
    mocks.confirmEmail.mockResolvedValueOnce(undefined).mockResolvedValueOnce({
      profile: { ...profile, email: target }, user: { id: 'u1', email: target }, isCurrent: () => true,
    });
    await edit();
    change('Nombre', 'Borrador');
    change('Nuevo correo electrónico', profile.email);
    click('Enviar verificación');
    expect(screen.getByRole('alert')).toHaveTextContent('debe ser diferente');
    expect(mocks.requestEmail).not.toHaveBeenCalled();
    change('Nuevo correo electrónico', target);
    click('Enviar verificación');
    const password = await screen.findByLabelText('Contraseña actual');
    fireEvent.change(password, { target: { value: 'fixture-password' } });
    click('Enviar verificación');
    const check = await screen.findByRole('button', { name: 'Comprobar verificación' });
    expect(screen.queryByText(/fue verificado y sincronizado/)).not.toBeInTheDocument();
    expect(mocks.requestEmail).toHaveBeenLastCalledWith('u1', target, expect.any(AbortSignal), 'fixture-password', expect.any(Function));
    fireEvent.click(check);
    expect(await screen.findByText('El cambio todavía está pendiente de verificación.')).toBeVisible();
    fireEvent.click(check);
    expect(await screen.findByText(/fue verificado y sincronizado/)).toBeVisible();
    expect(screen.getByLabelText('Correo electrónico', { exact: true })).toHaveValue(target);
    expect(screen.getByLabelText('Nombre', { exact: true })).toHaveValue('Borrador');
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it.each(['perdido', 'vencido'])('recupera un enlace %s con un único reenvío explícito', async () => {
    mocks.canChangeEmail = true;
    let finish!: () => void;
    mocks.requestEmail.mockResolvedValueOnce(undefined).mockImplementationOnce(
      () => new Promise<void>(resolve => { finish = resolve; }),
    );
    mocks.confirmEmail.mockResolvedValueOnce(undefined);
    await edit();
    change('Nuevo correo electrónico', 'nuevo@example.test');
    click('Enviar verificación');
    const check = await screen.findByRole('button', { name: 'Comprobar verificación' });
    fireEvent.click(check);
    expect(await screen.findByText('El cambio todavía está pendiente de verificación.')).toBeVisible();
    const resend = screen.getByRole('button', { name: 'Enviar otra verificación' });
    expect(screen.getByRole('button', { name: 'Cambiar dirección' })).toBeEnabled();
    fireEvent.click(resend);
    expect(resend).toBeDisabled();
    fireEvent.submit(resend.closest('form')!);
    expect(mocks.requestEmail).toHaveBeenCalledTimes(2);
    await act(async () => finish());
    expect(await screen.findByText('Se solicitó otra verificación para este correo.')).toBeVisible();
    expect(mocks.requestEmail).toHaveBeenLastCalledWith('u1', 'nuevo@example.test', expect.any(AbortSignal), undefined, expect.any(Function));
    expect(screen.queryByText(/fue verificado y sincronizado/)).not.toBeInTheDocument();
  });

  it('permite corregir la dirección y salir sin alterar el borrador ni revocar enlaces', async () => {
    mocks.canChangeEmail = true;
    mocks.requestEmail.mockResolvedValue(undefined);
    mocks.confirmEmail.mockResolvedValueOnce(undefined);
    await edit();
    change('Nombre', 'Borrador');
    change('Nuevo correo electrónico', 'equivocado@example.test');
    click('Enviar verificación');
    fireEvent.click(await screen.findByRole('button', { name: 'Cambiar dirección' }));
    expect(screen.getByLabelText('Nuevo correo electrónico')).toHaveValue('equivocado@example.test');
    expect(screen.getByText('Los enlaces enviados anteriormente pueden seguir vigentes.')).toBeVisible();
    change('Nuevo correo electrónico', 'correcto@example.test');
    click('Enviar verificación');
    fireEvent.click(await screen.findByRole('button', { name: 'Comprobar verificación' }));
    expect(await screen.findByText('El cambio todavía está pendiente de verificación.')).toBeVisible();
    expect(mocks.confirmEmail).toHaveBeenCalledWith('u1', 'correcto@example.test');
    click('Salir del cambio de correo');
    expect(screen.queryByRole('button', { name: 'Comprobar verificación' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Nombre', { exact: true })).toHaveValue('Borrador');
    expect(mocks.update).not.toHaveBeenCalled();
    click('Abrir cambio de correo');
    expect(screen.getByLabelText('Nuevo correo electrónico')).toHaveValue('');
    expect(mocks.requestEmail).toHaveBeenCalledTimes(2);
  });

  it('conserva la recuperación ante reautenticación y límite de frecuencia al reenviar', async () => {
    mocks.canChangeEmail = true;
    mocks.requestEmail.mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(error(401, 'AUTH_RECENT_REQUIRED'))
      .mockRejectedValueOnce(new Error('Espera unos minutos e inténtalo de nuevo.'))
      .mockResolvedValueOnce(undefined);
    await edit();
    change('Nuevo correo electrónico', 'nuevo@example.test');
    click('Enviar verificación');
    fireEvent.click(await screen.findByRole('button', { name: 'Enviar otra verificación' }));
    let password = await screen.findByLabelText('Contraseña actual');
    fireEvent.change(password, { target: { value: 'fixture-password' } });
    click('Enviar otra verificación');
    expect(await screen.findByRole('alert')).toHaveTextContent('Espera unos minutos');
    password = screen.getByLabelText('Contraseña actual');
    expect(password).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Cambiar dirección' })).toBeEnabled();
    fireEvent.change(password, { target: { value: 'fixture-password' } });
    click('Enviar otra verificación');
    expect(await screen.findByText('Se solicitó otra verificación para este correo.')).toBeVisible();
    expect(mocks.requestEmail).toHaveBeenCalledTimes(4);
  });

  it('descarta una comprobación tardía al cambiar de identidad', async () => {
    const onConfirmed = vi.fn();
    const onBusy = vi.fn();
    const props = { supported: true, hidden: false, onConfirmed, onBusy };
    const target = 'nuevo@example.test';
    const result = { profile: { ...profile, email: target }, user: { id: 'u1', email: target }, isCurrent: () => true };
    let finish!: (value: typeof result) => void;
    mocks.requestEmail.mockResolvedValueOnce(undefined);
    mocks.confirmEmail.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const { rerender } = render(<ProfileEmailChange key="u1" uid="u1" email={profile.email} {...props} />);
    change('Nuevo correo electrónico', target);
    click('Enviar verificación');
    fireEvent.click(await screen.findByRole('button', { name: 'Comprobar verificación' }));
    expect(screen.getByText('Comprobando verificación…')).toBeVisible();
    rerender(<ProfileEmailChange key="u2" uid="u2" email="otra@example.test" {...props} />);
    await act(async () => finish(result));
    expect(onConfirmed).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Nuevo correo electrónico')).toHaveValue('');
    expect(screen.queryByText(/fue verificado y sincronizado/)).not.toBeInTheDocument();
  });

  it('explica la restricción a cuentas sin contraseña vinculada', async () => {
    mocks.canChangeEmail = false;
    await edit();
    expect(screen.getByText(/método de autenticación no admite/)).toBeVisible();
    expect(screen.queryByLabelText('Nuevo correo electrónico')).not.toBeInTheDocument();
    expect(mocks.requestEmail).not.toHaveBeenCalled();
  });
});
