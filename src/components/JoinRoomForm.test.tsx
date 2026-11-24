import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../services/api';

const mocks = vi.hoisted(() => ({ joinRoom: vi.fn() }));
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
  return { api: { joinRoom: mocks.joinRoom }, ApiError: MockApiError };
});

import { JoinRoomForm } from './JoinRoomForm';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

function renderForm(overrides: Partial<React.ComponentProps<typeof JoinRoomForm>> = {}) {
  const onJoined = vi.fn();
  const onInvalidChange = vi.fn();
  const utils = render(
    <JoinRoomForm
      inputId="join-room-input"
      errorId="join-room-error"
      cancelAction={<button type="button">Cancelar</button>}
      onJoined={onJoined}
      onInvalidChange={onInvalidChange}
      {...overrides}
    />,
  );
  return { ...utils, onJoined, onInvalidChange };
}

describe('JoinRoomForm', () => {
  it('renderiza los textos, placeholder y ayuda alineados con Figma', () => {
    renderForm();

    expect(screen.getByLabelText('ID de la sala')).toHaveAttribute('placeholder', 'Ej. CALC-8F2K');
    expect(screen.getByText('No necesitas correo, nombre ni contraseña para unirte desde aquí.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unirse a la sala' })).toBeInTheDocument();
  });

  it('valida ID vacío y formato inválido sin llamar a api.joinRoom', () => {
    const { onInvalidChange } = renderForm();
    const input = screen.getByLabelText('ID de la sala');
    const submit = screen.getByRole('button', { name: 'Unirse a la sala' });

    fireEvent.click(submit);
    expect(screen.getByRole('alert')).toHaveTextContent('Ingresa el código de la Sala para continuar');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'join-room-error');
    expect(input).toHaveFocus();
    expect(onInvalidChange).toHaveBeenLastCalledWith(true);

    fireEvent.change(input, { target: { value: 'room/1' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'false');
    expect(onInvalidChange).toHaveBeenLastCalledWith(false);

    fireEvent.click(submit);
    expect(screen.getByRole('alert')).toHaveTextContent('El código ingresado no tiene un formato válido');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(mocks.joinRoom).not.toHaveBeenCalled();
  });

  it('muestra estado de carga, evita envíos duplicados y entrega la sala normalizada al completar', async () => {
    let resolveJoin!: (value: { id: string; name: string; ownerId: string }) => void;
    mocks.joinRoom.mockImplementation(
      () => new Promise(resolve => { resolveJoin = resolve; }),
    );
    const { onJoined } = renderForm();

    const input = screen.getByLabelText('ID de la sala');
    fireEvent.change(input, { target: { value: '  CALC-8F2K  ' } });
    const submit = screen.getByRole('button', { name: 'Unirse a la sala' });

    fireEvent.click(submit);
    fireEvent.click(submit);

    expect(mocks.joinRoom).toHaveBeenCalledTimes(1);
    expect(mocks.joinRoom).toHaveBeenCalledWith('CALC-8F2K');
    expect(screen.getByRole('status')).toHaveTextContent('Uniéndote a la sala…');
    expect(input).toBeDisabled();
    expect(submit).toBeDisabled();

    resolveJoin({ id: 'CALC-8F2K', name: 'Cálculo II', ownerId: 'host-1' });
    await waitFor(() =>
      expect(onJoined).toHaveBeenCalledWith({ id: 'CALC-8F2K', name: 'Cálculo II', ownerId: 'host-1' }),
    );
  });

  it('anuncia errores de la API con role="alert" incluyendo ROOM_NOT_FOUND y VALIDATION_ERROR', async () => {
    mocks.joinRoom.mockRejectedValueOnce(
      new ApiError(404, { success: false, code: 'ROOM_NOT_FOUND', message: 'La sala no existe.' }),
    );
    renderForm();

    const input = screen.getByLabelText('ID de la sala');
    fireEvent.change(input, { target: { value: 'NO-EXISTE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unirse a la sala' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('La sala no existe.');

    mocks.joinRoom.mockRejectedValueOnce(
      new ApiError(400, { success: false, code: 'VALIDATION_ERROR', message: 'Inválido' }),
    );
    fireEvent.change(input, { target: { value: 'otro-id' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unirse a la sala' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('El código ingresado no tiene un formato válido');
  });

  it('devuelve el foco al campo de código tras un error HTTP sin restaurarlo si se desmonta o tiene éxito', async () => {
    mocks.joinRoom.mockRejectedValueOnce(
      new ApiError(404, { success: false, code: 'ROOM_NOT_FOUND', message: 'La sala no existe.' }),
    );
    renderForm();

    const input = screen.getByLabelText('ID de la sala');
    const submit = screen.getByRole('button', { name: 'Unirse a la sala' });
    fireEvent.change(input, { target: { value: 'NO-EXISTE' } });
    submit.focus();
    fireEvent.click(submit);

    expect(await screen.findByRole('alert')).toHaveTextContent('La sala no existe.');
    expect(input).toBeEnabled();
    expect(input).toHaveFocus();
  });
});

