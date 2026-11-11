import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DashboardPage } from './DashboardPage';

const { listRooms, createRoom, updateRoom, deleteRoom, joinRoom } = vi.hoisted(() => ({ listRooms: vi.fn().mockResolvedValue([]), createRoom: vi.fn(), updateRoom: vi.fn(), deleteRoom: vi.fn(), joinRoom: vi.fn() }));
afterEach(() => cleanup());
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
    expect(createRoom).toHaveBeenCalledWith({ name: 'Cálculo' });

    fireEvent.click(screen.getByRole('button', { name: '＋ Unirse a sala' }));
    fireEvent.change(screen.getByLabelText('ID de la sala'), { target: { value: 'room-3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unirse a la sala' }));
    await waitFor(() => expect(joinRoom).toHaveBeenCalledWith('room-3'));
  });

  it('shows API errors and retries successfully', async () => {
    listRooms.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([{ id: 'room-1', name: 'Sala', ownerId: 'u1' }]);
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { name: 'Sala' })).toBeInTheDocument();
  });
});
