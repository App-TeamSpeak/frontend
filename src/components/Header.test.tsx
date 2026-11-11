import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter, useLocation, useNavigationType } from 'react-router-dom';
import { Header } from './Header';
import { AuthProvider } from '../auth/AuthContext';

afterEach(cleanup);
const LocationProbe = () => <output data-testid="location">{useLocation().pathname}</output>;
const NavigationTypeProbe = () => <output data-testid="navigation-type">{useNavigationType()}</output>;

describe('Header', () => {
  it('renders the dashboard menu with rooms and profile without a fake avatar', () => {
    render(<MemoryRouter initialEntries={['/dashboard']}><Header /></MemoryRouter>);

    expect(screen.getByRole('link', { name: 'Salón · Mis salas' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Salón · Mis salas' })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByRole('navigation', { name: 'Navegación del panel' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mis salas' })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByRole('link', { name: 'Perfil' })).toHaveAttribute('href', '/perfil');
    expect(screen.queryByRole('img', { name: 'Perfil de usuario' })).not.toBeInTheDocument();
  });

  it('renders only the brand on the login screen', () => {
    render(<MemoryRouter initialEntries={['/login']}><Header /></MemoryRouter>);

    expect(screen.getByRole('link', { name: 'Salón · Iniciar sesión' })).toHaveAttribute('href', '/login');
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('confirms and completes logout immediately at the login route', () => {
    window.localStorage.setItem('teamspeak.session', JSON.stringify({ id: 'ready', name: 'Ana Martínez', email: 'ana@test.edu', username: 'ana.martinez' }));
    render(<MemoryRouter initialEntries={['/dashboard']}><AuthProvider><Header /><LocationProbe /><NavigationTypeProbe /></AuthProvider></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(screen.getByRole('dialog', { name: '¿Cerrar sesión?' })).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cerrar sesión' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/login');
    expect(screen.getByTestId('navigation-type')).toHaveTextContent('REPLACE');
    expect(window.localStorage.getItem('teamspeak.session')).toBeNull();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });
});
