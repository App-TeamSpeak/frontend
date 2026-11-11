import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AuthPage } from './AuthPages';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const renderAuth = (register = false) => render(<MemoryRouter><AuthPage register={register} /></MemoryRouter>);

describe('Authentication system states', () => {
  it('starts empty without a global state panel', () => {
    renderAuth();

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ingresar' })).toBeEnabled();
    expect(screen.getByText('¿Olvidaste tu contraseña?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Registro con Google/ })).toBeInTheDocument();
  });

  it('shows field errors when login is submitted empty', () => {
    renderAuth();

    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Usuario o correo electrónico')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Ingresa tu usuario o correo electrónico')).toBeInTheDocument();
    expect(screen.getByLabelText('Usuario o correo electrónico')).toHaveFocus();
    expect(screen.getByLabelText('Usuario o correo electrónico')).toHaveAttribute('aria-describedby', 'error-user');
  });

  it('reports only the empty login password when the user is present', () => {
    renderAuth();

    fireEvent.change(screen.getByLabelText('Usuario o correo electrónico'), { target: { value: 'ana@universidad.edu' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }));

    expect(screen.getByLabelText('Contraseña')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Usuario o correo electrónico')).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByLabelText('Contraseña')).toHaveFocus();
  });

  it('disables login while loading and returns to the clean form', () => {
    vi.useFakeTimers();
    renderAuth();

    fireEvent.change(screen.getByLabelText('Usuario o correo electrónico'), { target: { value: 'ana@universidad.edu' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'correcta' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }));

    expect(screen.getByRole('button', { name: 'Ingresando…' })).toBeDisabled();
    expect(screen.getByLabelText('Usuario o correo electrónico').closest('form')).toHaveAttribute('aria-busy', 'true');

    expect(screen.getByLabelText('Usuario o correo electrónico').closest('form')).toHaveAttribute('aria-busy', 'true');
  });

  it('keeps the invalid-credentials message before the recovery link', async () => {
    vi.useFakeTimers();
    renderAuth();

    fireEvent.change(screen.getByLabelText('Usuario o correo electrónico'), { target: { value: 'ana@ejemplo.edu' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'incorrecta' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }));

    await act(async () => {
      vi.advanceTimersByTime(700);
      await Promise.resolve();
    });

    const error = screen.getByRole('alert');
    const recovery = screen.getByText('¿Olvidaste tu contraseña?');
    expect(error).toHaveTextContent('Verifica tu usuario y contraseña e inténtalo de nuevo.');
    expect(error.nextElementSibling).toBe(recovery);
    expect(recovery).toHaveClass('forgot-link');
  });

  it('supports registration validation and clears the state when a field changes', () => {
    renderAuth(true);

    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Completa el campo nombre.')).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre')).toHaveFocus();

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Ana' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Nombre')).toHaveAttribute('aria-invalid', 'false');
  });

  it('reports invalid registration format and password confirmation', () => {
    renderAuth(true);

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'correo-invalido' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'correcta' } });
    fireEvent.change(screen.getByLabelText('Confirmar contraseña'), { target: { value: 'diferente' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(screen.getByLabelText('Correo electrónico')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Confirmar contraseña')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Introduce un correo electrónico válido.')).toBeInTheDocument();
    expect(screen.getByText('Las contraseñas no coinciden.')).toBeInTheDocument();
    expect(screen.getByLabelText('Correo electrónico')).toHaveFocus();
    expect(screen.getByLabelText('Correo electrónico')).toHaveAttribute('aria-describedby', 'error-email');
    expect(screen.getByLabelText('Confirmar contraseña')).toHaveAttribute('aria-describedby', 'error-confirm');
  });

  it('keeps the existing login and registration links', () => {
    renderAuth();
    expect(screen.getByRole('link', { name: 'Crear una cuenta' })).toHaveAttribute('href', '/registro');

    renderAuth(true);
    expect(screen.getByRole('link', { name: 'Inicia sesión' })).toHaveAttribute('href', '/login');
  });
});
