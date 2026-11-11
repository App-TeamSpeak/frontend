import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthContext';
import { CompleteUsernamePage } from './PlaceholderPages';

afterEach(() => { cleanup(); vi.useRealTimers(); window.localStorage.clear(); });
beforeEach(() => { window.localStorage.setItem('teamspeak.session', JSON.stringify({ id: 'pending', name: 'Ana Martínez', email: 'ana@test.edu' })); window.localStorage.setItem('teamspeak.users', JSON.stringify([{ id: 'pending', name: 'Ana Martínez', email: 'ana@test.edu', password: 'secret' }, { id: 'other', name: 'Otra persona', email: 'other@test.edu', username: 'ana.martinez', password: 'secret' }])); });
const LocationProbe = () => <output data-testid="location">{useLocation().pathname}</output>;
const renderPage = () => render(<MemoryRouter initialEntries={['/completar-username']}><AuthProvider><Routes><Route path="/completar-username" element={<CompleteUsernamePage />} /><Route path="/dashboard" element={<p>Dashboard</p>} /></Routes><LocationProbe /></AuthProvider></MemoryRouter>);

describe('Completar username', () => {
  it('validates an empty username', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar nombre' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Escribe un nombre de usuario.');
  });

  it('reports an unavailable username', async () => {
    vi.useFakeTimers(); renderPage();
    fireEvent.change(screen.getByLabelText('Nombre de usuario'), { target: { value: 'ana.martinez' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar nombre' }));
    expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled();
    expect(screen.getByText('Estamos guardando tu nombre de usuario.')).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(700); await Promise.resolve(); });
    expect(screen.getByRole('alert')).toHaveTextContent('Ese nombre ya está en uso.');
  });

  it('saves an available username and reaches the dashboard', async () => {
    vi.useFakeTimers(); renderPage();
    fireEvent.change(screen.getByLabelText('Nombre de usuario'), { target: { value: 'ana.nueva' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar nombre' }));
    await act(async () => { vi.advanceTimersByTime(700); await Promise.resolve(); await Promise.resolve(); });
    await act(async () => { vi.advanceTimersByTime(700); await Promise.resolve(); await Promise.resolve(); });
    expect(screen.getByRole('heading', { name: 'Tu cuenta está lista' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Ir a mis salas' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/dashboard');
  });
});
