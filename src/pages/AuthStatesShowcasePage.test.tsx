import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AuthStatesShowcasePage } from './AuthStatesShowcasePage';

afterEach(cleanup);

describe('Authentication states showcase', () => {
  it('renders the login and registration state cards without forms', () => {
    render(<MemoryRouter><AuthStatesShowcasePage /></MemoryRouter>);

    expect(screen.getByRole('heading', { name: 'Estados del sistema · Autenticación' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Login' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Registro' })).toBeInTheDocument();
    expect(screen.getAllByText('CARGANDO')).toHaveLength(2);
    expect(screen.getAllByText('ERROR')).toHaveLength(2);
    expect(screen.getAllByText('ÉXITO')).toHaveLength(2);
    expect(screen.getByText('Validando tus credenciales…')).toBeInTheDocument();
    expect(screen.getByText('Validando los datos…')).toBeInTheDocument();
    expect(screen.getByText('No pudimos iniciar sesión')).toBeInTheDocument();
    expect(screen.getByText('No pudimos crear tu cuenta')).toBeInTheDocument();
    expect(screen.getByText('Sesión iniciada correctamente')).toBeInTheDocument();
    expect(screen.getByText('Cuenta creada correctamente')).toBeInTheDocument();
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
  });

  it('includes the initial state note for each context', () => {
    render(<MemoryRouter><AuthStatesShowcasePage /></MemoryRouter>);

    expect(screen.getAllByText(/formulario limpio con placeholders/)).toHaveLength(2);
  });
});
