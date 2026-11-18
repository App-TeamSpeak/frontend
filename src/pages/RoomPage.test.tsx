import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, MemoryRouter, Route, RouterProvider, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PictureInPictureStrip, RoomPage } from './RoomPage';

const mocks = vi.hoisted(() => ({
  user: { id: 'u1', name: 'Ana Martínez', email: 'ana@test.edu' },
  getRoom: vi.fn(),
  listMessages: vi.fn(),
  createMessage: vi.fn(),
  socket: { on: vi.fn(), emit: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), removeAllListeners: vi.fn(), connected: true, active: true, io: { on: vi.fn(), off: vi.fn() } },
  io: vi.fn(),
}));
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('../firebase', () => ({ firebaseAuth: { currentUser: { getIdToken: vi.fn().mockResolvedValue('token') } } }));
vi.mock('../services/api', () => ({ api: mocks, ApiError: class ApiError extends Error { code = ""; } }));
vi.mock('socket.io-client', () => ({ io: mocks.io }));

function renderRoom() { return render(<MemoryRouter initialEntries={['/salas/room-1']}><Routes><Route path="/salas/:id" element={<RoomPage />} /></Routes></MemoryRouter>); }

function acknowledgeJoin() {
  const ack = mocks.socket.emit.mock.calls.filter(([event]) => event === 'room:join').at(-1)?.[2];
  ack?.({ ok: true });
}

