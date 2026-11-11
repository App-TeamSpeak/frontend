import { firebaseAuth } from '../firebase';

export type Sprint0Document = Record<string, unknown>;
export type ApiErrorPayload = { success: false; code: string; message: string; details?: unknown };
export class ApiError extends Error { readonly code: string; readonly status: number; readonly details?: unknown; constructor(status: number, payload: ApiErrorPayload) { super(payload.message); this.name = 'ApiError'; this.status = status; this.code = payload.code; this.details = payload.details; } }
export type Sprint0ApiError = ApiErrorPayload;
const apiUrl = (import.meta.env.VITE_API_URL ?? 'http://localhost:10000').replace(/\/+$/, '');
const invalidResponse: ApiErrorPayload = { success: false, code: 'INVALID_RESPONSE', message: 'La API devolvió una respuesta no válida. Reintenta en unos momentos.' };

export type UserProfile = { uid: string; email: string; nombre: string; apellido: string; username: string; usernameKey: string; avatarUrl: string | null; profileStatus: 'complete'; createdAt: string; updatedAt: string };
export type ProfileResponse = { uid: string; profileStatus: 'complete' | 'incomplete'; profile: UserProfile | null };
export type Room = { id: string; name: string; ownerId: string };
export type Message = { id: string; roomId: string; authorId: string; text: string; createdAt: string };
type RoomPayload = Room & { roomId?: string; participants?: number; connected?: number; createdAt?: string };
type MessagePayload = Message & { messageId?: string; senderId?: string };
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function normalizeRoom(room: RoomPayload): Room { return { ...room, id: room.id || room.roomId || '' }; }
function normalizeMessage(message: MessagePayload): Message { return { ...message, id: message.id || message.messageId || '', authorId: message.authorId || message.senderId || '' }; }
function payloadFrom(value: unknown, fallback: ApiErrorPayload): ApiErrorPayload { if (!isRecord(value)) return fallback; return { success: false, code: typeof value.code === 'string' ? value.code : fallback.code, message: typeof value.message === 'string' ? value.message : fallback.message, details: value.details }; }
async function token(forceRefresh = false) { const user = firebaseAuth.currentUser; if (!user) throw new ApiError(401, { success: false, code: 'AUTH_REQUIRED', message: 'Inicia sesión para continuar.' }); return user.getIdToken(forceRefresh); }
async function request<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  const headers = new Headers(init.headers); headers.set('Authorization', `Bearer ${await token(false)}`); if (init.body) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${apiUrl}${path}`, { ...init, headers, cache: 'no-store' }); let body: unknown = null; try { body = await response.json(); } catch { throw new ApiError(response.status, invalidResponse); }
  const errorCode = isRecord(body) && typeof body.code === 'string' ? body.code : '';
  if ((response.status === 401 || errorCode === 'AUTH_INVALID' || (response.status === 403 && errorCode === 'EMAIL_NOT_VERIFIED')) && !retried) { const user = firebaseAuth.currentUser; if (user) await user.getIdToken(true); return request<T>(path, init, true); }
  if (!response.ok || !isRecord(body) || body.success !== true) throw new ApiError(response.status, payloadFrom(body, { success: false, code: 'API_ERROR', message: 'La API devolvió un error. Reintenta en unos momentos.' }));
  return body.data as T;
}
export const api = {
  getProfile: () => request<ProfileResponse>('/api/users/me'),
  createProfile: (input: { nombre: string; apellido: string; username: string; avatarUrl?: string | null }) => request<ProfileResponse>('/api/users/me', { method: 'POST', body: JSON.stringify(input) }),
  updateProfile: (input: Partial<{ nombre: string; apellido: string; username: string; avatarUrl: string | null }>) => request<ProfileResponse>('/api/users/me', { method: 'PATCH', body: JSON.stringify(input) }),
  deleteProfile: () => request<{ status: string }>('/api/users/me', { method: 'DELETE' }),
  listRooms: () => request<RoomPayload[]>('/api/rooms').then(rooms => rooms.map(normalizeRoom)), createRoom: (input: { name: string }) => request<RoomPayload>('/api/rooms', { method: 'POST', body: JSON.stringify(input) }).then(normalizeRoom), getRoom: (id: string) => request<RoomPayload>(`/api/rooms/${encodeURIComponent(id)}`).then(normalizeRoom), updateRoom: (id: string, input: { name: string }) => request<RoomPayload>(`/api/rooms/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) }).then(normalizeRoom), deleteRoom: (id: string) => request<unknown>(`/api/rooms/${encodeURIComponent(id)}`, { method: 'DELETE' }), joinRoom: (id: string) => request<RoomPayload>(`/api/rooms/${encodeURIComponent(id)}/join`, { method: 'POST' }).then(normalizeRoom), listMessages: (id: string) => request<MessagePayload[]>(`/api/rooms/${encodeURIComponent(id)}/messages`).then(messages => messages.map(normalizeMessage)), createMessage: (id: string, input: { text: string }) => request<MessagePayload>(`/api/rooms/${encodeURIComponent(id)}/messages`, { method: 'POST', body: JSON.stringify(input) }).then(normalizeMessage),
};
export async function fetchSprint0Demo(signal?: AbortSignal): Promise<Sprint0Document> { const timeout = AbortSignal.timeout(60000); const response = await fetch(`${apiUrl}/api/sprint0/demo`, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout, cache: 'no-store' }); let body: unknown; try { body = await response.json(); } catch { throw invalidResponse; } if (!isRecord(body)) throw invalidResponse; if (!response.ok || body.success === false) throw payloadFrom(body, { success: false, code: 'API_ERROR', message: 'La API devolvió un error. Reintenta en unos momentos.' }); if (body.success !== true || !isRecord(body.data)) throw invalidResponse; return body.data; }
