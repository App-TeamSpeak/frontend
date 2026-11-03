export type Sprint0Document = Record<string, unknown>;
type Sprint0SuccessResponse = { success: true; data: Sprint0Document };
type Sprint0ErrorResponse = { success: false; code?: string; message?: string };
export type Sprint0ApiError = Sprint0ErrorResponse & { code: string };
const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:10000';

export async function fetchSprint0Demo(signal?: AbortSignal): Promise<Sprint0Document> {
  const response = await fetch(`${apiUrl}/api/sprint0/demo`, { signal });
  const body = await response.json() as Sprint0SuccessResponse | Sprint0ErrorResponse;
  if (!response.ok || body.success === false) {
    throw { success: false, code: body.success === false ? body.code ?? 'API_ERROR' : 'API_ERROR', message: body.success === false ? body.message ?? 'La API devolvió un error.' : 'La API devolvió una respuesta no válida.' } satisfies Sprint0ApiError;
  }
  return body.data;
}
