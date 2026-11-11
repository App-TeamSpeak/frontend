import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AuthPage } from './AuthPages';

const renderAuth = (register = false) => render(<MemoryRouter><AuthPage register={register} /></MemoryRouter>);

describe('AuthPage', () => {
  it('valida el login y permite mostrar la contraseña', () => {
    renderAuth();
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
    expect(screen.getByText('Completa el campo correo electrónico.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar contraseña' }));
    expect(screen.getByLabelText('Contraseña')).toHaveAttribute('type', 'text');
  });
  it('muestra la ayuda de contraseña en registro', () => {
    renderAuth(true);
    fireEvent.click(screen.getByRole('button', { name: '¿Qué contraseña usar?' }));
    expect(screen.getByRole('dialog', { name: 'Crea una contraseña segura' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Entendido' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
