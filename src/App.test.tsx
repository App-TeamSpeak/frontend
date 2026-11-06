import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { VerificationPage } from './pages/VerificationPage';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  window.history.pushState({}, '', '/');
});

afterEach(() => cleanup());

const success = (data: Record<string, unknown>) => ({ ok: true, json: async () => ({ success: true, data }) });
const failure = (message = 'El documento no existe.') => ({ ok: false, json: async () => ({ success: false, code: 'SPRINT0_DOCUMENT_NOT_FOUND', message }) });

describe('TeamSpeak frontend', () => {
  it.each([
    ['/', 'Aprende y colabora en TeamSpeak'],
    ['/registro', 'Crear cuenta'],
    ['/login', 'Bienvenido de nuevo'],
    ['/completar-username', 'Completar perfil'],
    ['/dashboard', 'Tus salas'],
    ['/perfil', 'Mi perfil'],
    ['/salas/sala-42', 'Sala sala-42'],
    ['/ayuda', 'Ayuda'],
    ['/accesibilidad', 'Accesibilidad'],
    ['/verificacion', 'Documento de verificación'],
  ])('renders the dedicated screen for %s', async (path, heading) => {
    window.history.pushState({}, '', path);
    render(<App />);
    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
  });

  it('navigates from home to a dedicated page', async () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Aprende y colabora en TeamSpeak' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Crear cuenta' }));

    expect(await screen.findByRole('heading', { name: 'Crear cuenta' })).toBeInTheDocument();
    expect(document.title).toBe('Crear cuenta | TeamSpeak');
  });

  it('renders dynamic rooms and a custom 404', async () => {
    window.history.pushState({}, '', '/salas/sala-42');
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Sala sala-42' })).toBeInTheDocument();

    window.history.pushState({}, '', '/ruta-inexistente-sprint0');
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

describe('Sprint 0 navigation and recovery', () => {
  it.each([['/salas/crear', 'Crear sala'], ['/salas/unirse', 'Unirse a sala'], ['/recuperar-contrasena', 'Recuperar contraseña']])('resolves %s without treating it as a room ID', (path, heading) => {
    window.history.pushState({}, '', path); render(<App />);
    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
  });
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
