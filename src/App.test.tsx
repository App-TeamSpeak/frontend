import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { VerificationPage } from './pages/VerificationPage';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  window.localStorage.clear();
  vi.stubGlobal('fetch', fetchMock);
  window.history.pushState({}, '', '/');
});

afterEach(() => cleanup());

const success = (data: Record<string, unknown>) => ({ ok: true, json: async () => ({ success: true, data }) });
const failure = (message = 'El documento no existe.') => ({ ok: false, json: async () => ({ success: false, code: 'SPRINT0_DOCUMENT_NOT_FOUND', message }) });

describe('TeamSpeak frontend', () => {
  it.each([
    ['/', 'Bienvenido de nuevo'],
    ['/registro', 'Crear cuenta'],
    ['/login', 'Bienvenido de nuevo'],
    ['/completar-username', 'Elige tu nombre de usuario'],
    ['/dashboard', 'Tus salas'],
    ['/perfil', 'Mi perfil'],
    ['/salas/sala-42', 'Sala sala-42'],
    ['/ayuda', 'Ayuda'],
    ['/accesibilidad', 'Accesibilidad'],
  ])('renders the dedicated screen for %s', async (path, heading) => {
    if (path === '/completar-username') window.localStorage.setItem('teamspeak.session', JSON.stringify({ id: 'pending', name: 'Ana', email: 'ana@test.edu' }));
    if (['/dashboard', '/perfil', '/salas/sala-42'].includes(path)) window.localStorage.setItem('teamspeak.session', JSON.stringify({ id: 'ready', name: 'Ana Martínez', email: 'ana@test.edu', username: 'ana.martinez' }));
    window.history.pushState({}, '', path);
    render(<App />);
    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
  });

  it('starts at login when the root route is opened', async () => {
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Bienvenido de nuevo' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');
  });

  it('protects private routes and keeps incomplete sessions on username setup', async () => {
    window.history.pushState({}, '', '/dashboard');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Bienvenido de nuevo' })).toBeInTheDocument();
    window.localStorage.setItem('teamspeak.session', JSON.stringify({ id: 'pending', name: 'Ana', email: 'ana@test.edu' }));
    cleanup();
    window.history.pushState({}, '', '/dashboard');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Elige tu nombre de usuario' })).toBeInTheDocument();
  });

  it.each(['/login', '/registro', '/dashboard', '/salas/sala-42'])('keeps the footer visible on %s', (path) => {
    if (['/dashboard', '/salas/sala-42'].includes(path)) window.localStorage.setItem('teamspeak.session', JSON.stringify({ id: 'ready', name: 'Ana Martínez', email: 'ana@test.edu', username: 'ana.martinez' }));
    window.history.pushState({}, '', path);
    render(<App />);

    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Accesibilidad' })).toHaveAttribute('href', '/accesibilidad');
    expect(screen.getByRole('link', { name: 'Ayuda' })).toHaveAttribute('href', '/ayuda');
  });

  it('renders dynamic rooms and a custom 404', async () => {
    window.localStorage.setItem('teamspeak.session', JSON.stringify({ id: 'ready', name: 'Ana Martínez', email: 'ana@test.edu', username: 'ana.martinez' }));
    window.history.pushState({}, '', '/salas/sala-42');
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Sala sala-42' })).toBeInTheDocument();

    window.history.pushState({}, '', '/ruta-inexistente-sprint0');
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver al ingreso' })).toHaveAttribute('href', '/login');
  });

  it.each(['/showcase/auth', '/verificacion', '/recuperar-contrasena'])('does not expose the legacy route %s', (path) => {
    window.history.pushState({}, '', path);
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument();
  });

  it('shows loading and then real API data on verification page', async () => {
    let resolveRequest!: (response: unknown) => void;
    fetchMock.mockReturnValueOnce(new Promise((resolve) => { resolveRequest = resolve; }));
    render(<VerificationPage />);

    expect(screen.getByText('Consultando los datos reales de Firestore…')).toBeInTheDocument();
    resolveRequest(success({ descripcion: 'dato actualizado' }));
    expect(await screen.findByText('dato actualizado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Actualizar' })).toBeInTheDocument();
  });

  it('shows Reintentar and recovers after a connection failure', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(success({ estado: 'recuperado' }));
    render(<VerificationPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo conectar con la API.');
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('recuperado')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries a controlled HTTP error', async () => {
    fetchMock.mockResolvedValueOnce(failure()).mockResolvedValueOnce(success({ estado: 'funcionando' }));
    render(<VerificationPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('El documento no existe.');
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('funcionando')).toBeInTheDocument();
  });
});

describe('Navigation cleanup', () => {
  it('shows a fresh document after updating', async () => {
    fetchMock.mockResolvedValueOnce(success({ mensaje: 'primera lectura' })).mockResolvedValueOnce(success({ mensaje: 'segunda lectura' }));
    render(<VerificationPage />);
    expect(await screen.findByText('primera lectura')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    expect(await screen.findByText('segunda lectura')).toBeInTheDocument();
    expect(screen.queryByText('primera lectura')).not.toBeInTheDocument();
  });
  it('shows success for an existing empty document', async () => {
    fetchMock.mockResolvedValueOnce(success({})); render(<VerificationPage />);
    expect(await screen.findByText('El documento existe, pero todavía no contiene campos.')).toBeInTheDocument();
  });
  it('associates registration errors with fields and focuses the first error', () => {
    window.history.pushState({}, '', '/registro'); render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    const name = screen.getByLabelText('Nombre');
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveAccessibleDescription('Completa el campo nombre.');
    expect(name).toHaveFocus();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
