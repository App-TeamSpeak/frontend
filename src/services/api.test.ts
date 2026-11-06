import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchSprint0Demo } from './api';
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
