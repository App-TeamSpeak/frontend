import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ createRoom: vi.fn(), joinRoom: vi.fn() }));
vi.mock('../services/api', () => ({ api: mocks, ApiError: class ApiError extends Error {} }));

function LocationProbe() { return <span data-testid="location">{useLocation().pathname}</span>; }
function renderEntry(create = false) { return render(<MemoryRouter><LocationProbe /><RoomEntryPage create={create} /></MemoryRouter>); }
import { RoomEntryPage } from './RoomEntryPage';

afterEach(cleanup);

describe('RoomEntryPage', () => {
  it('creates a room and navigates to it', async () => {
    mocks.createRoom.mockResolvedValue({ id: 'room 1' });
    renderEntry(true);
    fireEvent.change(screen.getByLabelText('Nombre de la sala'), { target: { value: ' Sala ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear sala' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/salas/room%201'));
    expect(mocks.createRoom).toHaveBeenCalledWith({ name: 'Sala' });
  });

  it('joins a room and reports API errors', async () => {
    mocks.joinRoom.mockResolvedValueOnce({ id: 'room-2' });
    renderEntry();
    fireEvent.change(screen.getByLabelText('ID de la sala'), { target: { value: 'room-2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unirse a sala' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/salas/room-2'));

    mocks.joinRoom.mockRejectedValueOnce(new Error('No tienes permiso'));
    fireEvent.change(screen.getByLabelText('ID de la sala'), { target: { value: 'room-3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unirse a sala' }));
    expect(await screen.findByRole('status')).toHaveTextContent('No pudimos completar la operación.');
  });
});
