import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { Header } from './Header';

const logout = vi.fn().mockResolvedValue(undefined);
vi.mock('../auth/AuthContext', () => ({ useOptionalAuth: () => ({ user: { id: 'u1', email: 'ana@test.edu', name: 'Ana Martínez', username: 'ana_martinez', emailVerified: true }, logout }) }));

describe('Header', () => {
  it('lleva el logotipo público al inicio para evitar enlaces redundantes', () => {
    render(<MemoryRouter initialEntries={['/registro']}><Header /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'TeamSpeak · Inicio' })).toHaveAttribute('href', '/');
  });

  it('muestra navegación global y el modal de cierre', () => {
    render(<MemoryRouter initialEntries={['/dashboard']}><Header /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Mis salas' })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByRole('link', { name: 'Ayuda principal' })).toHaveAttribute('href', '/ayuda');
    expect(screen.getByRole('link', { name: 'Perfil' })).toHaveTextContent('AM');
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    const dialog = screen.getByRole('dialog', { name: '¿Cerrar sesión?' });
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    const reopenedDialog = screen.getByRole('dialog', { name: '¿Cerrar sesión?' });
    fireEvent.click(within(reopenedDialog).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
