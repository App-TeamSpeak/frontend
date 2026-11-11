import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

const authMocks = vi.hoisted(() => ({
  configureAuth: vi.fn().mockResolvedValue(undefined),
  subscribeToAuth: vi.fn(),
  logoutUser: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./services/auth', () => authMocks);

beforeEach(() => {
  authMocks.subscribeToAuth.mockImplementation((callback: (user: null) => void) => {
    queueMicrotask(() => callback(null));
    return () => undefined;
  });
});


describe('App', () => {
  it('redirige la ruta pública inicial al login', async () => {
    window.history.pushState({}, '', '/');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Bienvenido de nuevo' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');
  });
  it('muestra ayuda pública', async () => {
    window.history.pushState({}, '', '/ayuda');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Ayuda' })).toBeInTheDocument();
  });
  it('muestra 404 para una ruta desconocida', async () => {
    window.history.pushState({}, '', '/ruta-inexistente');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument();
  });
});