beforeEach(() => { vi.clearAllMocks(); mocks.user.id = 'u1'; mocks.socket.connected = true; mocks.socket.active = true; });
afterEach(cleanup);

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
    expect(screen.getByText('Anfitrión · ID room-1')).toBeVisible();
    await waitFor(() => expect(mocks.socket.connect).toHaveBeenCalled());
    const listeners = Object.fromEntries(mocks.socket.on.mock.calls.map(([name, callback]) => [name, callback]));
    act(() => listeners['connect']());
    expect(screen.getByText('Confirmando ingreso…')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Micrófono silenciado' })).toBeDisabled();
    act(() => listeners['room:joined']({ roomId: 'another-room', participants: ['u2'] }));
    expect(screen.getByText('Confirmando ingreso…')).toBeVisible();
    act(() => listeners['room:joined']({ roomId: 'room-1', participants: ['u1', 'u2'] }));
    expect(screen.getByText('Confirmando ingreso…')).toBeVisible();
    act(acknowledgeJoin);
    expect(screen.getByText('Ingreso confirmado')).toBeVisible();
    expect(screen.getByText('2 participantes')).toBeVisible();
    expect(mocks.socket.emit).toHaveBeenCalledWith('media:state', { microphone: false, camera: false });
    fireEvent.click(screen.getByRole('button', { name: 'Micrófono silenciado' }));
    expect(mocks.socket.emit).toHaveBeenCalledWith('media:state', { microphone: true, camera: false });
    fireEvent.click(screen.getByRole('button', { name: 'Cámara apagada' }));
    expect(mocks.socket.emit).toHaveBeenCalledWith('media:state', { microphone: true, camera: true });
    listeners['chat:message']({ authorId: 'u1', text: 'Adelante', createdAt: '2026-01-01T12:01:00Z' });
    expect(screen.queryAllByText('Adelante')).toHaveLength(0);
    fireEvent.change(screen.getByLabelText('Mensaje para la sala'), { target: { value: 'Adelante' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar mensaje' }));
    expect(await screen.findByText('Adelante')).toBeInTheDocument();
  });

  it('shows a member and surfaces a realtime join rejection independently of REST', async () => {
    mocks.getRoom.mockResolvedValue({ id: 'room-1', name: 'Sala', ownerId: 'u2' });
    mocks.listMessages.mockResolvedValue([]);
    mocks.io.mockReturnValue(mocks.socket);
    renderRoom();
    expect(await screen.findByText('Miembro · ID room-1')).toBeVisible();
    const listeners = Object.fromEntries(mocks.socket.on.mock.calls.map(([name, callback]) => [name, callback]));
    act(() => listeners['connect']());
    const join = mocks.socket.emit.mock.calls.filter(([event]) => event === 'room:join').at(-1);
    act(() => join?.[2]({ ok: false, error: { code: 'EVENT_FAILED' } }));
    expect(screen.getByText('Realtime no disponible')).toBeVisible();
    expect(screen.getByText('No pudimos ingresar a la sala en tiempo real.')).toBeVisible();
  });

  async function setupRealtime() {
    mocks.getRoom.mockResolvedValue({ id: 'room-1', name: 'Sala', ownerId: 'u1' });
    mocks.listMessages.mockResolvedValue([]);
    mocks.io.mockReturnValue(mocks.socket);
    const view = renderRoom();
    await waitFor(() => expect(mocks.socket.connect).toHaveBeenCalledOnce());
    const listeners = Object.fromEntries(mocks.socket.on.mock.calls.map(([name, callback]) => [name, callback]));
    return { view, listeners };
  }

  it.each(['io server disconnect', 'io client disconnect'])('conserva el rechazo tras %s', async reason => {
    const { view, listeners } = await setupRealtime();
    act(() => listeners.connect());
    const ack = mocks.socket.emit.mock.calls.find(([event]) => event === 'room:join')?.[2];
    act(() => {
      listeners['error:message']({ code: 'ACCOUNT_UNAVAILABLE' });
      mocks.socket.active = false;
      mocks.socket.connected = false;
      listeners.disconnect(reason);
      ack?.({ ok: false, error: { code: 'EVENT_FAILED' } });
      listeners['room:joined']({ roomId: 'room-1', participants: ['u1'] });
    });
    expect(screen.getByText('Realtime no disponible')).toBeVisible();
    expect(screen.getByText('Tu sesión no tiene autorización para el ingreso en tiempo real.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Reintentar conexión' })).not.toBeInTheDocument();
    expect(screen.queryByText('Ingreso confirmado')).not.toBeInTheDocument();
    view.unmount();
    expect(mocks.socket.removeAllListeners).toHaveBeenCalledOnce();
  });

  it('reconecta y exige otra confirmación, ignorando el acknowledgement anterior', async () => {
    const { listeners } = await setupRealtime();
    act(() => listeners.connect());
    const first = mocks.socket.emit.mock.calls.find(([event]) => event === 'room:join')?.[2];
    act(() => {
      mocks.socket.connected = false;
      listeners.disconnect('transport close');
      listeners['room:joined']({ roomId: 'room-1' });
    });
    expect(screen.getByText('Reconectando…')).toBeVisible();
    act(() => {
      mocks.socket.connected = true;
      listeners.connect();
      listeners.connect();
      first?.({ ok: false });
    });
    expect(screen.getByText('Confirmando ingreso…')).toBeVisible();
    expect(mocks.socket.emit.mock.calls.filter(([event]) => event === 'room:join')).toHaveLength(2);
    act(() => listeners['room:joined']({ roomId: 'room-1' }));
    expect(screen.getByText('Confirmando ingreso…')).toBeVisible();
    act(acknowledgeJoin);
    expect(screen.getByText('Ingreso confirmado')).toBeVisible();
  });

  it('muestra error de handshake no recuperable y ofrece un nuevo intento', async () => {
    const { listeners } = await setupRealtime();
    act(() => {
      mocks.socket.active = false;
      listeners.connect_error({});
    });
    expect(screen.getByText('No pudimos conectar con el servicio en tiempo real.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar conexión' }));
    await waitFor(() => expect(mocks.socket.connect).toHaveBeenCalledTimes(2));
    expect(mocks.socket.removeAllListeners).toHaveBeenCalledOnce();
  });

  it('trata un handshake AUTH_INVALID como terminal y sin reintento', async () => {
    const { listeners } = await setupRealtime();
    act(() => listeners.connect_error({ data: { code: 'AUTH_INVALID' } }));
    expect(screen.getByText('Realtime no disponible')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Reintentar conexión' })).not.toBeInTheDocument();
    expect(mocks.socket.emit).not.toHaveBeenCalled();
  });

  it('termina la espera si se agotan las reconexiones', async () => {
    const { listeners } = await setupRealtime();
    const failed = mocks.socket.io.on.mock.calls.find(([event]) => event === 'reconnect_failed')?.[1];
    act(() => { listeners.disconnect('transport close'); failed?.(); });
    expect(screen.getByText('No pudimos restablecer la conexión en tiempo real.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Reintentar conexión' })).toBeVisible();
  });

  it('ignora una confirmación después del timeout de ingreso', async () => {
    const { listeners } = await setupRealtime();
    vi.useFakeTimers();
    try {
      act(() => listeners.connect());
      act(() => vi.advanceTimersByTime(12000));
      act(() => listeners['room:joined']({ roomId: 'room-1' }));
      expect(screen.getByText('No pudimos confirmar el ingreso en tiempo real.')).toBeVisible();
      expect(screen.queryByText('Ingreso confirmado')).not.toBeInTheDocument();
    } finally { vi.useRealTimers(); }
  });

  it.each(['sala', 'cuenta'])('ignora confirmaciones anteriores después de cambiar de %s', async change => {
    const router = createMemoryRouter([{ path: '/salas/:id', element: <RoomPage /> }], {
      initialEntries: ['/salas/room-1'],
    });
    mocks.getRoom.mockImplementation(async (id: string) => ({ id, name: id, ownerId: 'u1' }));
    mocks.listMessages.mockResolvedValue([]);
    mocks.io.mockReturnValue(mocks.socket);
    const view = render(<RouterProvider router={router} />);
    await waitFor(() => expect(mocks.socket.connect).toHaveBeenCalledOnce());
    const oldConnect = mocks.socket.on.mock.calls.find(([event]) => event === 'connect')?.[1];
    const oldJoined = mocks.socket.on.mock.calls.find(([event]) => event === 'room:joined')?.[1];
    act(() => oldConnect?.());
    const oldAck = mocks.socket.emit.mock.calls.find(([event]) => event === 'room:join')?.[2];

    if (change === 'sala') {
      await act(async () => { await router.navigate('/salas/room-2'); });
    } else {
      mocks.user.id = 'u2';
      view.rerender(<RouterProvider router={router} />);
      await act(async () => { await router.navigate('/salas/room-1?account=changed'); });
    }

    await waitFor(() => expect(mocks.socket.connect).toHaveBeenCalledTimes(2));
    expect(mocks.socket.disconnect).toHaveBeenCalledOnce();
    act(() => {
      oldConnect?.();
      oldJoined?.({ roomId: 'room-1', participants: ['u1'] });
      oldAck?.({ ok: true });
    });
    expect(screen.getByText('Conectando…')).toBeVisible();
    expect(screen.queryByText('Ingreso confirmado')).not.toBeInTheDocument();
    expect(mocks.socket.emit.mock.calls.filter(([event]) => event === 'room:join')).toHaveLength(1);
  });

  it.each([
    ['ROOM_NOT_FOUND', 'La sala no existe.'],
    ['ROOM_ACCESS_DENIED', 'No tienes acceso a esta sala.'],
  ])('trata %s sin abrir Socket.IO', async (code, message) => {
    const { ApiError } = await import('../services/api');
    const error = new ApiError(403, { success: false, code, message });
    Object.assign(error, { code });
    mocks.io.mockClear();
    mocks.getRoom.mockRejectedValueOnce(error);
    renderRoom();
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(mocks.io).not.toHaveBeenCalled();
  });

  it('muestra errores de carga y limpia el socket al desmontar', async () => {
    mocks.getRoom.mockRejectedValue(new Error('offline'));
    mocks.listMessages.mockResolvedValue([]);
    const failed = renderRoom();
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar la sala.');
    failed.unmount();

    mocks.getRoom.mockResolvedValue({ id: 'room-1', name: 'Sala', ownerId: 'u1' });
    mocks.listMessages.mockResolvedValue([]);
    mocks.io.mockReturnValue(mocks.socket);
    const view = renderRoom();
    await screen.findByRole('heading', { name: 'Participantes' });
    await waitFor(() => expect(mocks.socket.connect).toHaveBeenCalled());
    const listeners = Object.fromEntries(mocks.socket.on.mock.calls.map(([name, callback]) => [name, callback]));
    act(() => listeners['connect']());
    act(() => listeners['room:joined']({ roomId: 'room-1', participants: ['u1'] }));
    act(acknowledgeJoin);
    view.unmount();
    expect(mocks.socket.removeAllListeners).toHaveBeenCalledOnce();
    expect(mocks.socket.emit).toHaveBeenCalledWith('room:leave', { roomId: 'room-1' });
    expect(mocks.socket.disconnect).toHaveBeenCalled();
  });
});
