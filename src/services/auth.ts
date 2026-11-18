import { browserLocalPersistence, createUserWithEmailAndPassword, GoogleAuthProvider, onIdTokenChanged, sendEmailVerification, sendPasswordResetEmail, setPersistence, signInWithEmailAndPassword, signInWithPopup, signOut, updateProfile as updateFirebaseProfile, type User } from 'firebase/auth';
import { assertFirebaseConfiguration, firebaseAuth } from '../firebase';
import { api, ApiError, type ProfileResponse } from './api';

export type AuthUser = { id: string; name: string; apellido: string; email: string; username?: string; avatarUrl: string | null; emailVerified: boolean; profileError?: string };
export class AuthError extends Error { readonly code: string; constructor(code: string, message: string) { super(message); this.name = 'AuthError'; this.code = code; } }
const pendingKey = 'teamspeak.pending-profile';
type PendingProfile = { nombre: string; apellido: string };

type ProfileFailure = { error: unknown; kind: 'authoritative' | 'transient' };
type ProfileSession = {
  user: User;
  cached?: ProfileResponse;
  failure?: ProfileFailure;
  pending?: Promise<ProfileResponse>;
};
const invalidProfileCodes = new Set([
  'PROFILE_INCONSISTENT', 'PROFILE_NOT_FOUND', 'PROFILE_INCOMPLETE', 'EMAIL_NOT_VERIFIED',
  'ACCOUNT_DELETION_PENDING', 'ACCOUNT_DELETION_BLOCKED', 'ACCOUNT_DELETED',
  'ACCOUNT_DELETION_INCONSISTENT',
]);
let session: ProfileSession | undefined;
let signingOut = false;

function currentSession(user: User): ProfileSession {
  if (signingOut || user !== firebaseAuth.currentUser) throw new AuthError('AUTH_REQUIRED', 'Inicia sesión para continuar.');
  if (session?.user !== user) session = { user };
  return session;
}

function assertSession(expected: ProfileSession) {
  if (session !== expected || firebaseAuth.currentUser !== expected.user) {
    throw new AuthError('AUTH_REQUIRED', 'Inicia sesión para continuar.');
  }
}

function confirmProfile(expected: ProfileSession, response: ProfileResponse) {
  assertSession(expected);
  const valid = response.uid === expected.user.uid &&
    ((response.profileStatus === 'incomplete' && response.profile === null) ||
    (response.profileStatus === 'complete' && response.profile?.uid === expected.user.uid && !!response.profile.username));
  if (!valid) throw new ApiError(502, {
    success: false, code: 'INVALID_RESPONSE', message: 'No pudimos confirmar el perfil.',
  });
  expected.cached = response;
  expected.failure = undefined;
}

function profileUser(user: User, response?: ProfileResponse): AuthUser {
  const profile = response?.profile;
  return { id: user.uid, name: profile?.nombre ?? user.displayName?.split(' ').slice(0, -1).join(' ') ?? user.displayName ?? '', apellido: profile?.apellido ?? user.displayName?.split(' ').slice(-1).join(' ') ?? '', email: user.email ?? '', username: profile?.username, avatarUrl: profile ? profile.avatarUrl : user.photoURL, emailVerified: user.emailVerified };
}
function savePending(value: PendingProfile) { sessionStorage.setItem(pendingKey, JSON.stringify(value)); }
function readPending(): PendingProfile { try { return JSON.parse(sessionStorage.getItem(pendingKey) ?? '{}') as PendingProfile; } catch { return { nombre: '', apellido: '' }; } }
function mapAuthError(error: unknown): never { if (error instanceof ApiError) throw error; const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : 'AUTH_ERROR'; const messages: Record<string, string> = { 'auth/email-already-in-use': 'Este correo ya está registrado. Inicia sesión.', 'auth/invalid-email': 'Introduce un correo electrónico válido.', 'auth/invalid-credential': 'Verifica tu correo y contraseña.', 'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.', 'auth/operation-not-allowed': 'El registro con correo y contraseña no está habilitado en Firebase.', 'auth/admin-restricted-operation': 'El registro con correo y contraseña está restringido en Firebase.', 'auth/invalid-api-key': 'La configuración pública de Firebase no es válida.', 'auth/internal-error': 'Firebase no pudo completar la operación. Revisa la configuración de Authentication.', 'auth/network-request-failed': 'No pudimos conectar con Firebase. Revisa tu conexión e inténtalo de nuevo.', 'auth/popup-closed-by-user': 'Cerraste la ventana de Google antes de terminar.', 'auth/too-many-requests': 'Hay demasiados intentos. Espera unos minutos e inténtalo de nuevo.', 'auth/requires-recent-login': 'Vuelve a iniciar sesión para confirmar esta acción.' }; throw new AuthError(code, messages[code] ?? 'No pudimos completar la autenticación. Inténtalo de nuevo.'); }

