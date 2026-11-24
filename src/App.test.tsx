import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

const authMocks = vi.hoisted(() => ({
  currentFirebaseUser: () => null,
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


afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
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
  it('restablece el scroll al inicio al cambiar de ruta sin hash y respeta anclas', async () => {
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    window.history.pushState({}, '', '/ayuda');
    render(<App />);
    await screen.findByRole('heading', { name: 'Ayuda' });
    scrollToSpy.mockClear();

    fireEvent.click(screen.getByRole('link', { name: 'Accesibilidad' }));
    await screen.findByRole('heading', { name: 'Accesibilidad' });
    expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' });

    scrollToSpy.mockClear();
    fireEvent.click(screen.getByRole('link', { name: 'Ayuda' }));
    await screen.findByRole('heading', { name: 'Ayuda' });
    expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' });

    scrollToSpy.mockClear();
    fireEvent.click(screen.getByRole('link', { name: 'Solución de problemas' }));
    expect(scrollToSpy).not.toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' });
  });
});
