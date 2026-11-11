import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter, useLocation, useNavigationType } from 'react-router-dom';
import { Header } from './Header';
import { AuthProvider } from '../auth/AuthContext';

afterEach(cleanup);
const LocationProbe = () => <output data-testid="location">{useLocation().pathname}</output>;
const NavigationTypeProbe = () => <output data-testid="navigation-type">{useNavigationType()}</output>;
describe('Header', () => {
  it('renders the dashboard header according to the Figma frame', () => {
    render(<MemoryRouter initialEntries={['/dashboard']}><Header /></MemoryRouter>);

    expect(screen.getByRole('link', { name: 'TeamSpeak · Mis salas' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'TeamSpeak · Mis salas' })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByRole('navigation', { name: 'Navegación del panel' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mis salas' })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByRole('link', { name: 'Perfil' })).toHaveAttribute('href', '/perfil');
    expect(screen.queryByRole('img', { name: 'Perfil de usuario' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
  });

  it('keeps the avatar and confirms logout from the adjacent icon', () => {
    window.localStorage.setItem('teamspeak.session', JSON.stringify({ id: 'ready', name: 'Ana Martínez', email: 'ana@test.edu', username: 'ana.martinez' }));
    render(<MemoryRouter initialEntries={['/dashboard']}><AuthProvider><Header /><LocationProbe /><NavigationTypeProbe /></AuthProvider></MemoryRouter>);

    expect(screen.getByRole('link', { name: 'Perfil' })).toHaveTextContent('AM');
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(screen.getByRole('dialog', { name: '¿Cerrar sesión?' })).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cerrar sesión' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/login');
    expect(screen.getByTestId('navigation-type')).toHaveTextContent('REPLACE');
    expect(window.localStorage.getItem('teamspeak.session')).toBeNull();
  });

  it('renders only the brand on the login screen', () => {
    render(<MemoryRouter initialEntries={['/login']}><Header /></MemoryRouter>);

    expect(screen.getByRole('link', { name: 'TeamSpeak · Iniciar sesión' })).toHaveAttribute('href', '/login');
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

});