export async function configureAuth() { assertFirebaseConfiguration(); await setPersistence(firebaseAuth, browserLocalPersistence); }
export function subscribeToAuth(callback: (user: AuthUser | null) => void, onIdentityChange?: () => void) {
  let active = true;
  let generation = 0;
  let identity: User | null = null;
  const unsubscribe = onIdTokenChanged(firebaseAuth, async user => {
    if (!active || firebaseAuth.currentUser !== user) return;
    const version = ++generation;
    if (!user) {
      identity = null;
      clearAuthProfileCache();
      callback(null);
      return;
    }
    if (signingOut) return;
    if (identity && identity !== user) onIdentityChange?.();
    identity = user;
    const expected = currentSession(user);
    const next = await resolveProfile(expected).catch(() => null);
    if (active && version === generation && session === expected && firebaseAuth.currentUser === user && next) {
      callback(next.user);
    }
  });
  return () => { active = false; unsubscribe(); };
}
export function currentFirebaseUser() { return firebaseAuth.currentUser; }
export async function refreshCurrentUser() { const user = firebaseAuth.currentUser; if (!user) return null; await user.reload(); await user.getIdToken(true); return user; }
export async function registerUser(input: { nombre: string; apellido: string; email: string; password: string }) { try { await configureAuth(); const credential = await createUserWithEmailAndPassword(firebaseAuth, input.email.trim(), input.password); savePending({ nombre: input.nombre.trim(), apellido: input.apellido.trim() }); await sendEmailVerification(credential.user); return { user: profileUser(credential.user) }; } catch (error) { return mapAuthError(error); } }
export async function loginUser(input: { email: string; password: string }) {
  try {
    await configureAuth();
    const credential = await signInWithEmailAndPassword(firebaseAuth, input.email.trim(), input.password);
    const { user } = await resolveProfile(currentSession(credential.user));
    return { user };
  } catch (error) { return mapAuthError(error); }
}

export async function continueWithGoogle() {
  try {
    await configureAuth();
    const { user } = await signInWithPopup(firebaseAuth, new GoogleAuthProvider());
    const result = await resolveProfile(currentSession(user));
    if (result.response?.profileStatus === 'incomplete') {
      savePending({ nombre: user.displayName?.split(' ')[0] ?? '', apellido: user.displayName?.split(' ').slice(1).join(' ') ?? '' });
    }
    return { user: result.user };
  } catch (error) { return mapAuthError(error); }
}

async function resolveProfile(expected: ProfileSession, refresh = false) {
  try {
    const response = await loadProfile(expected, refresh);
    assertSession(expected);
    return { user: profileUser(expected.user, response), response };
  } catch (error) {
    assertSession(expected);
    const code = error instanceof ApiError ? error.code : 'PROFILE_UNAVAILABLE';
    if (code === 'AUTH_REQUIRED' || code === 'AUTH_INVALID') throw error;
    return { user: { ...profileUser(expected.user), profileError: code }, response: undefined, error };
  }
}

