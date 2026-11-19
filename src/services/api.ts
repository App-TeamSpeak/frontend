import { signOut } from 'firebase/auth';
import { firebaseAuth } from '../firebase';

export type Sprint0Document = Record<string, unknown>;
export type ApiErrorPayload = { success: false; code: string; message: string; details?: unknown };
export class ApiError extends Error { readonly code: string; readonly status: number; readonly details?: unknown; constructor(status: number, payload: ApiErrorPayload) { super(payload.message); this.name = 'ApiError'; this.status = status; this.code = payload.code; this.details = payload.details; } }
export type Sprint0ApiError = ApiErrorPayload;
function trimTrailingSlashes(value: string) { let end = value.length; while (end > 0 && value[end - 1] === '/') end -= 1; return value.slice(0, end); }
const apiUrl = trimTrailingSlashes(import.meta.env.VITE_API_URL ?? 'http://localhost:10000');
const invalidResponse: ApiErrorPayload = { success: false, code: 'INVALID_RESPONSE', message: 'La API devolvió una respuesta no válida. Reintenta en unos momentos.' };

export type UserProfile = { uid: string; email: string; nombre: string; apellido: string; username: string; usernameKey: string; avatarUrl: string | null; profileStatus: 'complete'; createdAt: string; updatedAt: string };
export type ProfileResponse = { uid: string; profileStatus: 'complete' | 'incomplete'; profile: UserProfile | null };
export type DeletionStatus = 'none' | 'pending' | 'blocked' | 'completed';
export type DeletionReceipt = { status: 'pending' | 'completed'; statusToken?: string };
export type EmailChangeEligibility = {
  eligible: true; currentEmail: string; targetEmail: string; nextStep: 'verify_before_update_email';
};
export type Room = { id: string; name: string; ownerId: string; createdAt?: string; participants?: number; connected?: number };
export type Message = { id: string; roomId: string; authorId: string; text: string; createdAt: string };
type RoomPayload = Omit<Room, 'id'> & { id?: string; roomId?: string };
type MessagePayload = Message & { messageId?: string; senderId?: string };
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function normalizeRoom(room: RoomPayload): Room { const id = room?.roomId || room?.id; if (typeof id !== 'string' || !id.trim() || typeof room.name !== 'string' || typeof room.ownerId !== 'string') throw new ApiError(502, invalidResponse); return { ...room, id }; }
function normalizeMessage(message: MessagePayload): Message { return { ...message, id: message.id || message.messageId || '', authorId: message.authorId || message.senderId || '' }; }
function payloadFrom(value: unknown, fallback: ApiErrorPayload): ApiErrorPayload { if (!isRecord(value)) return fallback; return { success: false, code: typeof value.code === 'string' ? value.code : fallback.code, message: typeof value.message === 'string' ? value.message : fallback.message, details: value.details }; }
function authRequired() {
  return new ApiError(401, {
    success: false, code: 'AUTH_REQUIRED', message: 'Inicia sesión para continuar.',
  });
}

async function sessionToken(user: NonNullable<typeof firebaseAuth.currentUser>, refresh: boolean) {
  try {
    return await user.getIdToken(refresh);
  } catch (error) {
    const code = isRecord(error) ? error.code : undefined;
    if (code === 'auth/user-token-expired' || code === 'auth/invalid-user-token' || code === 'auth/user-disabled') {
      if (firebaseAuth.currentUser === user) await signOut(firebaseAuth);
      throw authRequired();
    }
    throw error;
  }
}

