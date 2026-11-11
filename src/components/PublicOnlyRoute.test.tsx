import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PublicOnlyRoute } from './PublicOnlyRoute';

const authState = vi.hoisted(() => ({ user: null as any, loading: false }));
vi.mock('../auth/AuthContext', () => ({ useAuth: () => authState }));

afterEach(() => {
  cleanup();
  authState.user = null;
  authState.loading = false;
});

function renderRoute() {
  return render(<MemoryRouter initialEntries={['/login']}><Routes>
    <Route path="/login" element={<PublicOnlyRoute><h1>login</h1></PublicOnlyRoute>} />
    <Route path="/dashboard" element={<h1>dashboard</h1>} />
    <Route path="/completar-username" element={<h1>completar</h1>} />
    <Route path="/verificar-correo" element={<h1>verificar</h1>} />
  </Routes></MemoryRouter>);
}

describe('PublicOnlyRoute', () => {
  it('keeps the login available while there is no session', () => {
    renderRoute();
    expect(screen.getByRole('heading', { name: 'login' })).toBeInTheDocument();
  });

  it('waits for the session before rendering the login', () => {
    authState.loading = true;
    renderRoute();
    expect(screen.getByRole('status')).toHaveTextContent('Cargando sesión');
    expect(screen.queryByRole('heading', { name: 'login' })).not.toBeInTheDocument();
  });

  it('replaces login with dashboard for a complete authenticated session', () => {
    authState.user = { emailVerified: true, username: 'ana' };
    renderRoute();
    expect(screen.getByRole('heading', { name: 'dashboard' })).toBeInTheDocument();
  });

  it('sends incomplete or unverified sessions to their onboarding step', () => {
    authState.user = { emailVerified: false, username: 'ana' };
    renderRoute();
    expect(screen.getByRole('heading', { name: 'verificar' })).toBeInTheDocument();

    cleanup();
    authState.user = { emailVerified: true, username: '' };
    renderRoute();
    expect(screen.getByRole('heading', { name: 'completar' })).toBeInTheDocument();
  });
});