function loadProfile(expected: ProfileSession, refresh = false) {
  if (expected.pending) return expected.pending;
  if (!refresh) {
    if (expected.failure) return Promise.reject(expected.failure.error);
    if (expected.cached) return Promise.resolve(expected.cached);
  }
  const request: Promise<ProfileResponse> = api.getProfile().then(response => {
    assertSession(expected);
    // A confirmed write supersedes any read already in flight.
    if (expected.pending !== request) {
      if (expected.pending) return expected.pending;
      if (expected.failure) throw expected.failure.error;
      if (expected.cached) return expected.cached;
    }
    confirmProfile(expected, response);
    return response;
  }).catch(error => {
    assertSession(expected);
    if (expected.pending !== request) {
      if (expected.pending) return expected.pending;
      if (expected.failure) throw expected.failure.error;
      if (expected.cached) return expected.cached;
      throw error;
    }
    const code = error instanceof ApiError ? error.code : undefined;
    if (code === 'AUTH_REQUIRED' || code === 'AUTH_INVALID') {
      expected.cached = undefined;
      expected.failure = undefined;
      throw error;
    }
    const kind = code && invalidProfileCodes.has(code) ? 'authoritative' : 'transient';
    expected.failure = { error, kind };
    if (expected.failure.kind === 'authoritative') expected.cached = undefined;
    throw error;
  }).finally(() => {
    if (expected.pending === request) expected.pending = undefined;
  });
  expected.pending = request;
  return request;
}

export async function refreshProfile(uid: string) {
  const user = firebaseAuth.currentUser;
  if (!user || user.uid !== uid) throw new AuthError('AUTH_REQUIRED', 'Inicia sesión para continuar.');
  const expected = currentSession(user);
  const result = await resolveProfile(expected, true);
  assertSession(expected);
  return {
    ...result,
    isCurrent: () => session === expected && firebaseAuth.currentUser === user &&
      (result.response ? !expected.failure && expected.cached === result.response : expected.failure?.error === result.error),
  };
}

export function clearAuthProfileCache() { session = undefined; }

export async function completeProfile(username: string) {
  const pending = readPending();
  const user = firebaseAuth.currentUser;
  if (!user) throw new AuthError('AUTH_REQUIRED', 'Inicia sesión para continuar.');
  const expected = currentSession(user);
  try {
    const result = await api.createProfile({ nombre: pending.nombre || user.displayName?.split(' ')[0] || 'Usuario', apellido: pending.apellido || user.displayName?.split(' ').slice(1).join(' ') || 'TeamSpeak', username: username.trim() });
    confirmProfile(expected, result);
    expected.pending = undefined;
    sessionStorage.removeItem(pendingKey);
    return { user: profileUser(user, result) };
  } catch (error) { return mapAuthError(error); }
}
export async function updateUserProfile(input: { nombre?: string; apellido?: string; username?: string; avatarUrl?: string | null }) {
  const user = firebaseAuth.currentUser;
  if (!user) throw new AuthError('AUTH_REQUIRED', 'Inicia sesión para continuar.');
  const expected = currentSession(user);
  try {
    const result = await api.updateProfile(input);
    if (!result.profile || result.profile.uid !== user.uid) {
      throw new ApiError(502, { success: false, code: 'INVALID_RESPONSE', message: 'No pudimos confirmar los cambios.' });
    }
    confirmProfile(expected, result);
    expected.pending = undefined;
    return {
      user: profileUser(user, result),
      profile: result.profile,
      isCurrent: () => session === expected && firebaseAuth.currentUser === user && !expected.failure && expected.cached === result,
    };
  } catch (error) { return mapAuthError(error); }
}
export async function deleteUserAccount() { try { await api.deleteProfile(); clearAuthProfileCache(); await signOut(firebaseAuth); } catch (error) { return mapAuthError(error); } }
export async function resendVerification() { try { if (!firebaseAuth.currentUser) throw new AuthError('AUTH_REQUIRED', 'Inicia sesión para continuar.'); await sendEmailVerification(firebaseAuth.currentUser); } catch (error) { return mapAuthError(error); } }
export async function resetPassword(email: string) { try { assertFirebaseConfiguration(); await sendPasswordResetEmail(firebaseAuth, email.trim()); } catch (error) { return mapAuthError(error); } }
export async function logoutUser() {
  signingOut = true;
  clearAuthProfileCache();
  sessionStorage.removeItem(pendingKey);
  try { await signOut(firebaseAuth); } finally { signingOut = false; }
}
export function getSession(): AuthUser | null { return null; }
