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
    const emit = vi.fn();
    Object.assign(mocks.socket, { volatile: { timeout: vi.fn().mockReturnValue({ emit }) } });
    fireEvent.change(screen.getByLabelText('Mensaje para la sala'), { target: { value: 'Adelante' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar mensaje' }));
    expect(emit).toHaveBeenCalledExactlyOnceWith('chat:send', { text: 'Adelante' }, expect.any(Function));
    expect(mocks.createMessage).not.toHaveBeenCalled();
    const saved = { messageId: 'm2', authorId: 'u1', text: 'Adelante', createdAt: '2026-01-01T12:01:00Z' };
    act(() => {
      listeners['chat:message'](saved);
      listeners['chat:message'](saved);
      emit.mock.calls[0][2](null, { ok: true });
    });
    expect(screen.getAllByText('Adelante')).toHaveLength(1);
    act(() => listeners['chat:message']({ messageId: 'm1', authorId: 'u2', text: 'Hola', createdAt: '2026-01-01T12:00:00Z' }));
    expect(screen.getAllByText('Hola')).toHaveLength(1);
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

  it.each([
    ['ROOM_NOT_FOUND', 'La sala no existe.', false],
    ['ROOM_ACCESS_DENIED', 'No tienes acceso a esta sala.', false],
    ['AUTHORIZATION_UNAVAILABLE', 'No pudimos verificar el acceso a la sala. Inténtalo de nuevo.', true],
  ])('distingue %s devuelto después del detalle REST', async (code, message, retry) => {
    const { listeners } = await setupRealtime();
    act(() => listeners.connect());
    act(() => listeners['error:message']({ code }));
    expect(screen.getByText(message)).toBeVisible();
    expect(screen.queryByText('Ingreso confirmado')).not.toBeInTheDocument();
    const recovery = screen.queryByRole('button', { name: 'Reintentar conexión' });
    if (retry) expect(recovery).toBeVisible();
    else expect(recovery).not.toBeInTheDocument();
  });

  it.each(['ROOM_ACCESS_DENIED', 'ROOM_NOT_FOUND'])('revoca el ingreso vigente por %s y bloquea controles', async code => {
    const { view, listeners } = await setupRealtime();
    act(() => {
      listeners.connect();
      listeners['room:joined']({ roomId: 'room-1', participants: ['u1'] });
      acknowledgeJoin();
      listeners['room:access-revoked']({ roomId: 'another-room', code });
    });
    expect(screen.getByText('Ingreso confirmado')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Mensaje para la sala'), { target: { value: 'Texto' } });
    expect(screen.getByRole('button', { name: 'Enviar mensaje' })).toBeEnabled();
    act(() => {
      listeners['room:access-revoked']({ roomId: 'room-1', code });
      listeners['room:joined']({ roomId: 'room-1', participants: ['u1'] });
      listeners.connect();
    });
    expect(screen.queryByText('Ingreso confirmado')).not.toBeInTheDocument();
    expect(screen.queryByText('1 participantes')).not.toBeInTheDocument();
    expect(screen.getByText(code === 'ROOM_NOT_FOUND' ? 'La sala no existe.' : 'No tienes acceso a esta sala.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Enviar mensaje' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Micrófono silenciado' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Reintentar conexión' })).not.toBeInTheDocument();
    expect(mocks.socket.disconnect).toHaveBeenCalledOnce();
    expect(mocks.socket.emit.mock.calls.filter(([name]) => name === 'room:join')).toHaveLength(1);
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

  it('muestra estado de carga inicial del historial y estado vacío sin mensajes previos', async () => {
    let resolveHistory!: (value: { messages: unknown[]; nextCursor: string | null }) => void;
    mocks.getRoom.mockResolvedValue({ id: 'room-1', name: 'Sala', ownerId: 'u1' });
    mocks.listMessages.mockReturnValueOnce(new Promise(resolve => { resolveHistory = resolve; }));
    mocks.io.mockReturnValue(mocks.socket);
    renderRoom();

    expect(await screen.findByText('Cargando mensajes anteriores…')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Ver más antiguos' })).not.toBeInTheDocument();

    await act(async () => resolveHistory({ messages: [], nextCursor: null }));
    expect(screen.getByText('Sin mensajes anteriores. Esta sala aún no tiene conversación.')).toBeVisible();
    expect(document.querySelectorAll('.room-chat-message')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Ver más antiguos' })).not.toBeInTheDocument();
  });

  it('pagina mensajes antiguos con Ver más antiguos, evita envíos duplicados y conserva la posición de scroll', async () => {
    let resolveOlder!: (value: { messages: unknown[]; nextCursor: string | null }) => void;
    mocks.getRoom.mockResolvedValue({ id: 'room-1', name: 'Sala', ownerId: 'u1' });
    mocks.listMessages
      .mockResolvedValueOnce({
        messages: [
          { id: 'm3', roomId: 'room-1', authorId: 'u2', text: 'Tercer mensaje', createdAt: '2026-01-01T12:03:00Z' },
          { id: 'm4', roomId: 'room-1', authorId: 'u1', text: 'Cuarto mensaje', createdAt: '2026-01-01T12:04:00Z' },
        ],
        nextCursor: 'cursor-1',
      })
      .mockImplementationOnce(() => new Promise(resolve => { resolveOlder = resolve; }));
    mocks.io.mockReturnValue(mocks.socket);
    renderRoom();

    const loadMore = await screen.findByRole('button', { name: 'Ver más antiguos' });
    const list = document.querySelector('.room-chat-messages') as HTMLElement;
    Object.defineProperty(list, 'scrollHeight', {
      configurable: true,
      get: () => list.querySelectorAll('.room-chat-message').length * 110 + (list.querySelector('.room-chat-load-more') ? 52 : 0),
    });
    list.scrollTop = 40;

    fireEvent.click(loadMore);
    fireEvent.click(loadMore);

    expect(mocks.listMessages).toHaveBeenCalledTimes(2);
    expect(mocks.listMessages).toHaveBeenNthCalledWith(1, 'room-1', { signal: expect.any(AbortSignal) });
    expect(mocks.listMessages).toHaveBeenNthCalledWith(2, 'room-1', { cursor: 'cursor-1', signal: expect.any(AbortSignal) });
    expect(loadMore).toBeDisabled();

    await act(async () =>
      resolveOlder({
        messages: [
          { id: 'm1', roomId: 'room-1', authorId: null, authorDeleted: true, text: 'Primer mensaje', createdAt: '2026-01-01T12:01:00Z' },
          { id: 'm2', roomId: 'room-1', authorId: 'u2', text: 'Segundo mensaje', createdAt: '2026-01-01T12:02:00Z' },
          { id: 'm3', roomId: 'room-1', authorId: 'u2', text: 'Tercer mensaje', createdAt: '2026-01-01T12:03:00Z' },
        ],
        nextCursor: null,
      }),
    );

    expect(screen.queryByRole('button', { name: /Ver más antiguos|Cargando mensajes anteriores/ })).not.toBeInTheDocument();
    const renderedTexts = Array.from(document.querySelectorAll('.room-chat-message p')).map(el => el.textContent);
    expect(renderedTexts).toEqual(['Primer mensaje', 'Segundo mensaje', 'Tercer mensaje', 'Cuarto mensaje']);
    expect(screen.getByText('Usuario eliminado')).toBeVisible();
    // 2 older messages added (+220) and top button removed (-52) => 40 + 168 = 208
    expect(list.scrollTop).toBe(208);
  });

  it('permite reintentar el historial tras error inicial y tras error al paginar sin perder mensajes visibles', async () => {
    mocks.getRoom.mockResolvedValue({ id: 'room-1', name: 'Sala', ownerId: 'u1' });
    mocks.listMessages
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({
        messages: [
          { id: 'm2', roomId: 'room-1', authorId: 'u2', text: 'Reciente', createdAt: '2026-01-01T12:02:00Z' },
        ],
        nextCursor: 'cursor-1',
      })
      .mockRejectedValueOnce(new Error('503'))
      .mockResolvedValueOnce({
        messages: [
          { id: 'm1', roomId: 'room-1', authorId: 'u2', text: 'Antiguo recuperado', createdAt: '2026-01-01T12:01:00Z' },
        ],
        nextCursor: null,
      });
    mocks.io.mockReturnValue(mocks.socket);
    renderRoom();

    expect(await screen.findByText('No pudimos cargar el historial de mensajes.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('Reciente')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Ver más antiguos' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar los mensajes anteriores.');
    expect(screen.getByText('Reciente')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Antiguo recuperado')).toBeVisible();
    expect(mocks.listMessages).toHaveBeenLastCalledWith('room-1', { cursor: 'cursor-1', signal: expect.any(AbortSignal) });
    expect(screen.queryByRole('button', { name: 'Ver más antiguos' })).not.toBeInTheDocument();
  });

  it('ignora respuestas obsoletas de historial al cambiar de sala', async () => {
    let resolveRoom1History!: (value: { messages: unknown[]; nextCursor: string | null }) => void;
    const router = createMemoryRouter([{ path: '/salas/:id', element: <RoomPage /> }], {
      initialEntries: ['/salas/room-1'],
    });
    mocks.getRoom.mockImplementation(async (id: string) => ({ id, name: id, ownerId: 'u1' }));
    mocks.listMessages
      .mockImplementationOnce(() => new Promise(resolve => { resolveRoom1History = resolve; }))
      .mockResolvedValueOnce({
        messages: [
          { id: 'm-room-2', roomId: 'room-2', authorId: 'u2', text: 'Mensaje sala 2', createdAt: '2026-01-01T12:05:00Z' },
        ],
        nextCursor: null,
      });
    mocks.io.mockReturnValue(mocks.socket);
    render(<RouterProvider router={router} />);

    await waitFor(() => expect(mocks.listMessages).toHaveBeenCalledTimes(1));
    await act(async () => { await router.navigate('/salas/room-2'); });
    expect(await screen.findByText('Mensaje sala 2')).toBeVisible();

    await act(async () =>
      resolveRoom1History({
        messages: [
          { id: 'm-room-1', roomId: 'room-1', authorId: 'u2', text: 'Mensaje viejo sala 1', createdAt: '2026-01-01T12:00:00Z' },
        ],
        nextCursor: 'cursor-obsoleto',
      }),
    );

    expect(screen.queryByText('Mensaje viejo sala 1')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ver más antiguos' })).not.toBeInTheDocument();
  });

  it('conserva orden cronológico al reintentar historial intercalado con mensajes en vivo y muestra estado de carga', async () => {
    let resolveRetry!: (v: { messages: unknown[]; nextCursor: string | null }) => void;
    mocks.getRoom.mockResolvedValue({ id: 'room-1', name: 'Sala', ownerId: 'u1' });
    mocks.listMessages
      .mockRejectedValueOnce(new Error('503'))
      .mockImplementationOnce(() => new Promise(resolve => { resolveRetry = resolve; }));
    mocks.io.mockReturnValue(mocks.socket);
    renderRoom();

    await waitFor(() => expect(mocks.socket.connect).toHaveBeenCalled());
    const listeners = Object.fromEntries(mocks.socket.on.mock.calls.map(([n, cb]) => [n, cb]));
    act(() => {
      listeners['connect']();
      listeners['room:joined']({ roomId: 'room-1', participants: ['u1', 'u2'] });
      mocks.socket.emit.mock.calls.filter(([e]) => e === 'room:join').at(-1)?.[2]?.({ ok: true });
    });

    const retry = await screen.findByRole('button', { name: 'Reintentar' });
    act(() => {
      listeners['chat:message']({ messageId: 'm2', authorId: 'u2', text: 'Segundo (12:02)', createdAt: '2026-01-01T12:02:00Z' });
      listeners['chat:message']({ messageId: 'm4', authorId: 'u2', text: 'Cuarto (12:04)', createdAt: '2026-01-01T12:04:00Z' });
    });

    retry.focus();
    fireEvent.click(retry);
    expect(screen.getByText('Cargando mensajes anteriores…')).toBeVisible();
    expect(document.activeElement?.tagName).not.toBe('BODY');

    await act(async () =>
      resolveRetry({
        messages: [
          { id: 'm1', roomId: 'room-1', authorId: 'u2', text: 'Primero (12:01)', createdAt: '2026-01-01T12:01:00Z' },
          { id: 'm2', roomId: 'room-1', authorId: 'u2', text: 'Segundo (12:02)', createdAt: '2026-01-01T12:02:00Z' },
          { id: 'm3', roomId: 'room-1', authorId: 'u2', text: 'Tercero (12:03)', createdAt: '2026-01-01T12:03:00Z' },
          { id: 'm4', roomId: 'room-1', authorId: 'u2', text: 'Cuarto (12:04)', createdAt: '2026-01-01T12:04:00Z' },
        ],
        nextCursor: null,
      }),
    );

    const rendered = Array.from(document.querySelectorAll('.room-chat-message p')).map(el => el.textContent);
    expect(rendered).toEqual(['Primero (12:01)', 'Segundo (12:02)', 'Tercero (12:03)', 'Cuarto (12:04)']);
    expect(document.activeElement?.tagName).not.toBe('BODY');
  });

  it('mantiene scroll ante mensajes en vivo o desplazamiento en vuelo, ajusta al llegar al inicio y preserva foco', async () => {
    let resolveOlder1!: (v: { messages: unknown[]; nextCursor: string | null }) => void;
    let resolveOlder2!: (v: { messages: unknown[]; nextCursor: string | null }) => void;
    mocks.getRoom.mockResolvedValue({ id: 'room-1', name: 'Sala', ownerId: 'u1' });
    mocks.listMessages
      .mockResolvedValueOnce({
        messages: [{ id: 'm3', roomId: 'room-1', authorId: 'u2', text: 'M3', createdAt: '2026-01-01T12:03:00Z' }],
        nextCursor: 'c1',
      })
      .mockImplementationOnce(() => new Promise(r => { resolveOlder1 = r; }))
      .mockImplementationOnce(() => new Promise(r => { resolveOlder2 = r; }));
    mocks.io.mockReturnValue(mocks.socket);
    renderRoom();

    const loadMore = await screen.findByRole('button', { name: 'Ver más antiguos' });
    await waitFor(() => expect(mocks.socket.connect).toHaveBeenCalled());
    const listeners = Object.fromEntries(mocks.socket.on.mock.calls.map(([n, cb]) => [n, cb]));
    act(() => {
      listeners['connect']();
      listeners['room:joined']({ roomId: 'room-1', participants: ['u1'] });
      mocks.socket.emit.mock.calls.filter(([e]) => e === 'room:join').at(-1)?.[2]?.({ ok: true });
    });

    const list = document.querySelector('.room-chat-messages') as HTMLElement;
    Object.defineProperty(list, 'scrollHeight', {
      configurable: true,
      get: () => list.querySelectorAll('.room-chat-message').length * 110 + (list.querySelector('.room-chat-load-more') ? 52 : 0),
    });
    list.scrollTop = 40;

    fireEvent.click(loadMore);
    act(() => listeners['chat:message']({ messageId: 'm4', authorId: 'u2', text: 'Live', createdAt: '2026-01-01T12:04:00Z' }));
    list.scrollTop = 180;

    await act(async () =>
      resolveOlder1({
        messages: [{ id: 'm1', roomId: 'room-1', authorId: 'u2', text: 'Old', createdAt: '2026-01-01T12:01:00Z' }],
        nextCursor: 'c2',
      }),
    );
    // 1 older message prepended (+110), ignoring live message height already committed before resolve
    expect(list.scrollTop).toBe(290);

    const loadMore2 = screen.getByRole('button', { name: 'Ver más antiguos' });
    loadMore2.focus();
    list.scrollTop = 60;
    fireEvent.click(loadMore2);

    await act(async () => resolveOlder2({ messages: [], nextCursor: null }));
    // Empty final page removes top button (-52) => 60 - 52 = 8
    expect(list.scrollTop).toBe(8);
    expect(document.activeElement?.tagName).not.toBe('BODY');
  });

  it('mantiene un color de avatar consistente por remitente en historial, paginación y tiempo real', async () => {
    mocks.getRoom.mockResolvedValue({ id: 'room-1', name: 'Sala', ownerId: 'u1' });
    mocks.listMessages
      .mockResolvedValueOnce({
        messages: [
          { id: 'm2', roomId: 'room-1', authorId: 'u2', text: 'Segundo', createdAt: '2026-01-01T12:02:00Z' },
          { id: 'm3', roomId: 'room-1', authorId: 'u2', text: 'Tercero', createdAt: '2026-01-01T12:03:00Z' },
          { id: 'm4', roomId: 'room-1', authorId: 'u1', text: 'Mío', createdAt: '2026-01-01T12:04:00Z' },
        ],
        nextCursor: 'cursor-1',
      })
      .mockResolvedValueOnce({
        messages: [
          { id: 'm1', roomId: 'room-1', authorId: 'u2', text: 'Primero', createdAt: '2026-01-01T12:01:00Z' },
        ],
        nextCursor: null,
      });
    mocks.io.mockReturnValue(mocks.socket);
    renderRoom();

    const loadMore = await screen.findByRole('button', { name: 'Ver más antiguos' });
    await waitFor(() => expect(mocks.socket.connect).toHaveBeenCalled());
    const listeners = Object.fromEntries(mocks.socket.on.mock.calls.map(([n, cb]) => [n, cb]));
    act(() => {
      listeners['connect']();
      listeners['room:joined']({ roomId: 'room-1', participants: ['u1', 'u2'] });
      mocks.socket.emit.mock.calls.filter(([e]) => e === 'room:join').at(-1)?.[2]?.({ ok: true });
    });

    act(() => {
      listeners['chat:message']({ messageId: 'm5', authorId: 'u2', text: 'En vivo', createdAt: '2026-01-01T12:05:00Z' });
    });

    fireEvent.click(loadMore);
    await screen.findByText('Primero');

    const avatarsByText = (text: string) => {
      const article = screen.getByText(text).closest('.room-chat-message');
      const avatar = article?.querySelector('.room-chat-avatar');
      return Array.from(avatar?.classList ?? []).find(name => name.startsWith('room-sidebar-avatar-'));
    };

    const u2Tones = [
      avatarsByText('Primero'),
      avatarsByText('Segundo'),
      avatarsByText('Tercero'),
      avatarsByText('En vivo'),
    ];
    expect(u2Tones[0]).toMatch(/^room-sidebar-avatar-[123]$/);
    expect(new Set(u2Tones).size).toBe(1);
    expect(avatarsByText('Mío')).toBe('room-sidebar-avatar-0');
  });

  it('muestra nombre y apellido en historial, paginación y tiempo real conservando Tú y Usuario eliminado', async () => {
    mocks.getRoom.mockResolvedValue({ id: 'room-1', name: 'Sala', ownerId: 'u1' });
    mocks.listMessages
      .mockResolvedValueOnce({
        messages: [
          { id: 'm2', roomId: 'room-1', authorId: 'u2', authorName: 'Ana Martínez', text: 'Mensaje inicial', createdAt: '2026-01-01T12:02:00Z' },
          { id: 'm3', roomId: 'room-1', authorId: 'u1', authorName: 'Mateo López', text: 'Mensaje propio', createdAt: '2026-01-01T12:03:00Z' },
          { id: 'm4', roomId: 'room-1', authorId: null, authorDeleted: true, authorName: null, text: 'Mensaje anónimo', createdAt: '2026-01-01T12:04:00Z' },
        ],
        nextCursor: 'cursor-1',
      })
      .mockResolvedValueOnce({
        messages: [
          { id: 'm1', roomId: 'room-1', authorId: 'u2', authorName: 'Ana Martínez', text: 'Mensaje antiguo', createdAt: '2026-01-01T12:01:00Z' },
        ],
        nextCursor: null,
      });
    mocks.io.mockReturnValue(mocks.socket);
    renderRoom();

    const loadMore = await screen.findByRole('button', { name: 'Ver más antiguos' });
    await waitFor(() => expect(mocks.socket.connect).toHaveBeenCalled());
    const listeners = Object.fromEntries(mocks.socket.on.mock.calls.map(([n, cb]) => [n, cb]));
    act(() => {
      listeners['connect']();
      listeners['room:joined']({ roomId: 'room-1', participants: ['u1', 'u2'] });
      mocks.socket.emit.mock.calls.filter(([e]) => e === 'room:join').at(-1)?.[2]?.({ ok: true });
    });

    act(() => {
      listeners['chat:message']({ messageId: 'm5', authorId: 'u2', authorName: 'Ana Martínez', text: 'Mensaje en vivo', createdAt: '2026-01-01T12:05:00Z' });
    });

    fireEvent.click(loadMore);
    await screen.findByText('Mensaje antiguo');

    const senderFor = (text: string) => {
      const article = screen.getByText(text).closest('.room-chat-message');
      return {
        sender: article?.querySelector('.room-chat-message-meta strong')?.textContent,
        initials: article?.querySelector('.room-chat-avatar')?.textContent,
      };
    };

    expect(senderFor('Mensaje antiguo')).toEqual({ sender: 'Ana Martínez', initials: 'AM' });
    expect(senderFor('Mensaje inicial')).toEqual({ sender: 'Ana Martínez', initials: 'AM' });
    expect(senderFor('Mensaje en vivo')).toEqual({ sender: 'Ana Martínez', initials: 'AM' });
    expect(senderFor('Mensaje propio')).toEqual({ sender: 'Tú', initials: 'T' });
    expect(senderFor('Mensaje anónimo')).toEqual({ sender: 'Usuario eliminado', initials: 'UE' });
  });

  it('muestra nombre y apellido en la cuadrícula de participantes al ingresar y cuando se unen nuevos participantes', async () => {
    mocks.getRoom.mockResolvedValue({ id: 'room-1', name: 'Sala', ownerId: 'u1' });
    mocks.listMessages.mockResolvedValue({ messages: [], nextCursor: null });
    mocks.io.mockReturnValue(mocks.socket);
    renderRoom();

    await waitFor(() => expect(mocks.socket.connect).toHaveBeenCalled());
    const listeners = Object.fromEntries(mocks.socket.on.mock.calls.map(([n, cb]) => [n, cb]));
    act(() => {
      listeners['connect']();
      listeners['room:joined']({
        roomId: 'room-1',
        participants: ['u1', 'u2'],
        participantNames: { u1: 'Ana', u2: 'Carlos Ruiz' },
      });
      mocks.socket.emit.mock.calls.filter(([e]) => e === 'room:join').at(-1)?.[2]?.({ ok: true });
    });

    act(() => {
      listeners['room:participant-joined']({ userId: 'u3', authorName: 'Luis Gómez' });
      listeners['room:participant-joined']({ userId: 'u4abcd12', authorName: null });
    });

    const cardFor = (name: string) => {
      const card = screen.getByText(name).closest('.participant-card');
      return {
        name: card?.querySelector('.participant-name')?.textContent,
        initials: card?.querySelector('.participant-avatar')?.textContent,
      };
    };

    expect(cardFor('Ana Martínez · Tú')).toEqual({ name: 'Ana Martínez · Tú', initials: 'AM' });
    expect(cardFor('Carlos Ruiz')).toEqual({ name: 'Carlos Ruiz', initials: 'CR' });
    expect(cardFor('Luis Gómez')).toEqual({ name: 'Luis Gómez', initials: 'LG' });
    expect(cardFor('Usuario u4abcd')).toEqual({ name: 'Usuario u4abcd', initials: 'US' });
  });
});
