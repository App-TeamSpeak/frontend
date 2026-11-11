import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: { currentUser: null as any },
  api: {
    getProfile: vi.fn(),
    createProfile: vi.fn(),
    updateProfile: vi.fn(),
    deleteProfile: vi.fn(),
  },
  setPersistence: vi.fn().mockResolvedValue(undefined),
  onIdTokenChanged: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  sendEmailVerification: vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  signOut: vi.fn().mockResolvedValue(undefined),
  updateProfile: vi.fn().mockResolvedValue(undefined),
  assertFirebaseConfiguration: vi.fn(),
}));

vi.mock('firebase/auth', () => ({
  browserLocalPersistence: 'local',
  GoogleAuthProvider: class GoogleAuthProvider {},
  onIdTokenChanged: mocks.onIdTokenChanged,
  createUserWithEmailAndPassword: mocks.createUserWithEmailAndPassword,
  signInWithEmailAndPassword: mocks.signInWithEmailAndPassword,
  signInWithPopup: mocks.signInWithPopup,
  sendEmailVerification: mocks.sendEmailVerification,
  sendPasswordResetEmail: mocks.sendPasswordResetEmail,
  setPersistence: mocks.setPersistence,
  signOut: mocks.signOut,
  updateProfile: mocks.updateProfile,
}));
vi.mock('../firebase', () => ({ firebaseAuth: mocks.auth, assertFirebaseConfiguration: mocks.assertFirebaseConfiguration }));
vi.mock('./api', () => ({ api: mocks.api, ApiError: class ApiError extends Error { status = 500; code = 'API_ERROR'; } }));

import {
  completeProfile,
  configureAuth,
  continueWithGoogle,
  clearAuthProfileCache,
  currentFirebaseUser,
  deleteUserAccount,
  loginUser,
  logoutUser,
  refreshCurrentUser,
  registerUser,
  resendVerification,
  resetPassword,
  subscribeToAuth,
  updateUserProfile,
} from './auth';

const firebaseUser = (overrides: Record<string, unknown> = {}) => ({
  uid: 'u1',
  email: 'ana@test.edu',
  displayName: 'Ana Martínez',
  photoURL: null,
  emailVerified: true,
  reload: vi.fn().mockResolvedValue(undefined),
  getIdToken: vi.fn().mockResolvedValue('token'),
  ...overrides,
});
const profile = { uid: 'u1', email: 'ana@test.edu', nombre: 'Ana', apellido: 'Martínez', username: 'ana_martinez', usernameKey: 'ana_martinez', avatarUrl: null, profileStatus: 'complete', createdAt: '', updatedAt: '' };

beforeEach(() => {
  vi.clearAllMocks();
  clearAuthProfileCache();
  mocks.auth.currentUser = null;
  sessionStorage.clear();
  mocks.setPersistence.mockResolvedValue(undefined);
  mocks.sendEmailVerification.mockResolvedValue(undefined);
  mocks.sendPasswordResetEmail.mockResolvedValue(undefined);
  mocks.signOut.mockResolvedValue(undefined);
});

