import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardPage } from './DashboardPage';

const { listRooms, createRoom, updateRoom, deleteRoom, joinRoom, auth } = vi.hoisted(() => ({ listRooms: vi.fn().mockResolvedValue([]), createRoom: vi.fn(), updateRoom: vi.fn(), deleteRoom: vi.fn(), joinRoom: vi.fn(), auth: { user: undefined as undefined | { id: string } } }));
beforeEach(() => { vi.clearAllMocks(); listRooms.mockReset().mockResolvedValue([]); auth.user = undefined; });
afterEach(() => cleanup());
vi.mock('../auth/AuthContext', () => ({ useOptionalAuth: () => auth }));
vi.mock('../services/api', () => ({ api: { listRooms, createRoom, updateRoom, deleteRoom, joinRoom }, ApiError: class ApiError extends Error {} }));

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
});
