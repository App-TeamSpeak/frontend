import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../services/api';

const mocks = vi.hoisted(() => ({ createRoom: vi.fn(), joinRoom: vi.fn() }));
vi.mock('../services/api', () => {
  class MockApiError extends Error {
    readonly code: string;
    readonly status: number;
    constructor(status: number, payload: { code: string; message: string }) {
      super(payload.message);
      this.name = 'ApiError';
      this.status = status;
      this.code = payload.code;
    }
  }
  return { api: mocks, ApiError: MockApiError };
});

import { RoomEntryPage } from './RoomEntryPage';

function LocationProbe() {
  return <span data-testid="location">{useLocation().pathname}</span>;
}

function renderEntry(create = false, initialEntry = create ? '/salas/crear' : '/salas/unirse') {
  return render(
    <RouterProvider
      router={createMemoryRouter(
        [{ path: '*', element: <><LocationProbe /><RoomEntryPage create={create} /></> }],
        { initialEntries: [initialEntry] },
      )}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe('RoomEntryPage', () => {
  it('creates a room and navigates to it', async () => {
    mocks.createRoom.mockResolvedValue({ id: 'room 1', name: 'Sala', ownerId: 'u1' });
    renderEntry(true);
    fireEvent.change(screen.getByLabelText('Nombre de la sala'), { target: { value: ' Sala ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear sala' }));
    fireEvent.click(await screen.findByRole('link', { name: 'Entrar' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/salas/room%201'));
    expect(mocks.createRoom).toHaveBeenCalledWith({ name: 'Sala' }, expect.any(AbortSignal));
  });

  it('valida ID vacío y formato inválido sin peticiones HTTP y aplica textos y accesibilidad de Figma', () => {
    renderEntry();
    const section = document.querySelector('.room-join-page');
    const input = screen.getByLabelText('ID de la sala');
    const submit = screen.getByRole('button', { name: 'Unirse a la sala' });

    expect(screen.getByRole('heading', { name: 'Unirse a sala' })).toBeInTheDocument();
    expect(input).toHaveAttribute('placeholder', 'Ej. CALC-8F2K');
    expect(screen.getByText('No necesitas correo, nombre ni contraseña para unirte desde aquí.')).toBeInTheDocument();

    fireEvent.click(submit);
    expect(screen.getByRole('alert')).toHaveTextContent('Ingresa el código de la Sala para continuar');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'room-entry-error');
    expect(input).toHaveFocus();
    expect(section).toHaveClass('room-management-dialog-join-error');

    fireEvent.change(input, { target: { value: 'nested/room' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(section).not.toHaveClass('room-management-dialog-join-error');

    fireEvent.click(submit);
    expect(screen.getByRole('alert')).toHaveTextContent('El código ingresado no tiene un formato válido');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveFocus();
    expect(section).toHaveClass('room-management-dialog-join-error');
    expect(mocks.joinRoom).not.toHaveBeenCalled();
  });

  it('reporta errores ROOM_NOT_FOUND, VALIDATION_ERROR y genéricos con role="alert"', async () => {
    renderEntry();
    const input = screen.getByLabelText('ID de la sala');
    const submit = screen.getByRole('button', { name: 'Unirse a la sala' });

    mocks.joinRoom.mockRejectedValueOnce(
      new ApiError(404, { success: false, code: 'ROOM_NOT_FOUND', message: 'La sala no existe.' }),
    );
    fireEvent.change(input, { target: { value: 'NO-EXISTE' } });
    fireEvent.click(submit);
    expect(await screen.findByRole('alert')).toHaveTextContent('La sala no existe.');

    mocks.joinRoom.mockRejectedValueOnce(
      new ApiError(400, { success: false, code: 'VALIDATION_ERROR', message: 'Inválido' }),
    );
    fireEvent.change(input, { target: { value: 'otra-sala' } });
    fireEvent.click(submit);
    expect(await screen.findByRole('alert')).toHaveTextContent('El código ingresado no tiene un formato válido');

    mocks.joinRoom.mockRejectedValueOnce(new Error('fallo de red'));
    fireEvent.change(input, { target: { value: 'sala-3' } });
    fireEvent.click(submit);
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos completar la operación. Inténtalo de nuevo.');
  });

  it('muestra estado de carga, evita envíos duplicados y navega usando room.id del backend', async () => {
    let resolveJoin!: (value: { id: string; name: string; ownerId: string }) => void;
    mocks.joinRoom.mockImplementation(() => new Promise(resolve => { resolveJoin = resolve; }));
    renderEntry();

    const input = screen.getByLabelText('ID de la sala');
    const submit = screen.getByRole('button', { name: 'Unirse a la sala' });
    const cancel = screen.getByRole('link', { name: 'Cancelar' });
    const form = input.closest('form');

    fireEvent.change(input, { target: { value: '  alias-sala  ' } });
    fireEvent.click(submit);
    fireEvent.click(submit);

    expect(mocks.joinRoom).toHaveBeenCalledTimes(1);
    expect(mocks.joinRoom).toHaveBeenCalledWith('alias-sala');
    expect(form).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Uniéndote a la sala…');
    expect(input).toBeDisabled();
    expect(submit).toBeDisabled();
    expect(cancel).toHaveAttribute('aria-disabled', 'true');

    fireEvent.click(cancel);
    expect(screen.getByTestId('location')).toHaveTextContent('/salas/unirse');

    resolveJoin({ id: 'canonical room/id', name: 'Cálculo II', ownerId: 'u2' });
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/salas/canonical%20room%2Fid'),
    );
  });

  it('navega al dashboard al pulsar Cancelar', async () => {
    renderEntry();
    fireEvent.click(screen.getByRole('link', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/dashboard'));
  });
});
