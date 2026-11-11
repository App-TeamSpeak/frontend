import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { PictureInPictureStrip, RoomPage } from './RoomPage';

const mocks = vi.hoisted(() => ({
  getRoom: vi.fn(),
  listMessages: vi.fn(),
  createMessage: vi.fn(),
  socket: { on: vi.fn(), emit: vi.fn(), disconnect: vi.fn() },
  io: vi.fn(),
}));
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', name: 'Ana Martínez', email: 'ana@test.edu' } }) }));
vi.mock('../firebase', () => ({ firebaseAuth: { currentUser: { getIdToken: vi.fn().mockResolvedValue('token') } } }));
vi.mock('../services/api', () => ({ api: mocks, ApiError: class ApiError extends Error {} }));
vi.mock('socket.io-client', () => ({ io: mocks.io }));

function renderRoom() { return render(<MemoryRouter initialEntries={['/salas/room-1']}><Routes><Route path="/salas/:id" element={<RoomPage />} /></Routes></MemoryRouter>); }

describe('RoomPage', () => {
  it('limita miniaturas y anuncia participantes adicionales', () => {
    const participants = Array.from({ length: 6 }, (_, index) => ({ name: `Persona ${index}`, initials: 'P', microphone: 'off' as const, camera: 'off' as const }));
    render(<PictureInPictureStrip participants={participants} />);
    expect(screen.getAllByRole('article')).toHaveLength(4);
    expect(screen.getByLabelText('2 participantes adicionales')).toBeInTheDocument();
  });
  it('muestra carga y permite volver al dashboard', () => {
    mocks.getRoom.mockReturnValue(new Promise(() => {}));
    mocks.listMessages.mockReturnValue(new Promise(() => {}));
    renderRoom();
    expect(screen.getByRole('status')).toHaveTextContent('Preparando tu sala');
    expect(screen.getByRole('link', { name: 'Volver a mis salas' })).toHaveAttribute('href', '/dashboard');
  });

  it('carga una sala, inicia medios apagados, procesa participantes y deduplica ecos propios', async () => {
    mocks.getRoom.mockResolvedValue({ id: 'room-1', name: 'Sala', ownerId: 'u1' });
    mocks.listMessages.mockResolvedValue([{ id: 'm1', roomId: 'room-1', authorId: 'u2', text: 'Hola', createdAt: '2026-01-01T12:00:00Z' }]);
    mocks.createMessage.mockResolvedValue({ id: 'm2', roomId: 'room-1', authorId: 'u1', text: 'Adelante', createdAt: '2026-01-01T12:01:00Z' });
    mocks.io.mockReturnValue(mocks.socket);
    renderRoom();
    await screen.findByRole('heading', { name: 'Participantes' });
    expect(screen.getByRole('button', { name: 'Micrófono silenciado' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Cámara apagada' })).toHaveAttribute('aria-pressed', 'false');
    const listeners = Object.fromEntries(mocks.socket.on.mock.calls.map(([name, callback]) => [name, callback]));
    listeners['connect']();
    listeners['room:joined']({ participants: ['u1', 'u2'] });
    await waitFor(() => expect(screen.getByText('2 participantes')).toBeInTheDocument());
    expect(mocks.socket.emit).toHaveBeenCalledWith('media:state', { microphone: false, camera: false });
    listeners['chat:message']({ authorId: 'u1', text: 'Adelante', createdAt: '2026-01-01T12:01:00Z' });
    expect(screen.queryAllByText('Adelante')).toHaveLength(0);
    fireEvent.change(screen.getByLabelText('Mensaje para la sala'), { target: { value: 'Adelante' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar mensaje' }));
    expect(await screen.findByText('Adelante')).toBeInTheDocument();
  });

  it('muestra errores de carga y limpia el socket al desmontar', async () => {
    mocks.getRoom.mockRejectedValue(new Error('offline'));
    mocks.listMessages.mockResolvedValue([]);
    renderRoom();
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar la sala.');

    mocks.getRoom.mockResolvedValue({ id: 'room-1', name: 'Sala', ownerId: 'u1' });
    mocks.listMessages.mockResolvedValue([]);
    mocks.io.mockReturnValue(mocks.socket);
    const view = renderRoom();
    await screen.findByRole('heading', { name: 'Participantes' });
    view.unmount();
    expect(mocks.socket.emit).toHaveBeenCalledWith('room:leave', { roomId: 'room-1' });
    expect(mocks.socket.disconnect).toHaveBeenCalled();
  });
});