describe('auth service', () => {
  it('configures local persistence and exposes the Firebase user', async () => {
    await configureAuth();
    expect(mocks.assertFirebaseConfiguration).toHaveBeenCalled();
    expect(mocks.setPersistence).toHaveBeenCalledWith(mocks.auth, 'local');
    expect(currentFirebaseUser()).toBeNull();
  });

  it('registers a user, stores the pending profile and sends verification', async () => {
    const user = firebaseUser({ emailVerified: false });
    mocks.createUserWithEmailAndPassword.mockResolvedValue({ user });
    mocks.auth.currentUser = user;
    await expect(registerUser({ nombre: ' Ana ', apellido: ' Martínez ', email: ' ana@test.edu ', password: 'secret1' })).resolves.toMatchObject({ user: { id: 'u1', name: 'Ana', apellido: 'Martínez' } });
    expect(mocks.createUserWithEmailAndPassword).toHaveBeenCalledWith(mocks.auth, 'ana@test.edu', 'secret1');
    expect(mocks.sendEmailVerification).toHaveBeenCalledWith(user);
    expect(JSON.parse(sessionStorage.getItem('teamspeak.pending-profile')!)).toEqual({ nombre: 'Ana', apellido: 'Martínez' });
  });

  it('maps Firebase registration errors to a user-facing AuthError', async () => {
    mocks.createUserWithEmailAndPassword.mockRejectedValue({ code: 'auth/email-already-in-use' });
    await expect(registerUser({ nombre: 'Ana', apellido: 'M', email: 'ana@test.edu', password: 'secret1' })).rejects.toMatchObject({ code: 'auth/email-already-in-use', message: 'Este correo ya está registrado. Inicia sesión.' });
  });

  it('logs in and tolerates a missing backend profile', async () => {
    const user = firebaseUser();
    mocks.signInWithEmailAndPassword.mockResolvedValue({ user });
    mocks.api.getProfile.mockResolvedValue({ profile: null });
    await expect(loginUser({ email: ' ana@test.edu ', password: 'secret1' })).resolves.toMatchObject({ user: { id: 'u1', name: 'Ana', apellido: 'Martínez' } });
  });

  it('continues with Google and creates pending names without a profile', async () => {
    const user = firebaseUser({ displayName: 'Ana Martínez' });
    mocks.signInWithPopup.mockResolvedValue({ user });
    mocks.api.getProfile.mockResolvedValue({ profile: null });
    await continueWithGoogle();
    expect(mocks.signInWithPopup).toHaveBeenCalledWith(mocks.auth, expect.anything());
    expect(JSON.parse(sessionStorage.getItem('teamspeak.pending-profile')!)).toEqual({ nombre: 'Ana', apellido: 'Martínez' });
  });

  it('subscribes to token changes and enriches authenticated users', async () => {
    mocks.api.getProfile.mockResolvedValue({ profile });
    const callback = vi.fn();
    subscribeToAuth(callback);
    const listener = mocks.onIdTokenChanged.mock.calls[0][1];
    await listener(null);
    await listener(firebaseUser());
    expect(callback).toHaveBeenNthCalledWith(1, null);
    expect(callback).toHaveBeenNthCalledWith(2, expect.objectContaining({ username: 'ana_martinez' }));
  });

  it('reuses the profile request across repeated token changes', async () => {
    mocks.api.getProfile.mockResolvedValue({ profile });
    const callback = vi.fn();
    subscribeToAuth(callback);
    const listener = mocks.onIdTokenChanged.mock.calls[0][1];
    const user = firebaseUser();

    await Promise.all([listener(user), listener(user)]);

    expect(mocks.api.getProfile).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('completes and updates profiles, then removes pending data', async () => {
    const user = firebaseUser();
    mocks.auth.currentUser = user;
    sessionStorage.setItem('teamspeak.pending-profile', JSON.stringify({ nombre: 'Ana', apellido: 'M' }));
    mocks.api.createProfile.mockResolvedValue({ profile });
    mocks.api.updateProfile.mockResolvedValue({ profile });
    await expect(completeProfile('ana_martinez')).resolves.toMatchObject({ user: { username: 'ana_martinez' } });
    expect(sessionStorage.getItem('teamspeak.pending-profile')).toBeNull();
    await expect(updateUserProfile({ nombre: 'Ana' })).resolves.toMatchObject({ user: { name: 'Ana' } });
    expect(mocks.api.updateProfile).toHaveBeenCalledWith({ nombre: 'Ana' });
  });

  it('handles verification, password recovery, refresh and logout', async () => {
    const user = firebaseUser();
    mocks.auth.currentUser = user;
    await resendVerification();
    await resetPassword(' ana@test.edu ');
    await refreshCurrentUser();
    await logoutUser();
    expect(mocks.sendEmailVerification).toHaveBeenCalledWith(user);
    expect(mocks.sendPasswordResetEmail).toHaveBeenCalledWith(mocks.auth, 'ana@test.edu');
    expect(user.reload).toHaveBeenCalled();
    expect(user.getIdToken).toHaveBeenCalledWith(true);
    expect(mocks.signOut).toHaveBeenCalledWith(mocks.auth);
  });

  it('requires an authenticated Firebase user for verification and refresh', async () => {
    await expect(resendVerification()).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    await expect(refreshCurrentUser()).resolves.toBeNull();
  });

  it('deletes the backend profile before signing out', async () => {
    await deleteUserAccount();
    expect(mocks.api.deleteProfile).toHaveBeenCalled();
    expect(mocks.signOut).toHaveBeenCalledWith(mocks.auth);
  });
});
