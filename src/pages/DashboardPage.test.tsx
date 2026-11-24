import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../services/api';
import { DashboardPage } from './DashboardPage';

const { listRooms, createRoom, updateRoom, deleteRoom, joinRoom, auth } = vi.hoisted(() => ({ listRooms: vi.fn().mockResolvedValue([]), createRoom: vi.fn(), updateRoom: vi.fn(), deleteRoom: vi.fn(), joinRoom: vi.fn(), auth: { user: undefined as undefined | { id: string } } }));
beforeEach(() => { vi.clearAllMocks(); listRooms.mockReset().mockResolvedValue([]); auth.user = undefined; });
afterEach(() => cleanup());
vi.mock('../auth/AuthContext', () => ({ useOptionalAuth: () => auth }));
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
  return { api: { listRooms, createRoom, updateRoom, deleteRoom, joinRoom }, ApiError: MockApiError };
});

function LocationProbe() {
  return <span data-testid="location">{useLocation().pathname}</span>;
}

describe('DashboardPage', () => {
  it('carga el estado vacío desde la API', async () => {
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'No tienes salas' })).toBeInTheDocument();
    expect(listRooms).toHaveBeenCalled();
  });
  it('abre el modal para crear una sala', async () => {
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'No tienes salas' });
    fireEvent.click(screen.getByRole('button', { name: 'Crear mi primera sala' }));
    expect(screen.getByRole('dialog', { name: 'Crear sala' })).toBeInTheDocument();
  });

  it('anuncia los errores del formulario de sala', async () => {
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'No tienes salas' });
    fireEvent.click(screen.getByRole('button', { name: 'Crear mi primera sala' }));
    fireEvent.click(screen.getByRole('button', { name: 'Crear sala' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Ingresa un nombre de entre 1 y 80 caracteres');
  });

  it('renders rooms and completes create, edit, delete and join flows', async () => {
    listRooms.mockResolvedValue([{ id: 'room-1', name: 'Física', ownerId: 'u1' }]);
    createRoom.mockResolvedValue({ id: 'room-2', name: 'Cálculo', ownerId: 'u1' });
    updateRoom.mockResolvedValue({ id: 'room-1', name: 'Física avanzada', ownerId: 'u1' });
    deleteRoom.mockResolvedValue({});
    joinRoom.mockResolvedValue({ id: 'room-3', name: 'Química', ownerId: 'u2' });
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Física' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Más opciones de Física' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Editar sala' }));
    fireEvent.change(screen.getByLabelText('Nombre de la sala'), { target: { value: 'Física avanzada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByRole('heading', { name: 'Física avanzada' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Más opciones de Física avanzada' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Eliminar sala' }));
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar sala' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Física avanzada' })).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: '＋ Crear sala' }));
    fireEvent.change(screen.getByLabelText('Nombre de la sala'), { target: { value: 'Cálculo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear sala' }));
    expect(createRoom).toHaveBeenCalledWith({ name: 'Cálculo' }, expect.any(AbortSignal));
    await screen.findByRole('heading', { name: 'Sala creada correctamente' });
    fireEvent.click(screen.getByRole('button', { name: 'Ir a mis salas' }));

    fireEvent.click(screen.getByRole('button', { name: '＋ Unirse a sala' }));
    fireEvent.change(screen.getByLabelText('ID de la sala'), { target: { value: 'room-3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unirse a la sala' }));
    await waitFor(() => expect(joinRoom).toHaveBeenCalledWith('room-3'));
  });

  it('keeps the confirmed room when a list started before POST resolves', async () => {
    let finish!: (value: unknown) => void;
    listRooms.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    createRoom.mockResolvedValueOnce({ id: 'new-room', name: 'Nueva', ownerId: 'u1' });
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    expect(screen.getByRole('status')).toHaveTextContent('Estamos obteniendo tus salas');
    fireEvent.click(screen.getByRole('button', { name: '＋ Crear sala' }));
    fireEvent.change(screen.getByLabelText('Nombre de la sala'), { target: { value: 'Nueva' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear sala' }));
    await screen.findByRole('heading', { name: 'Sala creada correctamente' });
    fireEvent.click(screen.getByRole('button', { name: 'Ir a mis salas' }));
    await act(async () => finish([]));
    expect(screen.getByRole('heading', { name: 'Nueva' })).toBeVisible();
  });

  it('warns about an incomplete list without hiding the confirmed room', async () => {
    let fail!: (error: Error) => void;
    const confirmed = { id: 'new-room', name: 'Nueva', ownerId: 'u1' };
    listRooms.mockReturnValueOnce(new Promise((_, reject) => { fail = reject; }))
      .mockResolvedValueOnce([confirmed, { id: 'old', name: 'Anterior', ownerId: 'u1' }]);
    createRoom.mockResolvedValueOnce(confirmed);
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: '＋ Crear sala' }));
    fireEvent.change(screen.getByLabelText('Nombre de la sala'), { target: { value: 'Nueva' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear sala' }));
    await screen.findByRole('heading', { name: 'Sala creada correctamente' });
    fireEvent.click(screen.getByRole('button', { name: 'Ir a mis salas' }));
    await act(async () => fail(new Error('offline')));
    expect(screen.getByRole('heading', { name: 'Nueva' })).toBeVisible();
    expect(screen.getByText(/No pudimos actualizar el listado completo/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { name: 'Anterior' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Nueva' })).toBeVisible();
    expect(screen.queryByText(/No pudimos actualizar el listado completo/)).not.toBeInTheDocument();
    expect(listRooms).toHaveBeenCalledTimes(2);
  });

  it('conserva el aviso cuando el listado falla antes de crear y recupera el orden de la API', async () => {
    const confirmed = { id: 'new-room', name: 'Nueva', ownerId: 'u1' };
    listRooms.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([
      confirmed, { id: 'old', name: 'Anterior', ownerId: 'u1' },
    ]);
    createRoom.mockResolvedValueOnce(confirmed);
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'No pudimos cargar tus salas' });
    fireEvent.click(screen.getByRole('button', { name: '＋ Crear sala' }));
    fireEvent.change(screen.getByLabelText('Nombre de la sala'), { target: { value: 'Nueva' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear sala' }));
    await screen.findByRole('heading', { name: 'Sala creada correctamente' });
    fireEvent.click(screen.getByRole('button', { name: 'Ir a mis salas' }));
    expect(screen.getByRole('heading', { name: 'Nueva' })).toBeVisible();
    expect(screen.getByText(/No pudimos actualizar el listado completo/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await screen.findByRole('heading', { name: 'Anterior' });
    expect(screen.getAllByRole('heading', { level: 3 }).map(heading => heading.textContent)).toEqual(['Nueva', 'Anterior']);
    expect(screen.queryByText(/No pudimos actualizar el listado completo/)).not.toBeInTheDocument();
  });

  it('renders own rooms in API order and ignores an old account response', async () => {
    let finish!: (value: unknown) => void;
    auth.user = { id: 'u1' };
    listRooms.mockReturnValueOnce(new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce([
      { id: 'new', name: 'Reciente', ownerId: 'u2' }, { id: 'old', name: 'Anterior', ownerId: 'u2' },
      { id: 'other', name: 'Ajena', ownerId: 'u3' },
    ]);
    const page = <MemoryRouter><DashboardPage /></MemoryRouter>;
    const view = render(page);
    auth.user = { id: 'u2' };
    view.rerender(<MemoryRouter><DashboardPage /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Reciente' });
    await act(async () => finish([{ id: 'legacy', name: 'Sesión anterior', ownerId: 'u1' }]));
    expect(screen.getAllByRole('heading', { level: 3 }).map(element => element.textContent)).toEqual(['Reciente', 'Anterior']);
  });

  it('shows API errors and retries successfully', async () => {
    listRooms.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([{ id: 'room-1', name: 'Sala', ownerId: 'u1' }]);
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { name: 'Sala' })).toBeInTheDocument();
  });

  it('valida ID vacío e inválido en el modal de ingreso sin enviar petición HTTP y conserva el foco', async () => {
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'No tienes salas' });

    const trigger = screen.getByRole('button', { name: '＋ Unirse a sala' });
    fireEvent.click(trigger);

    const dialog = screen.getByRole('dialog', { name: 'Unirse a sala' });
    const input = screen.getByLabelText('ID de la sala');
    const submit = screen.getByRole('button', { name: 'Unirse a la sala' });
    expect(input).toHaveFocus();

    fireEvent.click(submit);
    expect(screen.getByRole('alert')).toHaveTextContent('Ingresa el código de la Sala para continuar');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'manage-room-error');
    expect(input).toHaveFocus();
    expect(dialog).toHaveClass('room-management-dialog-join-error');

    fireEvent.change(input, { target: { value: 'nested/room' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(dialog).not.toHaveClass('room-management-dialog-join-error');

    fireEvent.click(submit);
    expect(screen.getByRole('alert')).toHaveTextContent('El código ingresado no tiene un formato válido');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveFocus();
    expect(dialog).toHaveClass('room-management-dialog-join-error');
    expect(joinRoom).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog', { name: 'Unirse a sala' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('anuncia ROOM_NOT_FOUND en el modal de ingreso y mantiene el diálogo abierto', async () => {
    joinRoom.mockRejectedValueOnce(
      new ApiError(404, { success: false, code: 'ROOM_NOT_FOUND', message: 'La sala no existe.' }),
    );
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'No tienes salas' });

    fireEvent.click(screen.getByRole('button', { name: '＋ Unirse a sala' }));
    fireEvent.change(screen.getByLabelText('ID de la sala'), { target: { value: 'NO-EXISTE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unirse a la sala' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('La sala no existe.');
    expect(screen.getByRole('dialog', { name: 'Unirse a sala' })).toBeInTheDocument();
  });

  it('muestra carga, evita envíos duplicados y navega usando room.id devuelto por el backend', async () => {
    let resolveJoin!: (value: { id: string; name: string; ownerId: string }) => void;
    joinRoom.mockImplementation(() => new Promise(resolve => { resolveJoin = resolve; }));
    render(<MemoryRouter initialEntries={['/dashboard']}><LocationProbe /><DashboardPage /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'No tienes salas' });

    fireEvent.click(screen.getByRole('button', { name: '＋ Unirse a sala' }));
    const dialog = screen.getByRole('dialog', { name: 'Unirse a sala' });
    const input = screen.getByLabelText('ID de la sala');
    const submit = screen.getByRole('button', { name: 'Unirse a la sala' });
    const cancel = screen.getByRole('button', { name: 'Cancelar' });

    fireEvent.change(input, { target: { value: '  alias-sala  ' } });
    fireEvent.click(submit);
    fireEvent.click(submit);

    expect(joinRoom).toHaveBeenCalledTimes(1);
    expect(joinRoom).toHaveBeenCalledWith('alias-sala');
    expect(dialog).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Uniéndote a la sala…');
    expect(input).toBeDisabled();
    expect(submit).toBeDisabled();
    expect(cancel).toBeDisabled();

    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(screen.getByRole('dialog', { name: 'Unirse a sala' })).toBeInTheDocument();

    resolveJoin({ id: 'canonical room/id', name: 'Cálculo II', ownerId: 'u2' });
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/salas/canonical%20room%2Fid'),
    );
    expect(screen.queryByRole('dialog', { name: 'Unirse a sala' })).not.toBeInTheDocument();
  });
});
