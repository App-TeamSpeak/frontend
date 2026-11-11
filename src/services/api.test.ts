import { afterEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  currentUser: { getIdToken: vi.fn().mockResolvedValue('token') },
}));
vi.mock('../firebase', () => ({ firebaseAuth: auth }));

import { api, ApiError, fetchSprint0Demo } from './api';
afterEach(() => vi.unstubAllGlobals());
describe('Sprint 0 API contract', () => {
  it.each([null, [], {}, { success: true }, { success: true, data: null }, { success: true, data: [] }])('rejects malformed success payload %j', async body => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => body }));
    await expect(fetchSprint0Demo()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it('handles non-JSON proxy errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => { throw new SyntaxError('HTML'); } }));
    await expect(fetchSprint0Demo()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it('bypasses caching and passes cancellation', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: { mensaje: 'actual' } }) });
    vi.stubGlobal('fetch', fetch);
    const controller = new AbortController();
    await expect(fetchSprint0Demo(controller.signal)).resolves.toEqual({ mensaje: 'actual' });
    const [, options] = fetch.mock.calls[0];
    expect(options.cache).toBe('no-store');
    controller.abort();
    expect(options.signal.aborted).toBe(true);
  });
});

describe('API client contract', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    auth.currentUser?.getIdToken.mockClear();
  });

  it('sends bearer headers, JSON bodies and normalizes room/message identifiers', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true, data: { roomId: 'room-1', name: 'Sala', ownerId: 'u1' } }) });
    vi.stubGlobal('fetch', fetch);
    await expect(api.createRoom({ name: 'Sala' })).resolves.toEqual({ id: 'room-1', roomId: 'room-1', name: 'Sala', ownerId: 'u1' });
    const [, options] = fetch.mock.calls[0];
    expect(options.method).toBe('POST');
    expect(options.headers.get('Authorization')).toBe('Bearer token');
    expect(options.headers.get('Content-Type')).toBe('application/json');
    expect(JSON.parse(options.body)).toEqual({ name: 'Sala' });

    fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true, data: [{ messageId: 'm1', senderId: 'u2', roomId: 'room-1', text: 'Hola', createdAt: '2026-01-01' }] }) });
    await expect(api.listMessages('room/1')).resolves.toEqual([{ id: 'm1', messageId: 'm1', authorId: 'u2', senderId: 'u2', roomId: 'room-1', text: 'Hola', createdAt: '2026-01-01' }]);
    expect(fetch.mock.calls[1][0]).toContain('/api/rooms/room%2F1/messages');
  });

  it('covers profile and room operations with their HTTP contracts', async () => {
    const fetch = vi.fn().mockImplementation((url: string) => {
      const data = url.endsWith('/api/rooms') ? [] : url.includes('/api/users/me') ? { uid: 'u1', profileStatus: 'complete', profile: null } : { id: 'room-1', name: 'Sala', ownerId: 'u1' };
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true, data }) });
    });
    vi.stubGlobal('fetch', fetch);
    await api.getProfile();
    await api.createProfile({ nombre: 'Ana', apellido: 'M', username: 'ana_user' });
    await api.updateProfile({ nombre: 'Ana' });
    await api.deleteProfile();
    await api.listRooms();
    await api.getRoom('room-1');
    await api.updateRoom('room-1', { name: 'Nueva' });
    await api.deleteRoom('room-1');
    await api.joinRoom('room-1');
    await api.createMessage('room-1', { text: 'Hola' });
    expect(fetch).toHaveBeenCalledTimes(10);
    expect(fetch.mock.calls.map(([url, options]) => `${options.method ?? 'GET'} ${url}`)).toEqual([
      'GET http://localhost:10000/api/users/me',
      'POST http://localhost:10000/api/users/me',
      'PATCH http://localhost:10000/api/users/me',
      'DELETE http://localhost:10000/api/users/me',
      'GET http://localhost:10000/api/rooms',
      'GET http://localhost:10000/api/rooms/room-1',
      'PATCH http://localhost:10000/api/rooms/room-1',
      'DELETE http://localhost:10000/api/rooms/room-1',
      'POST http://localhost:10000/api/rooms/room-1/join',
      'POST http://localhost:10000/api/rooms/room-1/messages',
    ]);
  });

  it('refreshes the token once after authentication failures', async () => {
    const getIdToken = auth.currentUser.getIdToken;
    getIdToken.mockResolvedValueOnce('stale-token').mockResolvedValueOnce('fresh-token').mockResolvedValueOnce('fresh-token');
    const fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ success: false, code: 'AUTH_INVALID', message: 'expired' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true, data: [] }) });
    vi.stubGlobal('fetch', fetch);
    await expect(api.listRooms()).resolves.toEqual([]);
    expect(getIdToken).toHaveBeenNthCalledWith(1, false);
    expect(getIdToken).toHaveBeenNthCalledWith(2, true);
    expect(getIdToken).toHaveBeenNthCalledWith(3, false);
    expect(fetch.mock.calls[1][1].headers.get('Authorization')).toBe('Bearer fresh-token');
  });

  it('returns structured API errors and rejects invalid JSON', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({ success: false, code: 'EMAIL_NOT_VERIFIED', message: 'Verifica tu correo' }) })
      .mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({ success: false, code: 'EMAIL_NOT_VERIFIED', message: 'Verifica tu correo' }) });
    vi.stubGlobal('fetch', fetch);
    await expect(api.listRooms()).rejects.toBeInstanceOf(ApiError);
    expect(fetch).toHaveBeenCalledTimes(2);

    fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => { throw new SyntaxError('HTML'); } });
    await expect(api.getProfile()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('requires an authenticated user before calling the API', async () => {
    auth.currentUser = null as any;
    await expect(api.listRooms()).rejects.toMatchObject({ code: 'AUTH_REQUIRED', status: 401 });
    auth.currentUser = { getIdToken: vi.fn().mockResolvedValue('token') };
  });
});
