export type Sprint0Document = Record<string, unknown>;
export type Sprint0ApiError = { success: false; code: string; message: string };
const apiUrl = (import.meta.env.VITE_API_URL ?? 'http://localhost:10000').replace(/\/+$/, '');
const invalidResponse: Sprint0ApiError = { success: false, code: 'INVALID_RESPONSE', message: 'La API devolvió una respuesta no válida. Reintenta en unos momentos.' };
function isObject(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }

export async function fetchSprint0Demo(signal?: AbortSignal): Promise<Sprint0Document> {
  const timeout = AbortSignal.timeout(60000);
  const response = await fetch(`${apiUrl}/api/sprint0/demo`, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout, cache: 'no-store' });
  let body: unknown;
  try { body = await response.json(); } catch { throw invalidResponse; }
  if (!isObject(body)) throw invalidResponse;
  if (!response.ok || body.success === false) {
    throw { success: false, code: typeof body.code === 'string' ? body.code : 'API_ERROR', message: typeof body.message === 'string' ? body.message : 'La API devolvió un error. Reintenta en unos momentos.' } satisfies Sprint0ApiError;
  }
  if (body.success !== true || !isObject(body.data)) throw invalidResponse;
  return body.data;
}
