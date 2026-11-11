import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DashboardPage } from './DashboardPage';

const { listRooms } = vi.hoisted(() => ({ listRooms: vi.fn().mockResolvedValue([]) }));
afterEach(() => cleanup());
vi.mock('../services/api', () => ({ api: { listRooms, createRoom: vi.fn(), updateRoom: vi.fn(), deleteRoom: vi.fn(), joinRoom: vi.fn() }, ApiError: class ApiError extends Error {} }));

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
});
