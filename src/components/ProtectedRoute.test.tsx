import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProtectedRoute } from './ProtectedRoute';

const authState = vi.hoisted(() => ({ user: null as any, loading: false }));
vi.mock('../auth/AuthContext', () => ({ useAuth: () => authState }));

afterEach(() => { cleanup(); authState.user = null; authState.loading = false; });

function renderRoute(options?: { allowIncomplete?: boolean; allowUnverified?: boolean }) {
  return render(<MemoryRouter initialEntries={['/private']}><Routes>
    <Route path="/private" element={<ProtectedRoute {...options}><h1>privado</h1></ProtectedRoute>} />
    <Route path="/login" element={<h1>login</h1>} />
    <Route path="/verificar-correo" element={<h1>verificar</h1>} />
    <Route path="/completar-username" element={<h1>completar</h1>} />
    <Route path="/dashboard" element={<h1>dashboard</h1>} />
  </Routes></MemoryRouter>);
}

describe('ProtectedRoute', () => {
  it('shows loading while authentication is resolving', () => {
    authState.loading = true;
    renderRoute();
    expect(screen.getByRole('status')).toHaveTextContent('Cargando sesión');
  });
  it('redirects anonymous users to login', () => {
    renderRoute();
    expect(screen.getByRole('heading', { name: 'login' })).toBeInTheDocument();
  });
  it('redirects unverified users unless the route allows them', () => {
    authState.user = { emailVerified: false, username: 'ana' };
    renderRoute();
    expect(screen.getByRole('heading', { name: 'verificar' })).toBeInTheDocument();
    cleanup();
    renderRoute({ allowUnverified: true });
    expect(screen.getByRole('heading', { name: 'privado' })).toBeInTheDocument();
  });
  it('redirects incomplete profiles and avoids the completion loop', () => {
    authState.user = { emailVerified: true, username: '' };
    renderRoute();
    expect(screen.getByRole('heading', { name: 'completar' })).toBeInTheDocument();
    cleanup();
    renderRoute({ allowIncomplete: true });
    expect(screen.getByRole('heading', { name: 'privado' })).toBeInTheDocument();
    cleanup();
    authState.user = { emailVerified: true, username: 'ana' };
    renderRoute({ allowIncomplete: true });
    expect(screen.getByRole('heading', { name: 'dashboard' })).toBeInTheDocument();
  });
  it('renders protected content for a complete verified profile', () => {
    authState.user = { emailVerified: true, username: 'ana' };
    renderRoute();
    expect(screen.getByRole('heading', { name: 'privado' })).toBeInTheDocument();
  });
});
