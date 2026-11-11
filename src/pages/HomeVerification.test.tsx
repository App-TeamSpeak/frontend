import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HomePage } from './HomePage';

const fetchDemo = vi.hoisted(() => vi.fn());
vi.mock('../services/api', () => ({ fetchSprint0Demo: fetchDemo }));
import { VerificationPage } from './VerificationPage';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('home and verification pages', () => {
  it('shows the public entry points', () => {
    render(<MemoryRouter><HomePage /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Aprende y colabora en TeamSpeak' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Crear cuenta' })).toHaveAttribute('href', '/registro');
    expect(screen.getByRole('link', { name: 'Ver datos de Firestore' })).toHaveAttribute('href', '/verificacion');
  });

  it('renders the verification document and refreshes it', async () => {
    fetchDemo.mockResolvedValue({ mensaje: 'actual', cantidad: 2 });
    render(<MemoryRouter><VerificationPage /></MemoryRouter>);
    expect(await screen.findByText('Éxito · Documento recibido de la API.')).toBeInTheDocument();
    expect(screen.getByText('actual')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    await waitFor(() => expect(fetchDemo).toHaveBeenCalledTimes(2));
  });

  it('shows a retryable network error', async () => {
    fetchDemo.mockRejectedValue(new Error('offline'));
    render(<MemoryRouter><VerificationPage /></MemoryRouter>);
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo conectar con la API');
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(fetchDemo).toHaveBeenCalledTimes(2);
  });
});
