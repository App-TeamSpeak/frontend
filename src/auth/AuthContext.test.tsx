import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';

const authMocks = vi.hoisted(() => ({
  configureAuth: vi.fn(),
  logoutUser: vi.fn(),
  subscribeToAuth: vi.fn(),
}));

vi.mock('../services/auth', () => authMocks);

function AuthProbe() {
  const { loading, user, logout } = useAuth();

  return (
    <>
      <span>{loading ? 'loading' : user?.name || 'anonymous'}</span>
      <button type="button" onClick={() => void logout()}>Cerrar</button>
    </>
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.configureAuth.mockResolvedValue(undefined);
    authMocks.logoutUser.mockResolvedValue(undefined);
    authMocks.subscribeToAuth.mockImplementation((callback: (user: null) => void) => {
      queueMicrotask(() => callback(null));
      return vi.fn();
    });
  });

  afterEach(() => cleanup());

  it('configura la sesión, publica los cambios de usuario y permite cerrar sesión', async () => {
    const unsubscribe = vi.fn();
    authMocks.subscribeToAuth.mockImplementation((callback: (user: { name: string }) => void) => {
      queueMicrotask(() => callback({ name: 'Ana' }));
      return unsubscribe;
    });

    render(<AuthProvider><AuthProbe /></AuthProvider>);

    expect(await screen.findByText('Ana')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));

    await waitFor(() => expect(screen.getByText('anonymous')).toBeInTheDocument());
    expect(authMocks.configureAuth).toHaveBeenCalledOnce();
    expect(authMocks.logoutUser).toHaveBeenCalledOnce();
    expect(unsubscribe).not.toHaveBeenCalled();
  });

  it('finaliza la carga si la suscripción falla y limpia la suscripción al desmontar', async () => {
    const unsubscribe = vi.fn();
    authMocks.subscribeToAuth.mockReturnValue(unsubscribe);
    authMocks.subscribeToAuth.mockImplementationOnce(() => {
      throw new Error('offline');
    });

    const first = render(<AuthProvider><AuthProbe /></AuthProvider>);
    await waitFor(() => expect(screen.getByText('anonymous')).toBeInTheDocument());
    first.unmount();

    authMocks.subscribeToAuth.mockReturnValue(unsubscribe);
    render(<AuthProvider><AuthProbe /></AuthProvider>);
    await waitFor(() => expect(authMocks.subscribeToAuth).toHaveBeenCalledTimes(2));
    cleanup();

    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('no inicia la suscripción si el proveedor se desmonta durante la configuración', async () => {
    let resolveConfiguration!: () => void;
    authMocks.configureAuth.mockReturnValue(new Promise<void>(resolve => { resolveConfiguration = resolve; }));

    const view = render(<AuthProvider><AuthProbe /></AuthProvider>);
    view.unmount();

    await act(async () => resolveConfiguration());
    expect(authMocks.subscribeToAuth).not.toHaveBeenCalled();
  });

  it('exige utilizar useAuth dentro de AuthProvider', () => {
    expect(() => render(<AuthProbe />)).toThrow('useAuth debe utilizarse dentro de AuthProvider');
  });
});