async function request<T>(path: string, init: RequestInit = {}, user = firebaseAuth.currentUser, retried = false, expectedStatus?: number | ((status: number, data: unknown) => boolean), refreshSession = true, statusToken?: string, allowSignedOutResponse = false): Promise<T> {
  if (!statusToken && (!user || firebaseAuth.currentUser !== user)) throw authRequired();
  init.signal?.throwIfAborted();
  const headers = new Headers(init.headers);
  if (statusToken) headers.set('X-Deletion-Status-Token', statusToken);
  else if (user) headers.set('Authorization', `Bearer ${await (refreshSession ? sessionToken(user, false) : user.getIdToken())}`);
  if (init.body) headers.set('Content-Type', 'application/json');
  if (!statusToken && firebaseAuth.currentUser !== user) throw authRequired();
  init.signal?.throwIfAborted();
  const response = await fetch(`${apiUrl}${path}`, { ...init, headers, cache: 'no-store' });
  let body: unknown = null;
  try { body = await response.json(); } catch {
    if (response.status !== 401) throw new ApiError(response.status, invalidResponse);
  }
  init.signal?.throwIfAborted();
  if (!statusToken && firebaseAuth.currentUser !== user && !(allowSignedOutResponse && !firebaseAuth.currentUser)) throw authRequired();

  const errorCode = isRecord(body) && typeof body.code === 'string' ? body.code : '';
  const invalidSession = response.status === 401 || errorCode === 'AUTH_INVALID';
  if (user && refreshSession && (invalidSession || (response.status === 403 && errorCode === 'EMAIL_NOT_VERIFIED')) && !retried) {
    await sessionToken(user, true);
    return request<T>(path, init, user, true, expectedStatus);
  }
  if (refreshSession && invalidSession && retried) await signOut(firebaseAuth);
  if (!response.ok || !isRecord(body) || body.success !== true) {
    throw new ApiError(response.status, payloadFrom(body, invalidSession
      ? { success: false, code: 'AUTH_INVALID', message: 'Tu sesión expiró. Vuelve a iniciar sesión.' }
      : { success: false, code: 'API_ERROR', message: 'La API devolvió un error. Reintenta en unos momentos.' }));
  }
  if (expectedStatus !== undefined && (typeof expectedStatus === 'number'
    ? response.status !== expectedStatus : !expectedStatus(response.status, body.data))) {
    throw new ApiError(response.status, invalidResponse);
  }
  return body.data as T;
}
export const api = {
  getProfile: (signal?: AbortSignal) => request<ProfileResponse>('/api/users/me', signal ? { signal } : undefined),
  createProfile: (input: { nombre: string; apellido: string; username: string; avatarUrl?: string | null }) => request<ProfileResponse>('/api/users/me', { method: 'POST', body: JSON.stringify(input) }),
  updateProfile: (input: Partial<{ nombre: string; apellido: string; username: string; avatarUrl: string | null }>) => request<ProfileResponse>('/api/users/me', { method: 'PATCH', body: JSON.stringify(input) }),
  requestEmailChange: (newEmail: string, signal?: AbortSignal) =>
    request<EmailChangeEligibility>('/api/users/me/email-change', { method: 'POST', body: JSON.stringify({ newEmail }), signal }, undefined, false, 200, false),
  deleteProfile: (token: string, signal?: AbortSignal) =>
    request<DeletionReceipt>('/api/users/me', { method: 'DELETE', headers: { 'X-Deletion-Status-Token': token }, signal }, undefined, false,
      (status, data) => isRecord(data) &&
        ((status === 200 && data.status === 'completed') || (status === 202 && data.status === 'pending')), false, undefined, true),
  getDeletionStatus: (statusToken: string, signal?: AbortSignal) =>
    request<{ status: DeletionStatus }>('/api/users/me/deletion-status', { signal }, undefined, false,
      (status, data) => status === 200 && isRecord(data) && (data.status === 'none' || data.status === 'pending' ||
        data.status === 'blocked' || data.status === 'completed'), false, statusToken),
  listRooms: (signal?: AbortSignal) => request<RoomPayload[]>('/api/rooms', { signal }).then(rooms => rooms.map(normalizeRoom)), createRoom: (input: { name: string }, signal?: AbortSignal) => request<RoomPayload>('/api/rooms', { method: 'POST', body: JSON.stringify(input), signal }, undefined, false, 201).then(normalizeRoom), getRoom: (id: string) => request<RoomPayload>(`/api/rooms/${encodeURIComponent(id)}`).then(normalizeRoom), updateRoom: (id: string, input: { name: string }) => request<RoomPayload>(`/api/rooms/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) }).then(normalizeRoom), deleteRoom: (id: string) => request<unknown>(`/api/rooms/${encodeURIComponent(id)}`, { method: 'DELETE' }), joinRoom: (id: string) => request<RoomPayload>(`/api/rooms/${encodeURIComponent(id)}/join`, { method: 'POST' }).then(normalizeRoom), listMessages: (id: string) => request<MessagePayload[]>(`/api/rooms/${encodeURIComponent(id)}/messages`).then(messages => messages.map(normalizeMessage)), createMessage: (id: string, input: { text: string }) => request<MessagePayload>(`/api/rooms/${encodeURIComponent(id)}/messages`, { method: 'POST', body: JSON.stringify(input) }).then(normalizeMessage),
};
export async function fetchSprint0Demo(signal?: AbortSignal): Promise<Sprint0Document> { const timeout = AbortSignal.timeout(60000); const response = await fetch(`${apiUrl}/api/sprint0/demo`, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout, cache: 'no-store' }); let body: unknown; try { body = await response.json(); } catch { throw invalidResponse; } if (!isRecord(body)) throw invalidResponse; if (!response.ok || body.success === false) throw payloadFrom(body, { success: false, code: 'API_ERROR', message: 'La API devolvió un error. Reintenta en unos momentos.' }); if (body.success !== true || !isRecord(body.data)) throw invalidResponse; return body.data; }
