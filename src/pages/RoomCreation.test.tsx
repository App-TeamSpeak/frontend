import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CopyRoomId, RoomCreation, RoomCreationSession } from './RoomCreation';
import { ROOM_CREATION_TIMEOUT_MS, ROOM_REVIEW_TIMEOUT_MS } from './roomCreationState';
import { ApiError } from '../services/api';

const mocks = vi.hoisted(() => ({ createRoom: vi.fn(), listRooms: vi.fn(), identity: { currentUser: null as null | { uid: string } } }));
vi.mock('../firebase', () => ({ firebaseAuth: mocks.identity }));
vi.mock('../services/api', async original => ({
  ...await original<typeof import('../services/api')>(),
  api: mocks,
}));

const room = { id: 'real-room-id', ownerId: 'a', name: 'Sala' };
function open() { return render(<MemoryRouter><RoomCreation onClose={vi.fn()} /></MemoryRouter>); }
function submit(name: string) {
  fireEvent.change(screen.getByLabelText('Nombre de la sala'), { target: { value: name } });
  fireEvent.click(screen.getByRole('button', { name: 'Crear sala' }));
}
beforeEach(() => { vi.resetAllMocks(); mocks.identity.currentUser = null; mocks.createRoom.mockResolvedValue(room); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('Creación compartida', () => {
  it.each(['', '   ', 'a'.repeat(81)])('rechaza nombres fuera del contrato', name => {
    open();
    submit(name);
    expect(screen.getByLabelText('Nombre de la sala')).toHaveAttribute('aria-invalid', 'true');
    expect(mocks.createRoom).not.toHaveBeenCalled();
  });

  it.each([' a ', 'a'.repeat(80)])('acepta los extremos después de recortar', async name => {
    open();
    submit(name);
    expect(await screen.findByText('Sala creada correctamente')).toBeVisible();
    expect(mocks.createRoom).toHaveBeenCalledExactlyOnceWith({ name: name.trim() }, expect.any(AbortSignal));
  });

  it('mantiene la validación de servidor y conserva el nombre', async () => {
    mocks.createRoom.mockRejectedValueOnce(new ApiError(400, { success: false, code: 'VALIDATION_ERROR', message: 'error' }));
    open();
    submit('Mi sala');
    expect(await screen.findByRole('alert')).toHaveTextContent('Revisa el nombre');
    expect(screen.getByLabelText('Nombre de la sala')).toHaveValue('Mi sala');
  });

  it('evita duplicados y exige una decisión después de un resultado incierto', async () => {
    let reject!: (error: Error) => void;
    mocks.createRoom.mockReturnValueOnce(new Promise((_, fail) => { reject = fail; }));
    mocks.listRooms.mockResolvedValueOnce([room]);
    open();
    submit('Sala');
    expect(screen.getByRole('button', { name: 'Creando…' })).toBeDisabled();
    fireEvent.submit(screen.getByLabelText('Nombre de la sala').closest('form')!);
    expect(mocks.createRoom).toHaveBeenCalledTimes(1);
    await act(async () => reject(new TypeError('offline')));
    expect(await screen.findByRole('region', { name: 'Salas actualizadas' })).toHaveTextContent(room.id);
    expect(screen.getByLabelText('Nombre de la sala')).toHaveValue('Sala');
    expect(mocks.createRoom).toHaveBeenCalledTimes(1);
    fireEvent.submit(screen.getByLabelText('Nombre de la sala').closest('form')!);
    expect(mocks.createRoom).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Crear otra vez' }));
    expect(await screen.findByText('Sala creada correctamente')).toBeVisible();
    expect(mocks.createRoom).toHaveBeenCalledTimes(2);
  });

  it('discards a confirmed response after a Firebase identity change', async () => {
    mocks.identity.currentUser = { uid: 'a' };
    let finish!: (value: typeof room) => void;
    mocks.createRoom.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const onCreated = vi.fn();
    render(<MemoryRouter><RoomCreation onClose={vi.fn()} onCreated={onCreated} /></MemoryRouter>);
    submit('Sala');
    mocks.identity.currentUser = { uid: 'b' };
    await act(async () => finish(room));
    expect(onCreated).not.toHaveBeenCalled();
    expect(screen.queryByText('Sala creada correctamente')).not.toBeInTheDocument();
  });

  it('keeps the pending operation when the form remounts and blocks another POST', async () => {
    let finish!: (value: typeof room) => void;
    mocks.createRoom.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const tree = (key: string) => <MemoryRouter><RoomCreationSession>
      <RoomCreation key={key} onClose={vi.fn()} />
    </RoomCreationSession></MemoryRouter>;
    const view = render(tree('first'));
    submit('Sala');
    view.rerender(tree('second'));
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    fireEvent.submit(screen.getByLabelText('Nombre de la sala').closest('form')!);
    expect(mocks.createRoom).toHaveBeenCalledTimes(1);
    await act(async () => finish(room));
    expect(await screen.findByText('Sala creada correctamente')).toBeVisible();
  });

  it('invalidates pending work on logout even when the next session has the same UID', async () => {
    mocks.identity.currentUser = { uid: 'a' };
    let finish!: (value: typeof room) => void;
    mocks.createRoom.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const tree = (key: string) => <MemoryRouter><RoomCreationSession>
      <RoomCreation key={key} onClose={vi.fn()} />
    </RoomCreationSession></MemoryRouter>;
    const view = render(tree('first'));
    submit('Sala');
    mocks.identity.currentUser = null;
    view.rerender(tree('logout'));
    mocks.identity.currentUser = { uid: 'a' };
    view.rerender(tree('new-session'));
    await act(async () => finish(room));
    expect(screen.getByRole('button', { name: 'Crear sala' })).toBeEnabled();
    expect(screen.queryByText('Sala creada correctamente')).not.toBeInTheDocument();
  });

  it('libera Atrás tras el plazo de POST y descarta la respuesta original', async () => {
    vi.useFakeTimers();
    let finish!: (value: typeof room) => void;
    mocks.createRoom.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const router = createMemoryRouter([
      { path: '/dashboard', element: <h1>Mis salas</h1> },
      { path: '/salas/crear', element: <RoomCreation protectNavigation onClose={() => void router.navigate('/dashboard')} /> },
    ], { initialEntries: ['/dashboard', '/salas/crear'] });
    render(<RoomCreationSession><RouterProvider router={router} /></RoomCreationSession>);
    submit('Sala');
    await act(async () => { await router.navigate(-1); });
    expect(router.state.location.pathname).toBe('/salas/crear');
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    await act(async () => { await vi.advanceTimersByTimeAsync(ROOM_CREATION_TIMEOUT_MS); });
    expect(screen.getByRole('alert')).toHaveTextContent('La sala podría haberse creado');
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeEnabled();
    expect(mocks.createRoom.mock.calls[0][1].aborted).toBe(true);
    await act(async () => { await router.navigate(-1); });
    expect(screen.getByRole('heading', { name: 'Mis salas' })).toBeVisible();
    await act(async () => { finish(room); await router.navigate(1); });
    expect(screen.getByRole('alert')).toHaveTextContent('La sala podría haberse creado');
    expect(screen.queryByText('Sala creada correctamente')).not.toBeInTheDocument();
    expect(mocks.createRoom).toHaveBeenCalledOnce();
    expect(mocks.listRooms).not.toHaveBeenCalled();
  });

  it('permite salir y reintentar el GET; una respuesta vencida no sustituye la nueva', async () => {
    vi.useFakeTimers();
    let finish!: (value: typeof room[]) => void;
    mocks.createRoom.mockRejectedValueOnce(new TypeError('offline'));
    mocks.listRooms.mockReturnValueOnce(new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce([]);
    const close = vi.fn();
    const tree = (key: string) => <MemoryRouter><RoomCreationSession>
      <RoomCreation key={key} onClose={close} />
    </RoomCreationSession></MemoryRouter>;
    const view = render(tree('first'));
    await act(async () => { submit('Sala'); });
    expect(screen.getByText('Actualizando tus salas…')).toBeVisible();
    await act(async () => { await vi.advanceTimersByTimeAsync(ROOM_REVIEW_TIMEOUT_MS); });
    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos actualizar tus salas');
    expect(mocks.listRooms.mock.calls[0][0].aborted).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(close).toHaveBeenCalledOnce();
    view.rerender(tree('second'));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Reintentar consulta' })); });
    expect(screen.getByText('La lista está vacía.')).toBeVisible();
    await act(async () => { finish([room]); });
    expect(screen.getByText('La lista está vacía.')).toBeVisible();
    expect(screen.queryByText(room.id, { exact: false })).not.toBeInTheDocument();
    expect(mocks.listRooms).toHaveBeenCalledTimes(2);
    expect(mocks.createRoom).toHaveBeenCalledOnce();
  });

  it('ignora el plazo y el rechazo tardío después de cambiar de cuenta', async () => {
    vi.useFakeTimers();
    mocks.identity.currentUser = { uid: 'a' };
    let fail!: (error: Error) => void;
    mocks.createRoom.mockReturnValueOnce(new Promise((_, reject) => { fail = reject; }));
    const tree = (key: string) => <MemoryRouter><RoomCreationSession>
      <RoomCreation key={key} onClose={vi.fn()} />
    </RoomCreationSession></MemoryRouter>;
    const view = render(tree('first'));
    submit('Sala anterior');
    mocks.identity.currentUser = { uid: 'b' };
    view.rerender(tree('second'));
    await act(async () => { await vi.advanceTimersByTimeAsync(ROOM_CREATION_TIMEOUT_MS); });
    await act(async () => { fail(new Error('respuesta tardía')); });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Nombre de la sala')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Crear sala' })).toBeEnabled();
    expect(mocks.createRoom).toHaveBeenCalledOnce();
    expect(mocks.listRooms).not.toHaveBeenCalled();
  });

  it.each(['success', 'rejected', 'missing'])('anuncia el resultado del portapapeles: %s', async outcome => {
    const writeText = outcome === 'rejected' ? vi.fn().mockRejectedValue(new Error('permission')) : vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: outcome === 'missing' ? undefined : { writeText } });
    try {
      render(<CopyRoomId id={room.id} />);
      const button = screen.getByRole('button', { name: 'Copiar ID' });
      fireEvent.click(button);
      await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(outcome === 'success' ? 'ID copiado.' : 'No pudimos copiar'));
      if (outcome === 'success') {
        expect(button).toHaveAttribute('data-copied', 'true');
        expect(writeText).toHaveBeenCalledWith(room.id);
      } else {
        expect(button).not.toHaveAttribute('data-copied');
        if (outcome !== 'missing') expect(writeText).toHaveBeenCalledWith(room.id);
      }
    } finally {
      Reflect.deleteProperty(navigator, 'clipboard');
    }
  });

  it('limpia la insignia visual de copiado después de 2.5 segundos', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    try {
      render(<CopyRoomId id={room.id} />);
      const button = screen.getByRole('button', { name: 'Copiar ID' });
      await act(async () => {
        fireEvent.click(button);
        await Promise.resolve();
      });
      expect(screen.getByRole('status')).toHaveTextContent('ID copiado.');
      expect(button).toHaveAttribute('data-copied', 'true');

      act(() => {
        vi.advanceTimersByTime(2500);
      });
      expect(screen.getByRole('status')).toHaveTextContent('');
      expect(button).not.toHaveAttribute('data-copied');
    } finally {
      vi.useRealTimers();
      Reflect.deleteProperty(navigator, 'clipboard');
    }
  });
});
