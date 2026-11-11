// Mock temporal de autenticación para desarrollo del flujo. No sustituye un backend:
// la contraseña sólo se conserva localmente para permitir probar el recorrido completo.
export type AuthUser = {
  id: string;
  name: string;
  email: string;
  username?: string;
};

type StoredUser = AuthUser & { password: string };
type AuthResult = { user: AuthUser };
type AuthErrorCode = 'EMAIL_EXISTS' | 'INVALID_CREDENTIALS' | 'USERNAME_TAKEN';

export class AuthError extends Error {
  code: AuthErrorCode;
  constructor(code: AuthErrorCode, message: string) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}

const sessionKey = 'teamspeak.session';
const usersKey = 'teamspeak.users';
const delayMs = 700;
const seedUsers: StoredUser[] = [{ id: 'user-ana', name: 'Ana Martínez', email: 'ana@ejemplo.edu', username: 'ana.martinez', password: 'correcta' }];

function readUsers(): StoredUser[] {
  try {
    const raw = window.localStorage.getItem(usersKey);
    return raw ? JSON.parse(raw) as StoredUser[] : seedUsers;
  } catch {
    return seedUsers;
  }
}

function writeUsers(users: StoredUser[]) { window.localStorage.setItem(usersKey, JSON.stringify(users)); }
function publicUser(user: StoredUser): AuthUser { const { password: _password, ...safeUser } = user; return safeUser; }
function wait() { return new Promise<void>(resolve => window.setTimeout(resolve, delayMs)); }

export function getSession(): AuthUser | null {
  try {
    const raw = window.localStorage.getItem(sessionKey);
    return raw ? JSON.parse(raw) as AuthUser : null;
  } catch {
    return null;
  }
}

function saveSession(user: AuthUser) { window.localStorage.setItem(sessionKey, JSON.stringify(user)); }

export async function registerUser(input: { name: string; email: string; password: string }): Promise<AuthResult> {
  await wait();
  const users = readUsers();
  if (users.some(user => user.email.toLowerCase() === input.email.toLowerCase())) throw new AuthError('EMAIL_EXISTS', 'Este correo ya está registrado. Usa otro o inicia sesión.');
  const user: StoredUser = { id: `user-${Date.now()}`, name: input.name, email: input.email, password: input.password };
  writeUsers([...users, user]);
  const safeUser = publicUser(user);
  saveSession(safeUser);
  return { user: safeUser };
}

export async function loginUser(input: { identifier: string; password: string }): Promise<AuthResult> {
  await wait();
  const identifier = input.identifier.toLowerCase();
  const user = readUsers().find(candidate => candidate.email.toLowerCase() === identifier || candidate.username?.toLowerCase() === identifier);
  if (!user || user.password !== input.password) throw new AuthError('INVALID_CREDENTIALS', 'Verifica tu usuario y contraseña e inténtalo de nuevo.');
  const safeUser = publicUser(user);
  saveSession(safeUser);
  return { user: safeUser };
}

export async function isUsernameAvailable(username: string): Promise<boolean> {
  await wait();
  return !readUsers().some(user => user.username?.toLowerCase() === username.trim().toLowerCase());
}

export async function saveUsername(username: string): Promise<AuthResult> {
  await wait();
  const session = getSession();
  if (!session) throw new AuthError('INVALID_CREDENTIALS', 'Tu sesión expiró. Ingresa nuevamente.');
  const normalized = username.trim().toLowerCase();
  const users = readUsers();
  const current = users.find(user => user.id === session.id);
  if (!current) throw new AuthError('INVALID_CREDENTIALS', 'Tu sesión expiró. Ingresa nuevamente.');
  if (users.some(user => user.id !== current.id && user.username?.toLowerCase() === normalized)) throw new AuthError('USERNAME_TAKEN', 'Ese nombre ya está en uso. Prueba con otro.');
  const updated = { ...current, username: normalized };
  writeUsers(users.map(user => user.id === current.id ? updated : user));
  const safeUser = publicUser(updated);
  saveSession(safeUser);
  return { user: safeUser };
}

export function logoutUser() { window.localStorage.removeItem(sessionKey); }
export function clearAuthStorage() { window.localStorage.removeItem(sessionKey); window.localStorage.removeItem(usersKey); }
