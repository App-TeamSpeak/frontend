import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: { currentUser: null as any },
  api: {
    getProfile: vi.fn(),
    createProfile: vi.fn(),
    updateProfile: vi.fn(),
    deleteProfile: vi.fn(),
    requestEmailChange: vi.fn(),
  },
  setPersistence: vi.fn().mockResolvedValue(undefined),
  onIdTokenChanged: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  sendEmailVerification: vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  verifyEmailChange: vi.fn(),
  reauthenticate: vi.fn(),
  reauthenticatePopup: vi.fn(),
  signOut: vi.fn().mockResolvedValue(undefined),
  updateProfile: vi.fn().mockResolvedValue(undefined),
  assertFirebaseConfiguration: vi.fn(),
}));

vi.mock('firebase/auth', () => ({
  browserLocalPersistence: 'local',
  EmailAuthProvider: { credential: (email: string, password: string) => ({ email, password }) },
  verifyBeforeUpdateEmail: mocks.verifyEmailChange,
  reauthenticateWithCredential: mocks.reauthenticate,
  reauthenticateWithPopup: mocks.reauthenticatePopup,
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
vi.mock('./api', () => ({ api: mocks.api, ApiError: class ApiError extends Error { constructor(public status: number, payload: { code: string; message: string }) { super(payload.message); this.code = payload.code; } code: string; } }));

import {
  completeProfile,
  configureAuth,
  continueWithGoogle,
  clearAuthProfileCache,
  currentFirebaseUser,
  deleteUserAccount,
  reauthenticateForDeletion,
  requestVerifiedEmailChange,
  confirmVerifiedEmailChange,
  loginUser,
  logoutUser,
  refreshCurrentUser,
  refreshProfile,
  registerUser,
  resendVerification,
  resetPassword,
  subscribeToAuth,
  updateUserProfile,
} from './auth';
import { ApiError } from './api';

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
  mocks.api.getProfile.mockReset();
  mocks.onIdTokenChanged.mockReturnValue(vi.fn());
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
    mocks.auth.currentUser = user;
    mocks.signInWithEmailAndPassword.mockResolvedValue({ user });
    mocks.api.getProfile.mockResolvedValue({ uid: 'u1', profileStatus: 'incomplete', profile: null });
    await expect(loginUser({ email: ' ana@test.edu ', password: 'secret1' })).resolves.toMatchObject({ user: { id: 'u1', name: 'Ana', apellido: 'Martínez' } });
  });

  it('continues with Google and creates pending names without a profile', async () => {
    const user = firebaseUser({ displayName: 'Ana Martínez' });
    mocks.auth.currentUser = user;
    mocks.signInWithPopup.mockResolvedValue({ user });
    mocks.api.getProfile.mockResolvedValue({ uid: 'u1', profileStatus: 'incomplete', profile: null });
    await continueWithGoogle();
    expect(mocks.signInWithPopup).toHaveBeenCalledWith(mocks.auth, expect.anything());
    expect(JSON.parse(sessionStorage.getItem('teamspeak.pending-profile')!)).toEqual({ nombre: 'Ana', apellido: 'Martínez' });
  });

  it('subscribes to token changes and enriches authenticated users', async () => {
    mocks.api.getProfile.mockResolvedValue({ uid: 'u1', profileStatus: 'complete', profile });
    const callback = vi.fn();
    subscribeToAuth(callback);
    const listener = mocks.onIdTokenChanged.mock.calls[0][1];
    await listener(null);
    mocks.auth.currentUser = firebaseUser();
    await listener(mocks.auth.currentUser);
    expect(callback).toHaveBeenNthCalledWith(1, null);
    expect(callback).toHaveBeenNthCalledWith(2, expect.objectContaining({ username: 'ana_martinez' }));
  });

  it('reuses the profile request across repeated token changes', async () => {
    mocks.api.getProfile.mockResolvedValue({ uid: 'u1', profileStatus: 'complete', profile });
    const callback = vi.fn();
    subscribeToAuth(callback);
    const listener = mocks.onIdTokenChanged.mock.calls[0][1];
    const user = firebaseUser();

    mocks.auth.currentUser = user;
    await Promise.all([listener(user), listener(user)]);

    expect(mocks.api.getProfile).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it.each([
    [409, 'PROFILE_INCONSISTENT'], [404, 'PROFILE_NOT_FOUND'], [403, 'EMAIL_NOT_VERIFIED'],
    [403, 'ACCOUNT_DELETION_BLOCKED'], [503, 'FIRESTORE_UNAVAILABLE'], [503, 'AUTH_UNAVAILABLE'],
  ])('does not treat %s %s as onboarding and recovers on refresh', async (status, code) => {
    const user = firebaseUser();
    mocks.auth.currentUser = user;
    mocks.signInWithEmailAndPassword.mockResolvedValue({ user });
    mocks.api.getProfile.mockRejectedValueOnce(new ApiError(status, { success: false, code, message: 'failed' }))
      .mockResolvedValueOnce({ uid: 'u1', profileStatus: 'complete', profile });
    await expect(loginUser({ email: user.email, password: 'demo' })).resolves.toMatchObject({ user: { profileError: code } });
    await expect(refreshProfile('u1')).resolves.toMatchObject({ user: { username: profile.username } });
  });

  it('rejects AUTH_INVALID and keeps a recurring Google username', async () => {
    const user = firebaseUser();
    mocks.auth.currentUser = user;
    mocks.signInWithPopup.mockResolvedValue({ user });
    mocks.api.getProfile.mockRejectedValueOnce(new ApiError(401, { success: false, code: 'AUTH_INVALID', message: 'expired' }))
      .mockResolvedValueOnce({ uid: 'u1', profileStatus: 'complete', profile });
    await expect(continueWithGoogle()).rejects.toMatchObject({ code: 'AUTH_INVALID' });
    await expect(continueWithGoogle()).resolves.toMatchObject({ user: { username: profile.username } });
    expect(sessionStorage.getItem('teamspeak.pending-profile')).toBeNull();
  });

  it.each(['logout', 'switch', 'unsubscribe', 'same UID'] as const)(
    'ignores success and rejection from older work after %s', async scenario => {
      const user = firebaseUser();
      mocks.auth.currentUser = user;
      let resolve!: (value: unknown) => void;
      let reject!: (error: Error) => void;
      mocks.api.getProfile.mockReturnValueOnce(new Promise((yes, no) => { resolve = yes; reject = no; }));
      const callback = vi.fn();
      const onIdentityChange = vi.fn();
      const stop = subscribeToAuth(callback, onIdentityChange);
      const listener = mocks.onIdTokenChanged.mock.calls[0][1];
      const previous = listener(user);
      const refresh = refreshProfile('u1').catch(error => error);
      if (scenario === 'unsubscribe') stop();
      else if (scenario === 'logout') {
        await logoutUser();
        mocks.auth.currentUser = null;
        await listener(null);
      } else {
        const uid = scenario === 'switch' ? 'u2' : 'u1';
        const next = firebaseUser({ uid });
        const current = { ...profile, uid, username: 'new_username' };
        mocks.auth.currentUser = next;
        mocks.api.getProfile.mockResolvedValueOnce({ uid, profileStatus: 'complete', profile: current });
        await listener(next);
      }
      if (scenario === 'switch') reject(new Error('late failure'));
      else resolve({ uid: 'u1', profileStatus: 'complete', profile });
      await previous;
      await refresh;
      if (scenario === 'unsubscribe') expect(callback).not.toHaveBeenCalled();
      else if (scenario === 'logout') expect(callback.mock.calls).toEqual([[null]]);
      else {
        expect(onIdentityChange).toHaveBeenCalledOnce();
        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledWith(expect.objectContaining({ username: 'new_username' }));
      }
    },
  );

  it.each([
    [409, 'PROFILE_INCONSISTENT'], [404, 'PROFILE_NOT_FOUND'], [403, 'ACCOUNT_DELETION_BLOCKED'],
    [403, 'ACCOUNT_DELETION_PENDING'], [403, 'ACCOUNT_DELETED'], [503, 'FIRESTORE_UNAVAILABLE'],
  ])('does not republish a complete profile after a refresh returns %s %s', async (status, code) => {
    const user = firebaseUser();
    mocks.auth.currentUser = user;
    const confirmed = { uid: user.uid, profileStatus: 'complete', profile };
    const failure = new ApiError(status, { success: false, code, message: 'profile unavailable' });
    mocks.api.getProfile.mockResolvedValueOnce(confirmed).mockRejectedValueOnce(failure).mockResolvedValueOnce(confirmed);
    const callback = vi.fn();
    subscribeToAuth(callback);
    const listener = mocks.onIdTokenChanged.mock.calls[0][1];
    await listener(user);
    expect(callback).toHaveBeenLastCalledWith(expect.objectContaining({ username: profile.username }));

    await expect(refreshProfile(user.uid)).resolves.toMatchObject({
      response: undefined, error: failure, user: { username: undefined, profileError: code },
    });
    await listener(user);
    expect(callback).toHaveBeenLastCalledWith(expect.objectContaining({ username: undefined, profileError: code }));
    expect(mocks.api.getProfile).toHaveBeenCalledTimes(2);

    await expect(refreshProfile(user.uid)).resolves.toMatchObject({ user: { username: profile.username } });
    await listener(user);
    expect(callback.mock.lastCall?.[0]).not.toHaveProperty('profileError');
    expect(mocks.api.getProfile).toHaveBeenCalledTimes(3);
  });

  it('ignores a pending write from an earlier account', async () => {
    const user = firebaseUser();
    mocks.auth.currentUser = user;
    let finish!: (value: unknown) => void;
    mocks.api.updateProfile.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const write = updateUserProfile({ nombre: 'Nombre anterior' });
    const next = firebaseUser({ uid: 'u2' });
    mocks.auth.currentUser = next;
    const current = { ...profile, uid: next.uid, username: 'current_user' };
    mocks.api.getProfile.mockResolvedValueOnce({ uid: next.uid, profileStatus: 'complete', profile: current });
    await refreshProfile(next.uid);
    finish({ uid: user.uid, profileStatus: 'complete', profile });
    await expect(write).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    const callback = vi.fn();
    subscribeToAuth(callback);
    await mocks.onIdTokenChanged.mock.calls[0][1](next);
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ id: next.uid, username: current.username }));
  });

  it('does not invalidate a confirmed write when an older GET rejects', async () => {
    const user = firebaseUser();
    mocks.auth.currentUser = user;
    let fail!: (error: Error) => void;
    mocks.api.getProfile.mockReturnValueOnce(new Promise((_, reject) => { fail = reject; }));
    const read = refreshProfile(user.uid);
    const updated = { ...profile, username: 'new_username' };
    mocks.api.updateProfile.mockResolvedValueOnce({ uid: user.uid, profileStatus: 'complete', profile: updated });
    await updateUserProfile({ username: updated.username });
    fail(new ApiError(409, { success: false, code: 'PROFILE_INCONSISTENT', message: 'old response' }));
    await expect(read).resolves.toMatchObject({ response: { profile: updated } });
  });

  it('does not overwrite a confirmed write with an older GET', async () => {
    const user = firebaseUser();
    mocks.auth.currentUser = user;
    let resolve!: (value: unknown) => void;
    mocks.api.getProfile.mockReturnValueOnce(new Promise(yes => { resolve = yes; }));
    const read = refreshProfile('u1');
    const updated = { ...profile, username: 'new_username' };
    mocks.api.updateProfile.mockResolvedValue({ uid: 'u1', profileStatus: 'complete', profile: updated });
    await updateUserProfile({ username: updated.username });
    resolve({ uid: 'u1', profileStatus: 'complete', profile });
    await expect(read).resolves.toMatchObject({ response: { profile: updated } });
  });

  it('completes and updates profiles, then removes pending data', async () => {
    const user = firebaseUser();
    mocks.auth.currentUser = user;
    sessionStorage.setItem('teamspeak.pending-profile', JSON.stringify({ nombre: 'Ana', apellido: 'M' }));
    mocks.api.createProfile.mockResolvedValue({ uid: 'u1', profileStatus: 'complete', profile });
    mocks.api.updateProfile.mockResolvedValue({ uid: user.uid, profileStatus: 'complete', profile });
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

  it('returns the definitive receipt for the UI to coordinate logout', async () => {
    mocks.auth.currentUser = firebaseUser();
    mocks.api.deleteProfile.mockResolvedValueOnce({ status: 'completed', statusToken: 'fixture' });
    await expect(deleteUserAccount()).resolves.toMatchObject({ status: 'completed' });
    expect(mocks.api.deleteProfile).toHaveBeenCalledOnce();
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
  it.each(['pending', 'network', 'timeout'])('preserva la sesión ante resultado incierto: %s', async outcome => {
    mocks.auth.currentUser = firebaseUser();
    if (outcome === 'pending') mocks.api.deleteProfile.mockResolvedValueOnce({ status: 'pending' });
    else mocks.api.deleteProfile.mockRejectedValueOnce(outcome === 'timeout' ? new DOMException('Timeout', 'TimeoutError') : new TypeError('offline'));
    await expect(deleteUserAccount()).rejects.toMatchObject({ code: 'ACCOUNT_DELETION_UNKNOWN' });
    expect(mocks.api.deleteProfile).toHaveBeenCalledOnce();
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it('bloquea envíos simultáneos y descarta un éxito de la sesión anterior', async () => {
    mocks.auth.currentUser = firebaseUser();
    let finish!: (value: { status: string; statusToken: string }) => void;
    mocks.api.deleteProfile.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const pending = expect(deleteUserAccount()).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    await expect(deleteUserAccount()).rejects.toMatchObject({ code: 'ACCOUNT_DELETION_IN_PROGRESS' });
    mocks.auth.currentUser = firebaseUser({ uid: 'u2' });
    finish({ status: 'completed', statusToken: 'fixture' });
    await pending;
    expect(mocks.api.deleteProfile).toHaveBeenCalledOnce();
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it('preserves the session and returns the pending receipt', async () => {
    mocks.auth.currentUser = firebaseUser();
    mocks.api.deleteProfile.mockResolvedValueOnce({ status: 'pending', statusToken: 'fixture' });
    await expect(deleteUserAccount()).resolves.toEqual({ status: 'pending', statusToken: 'fixture' });
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it('normalizes the target, reauthenticates and sends Firebase verification after eligibility', async () => {
    const user = firebaseUser({ providerData: [{ providerId: 'password' }] });
    mocks.auth.currentUser = user;
    mocks.api.requestEmailChange.mockResolvedValueOnce({
      eligible: true, currentEmail: user.email, targetEmail: 'new@example.test', nextStep: 'verify_before_update_email',
    });
    const signal = new AbortController().signal;
    await requestVerifiedEmailChange('u1', ' New@Example.Test ', signal, 'fixture-password');
    expect(mocks.reauthenticate).toHaveBeenCalledWith(user, { email: user.email, password: 'fixture-password' });
    expect(user.getIdToken).toHaveBeenCalledWith(true);
    expect(mocks.api.requestEmailChange).toHaveBeenCalledWith('new@example.test', signal);
    expect(mocks.verifyEmailChange).toHaveBeenCalledWith(user, 'new@example.test');
  });

  it.each(['EMAIL_TAKEN', 'EMAIL_UNCHANGED', 'AUTH_RECENT_REQUIRED', 'FIRESTORE_UNAVAILABLE'])(
    'does not send Firebase verification when backend reports %s', async code => {
      mocks.auth.currentUser = firebaseUser({ providerData: [{ providerId: 'password' }] });
      mocks.api.requestEmailChange.mockRejectedValueOnce(new ApiError(409, { success: false, code, message: code }));
      await expect(requestVerifiedEmailChange('u1', 'new@example.test', new AbortController().signal)).rejects.toMatchObject({ code });
      expect(mocks.verifyEmailChange).not.toHaveBeenCalled();
    },
  );

  it('blocks Google-only accounts before eligibility or verification', async () => {
    mocks.auth.currentUser = firebaseUser({ providerData: [{ providerId: 'google.com' }] });
    await expect(requestVerifiedEmailChange('u1', 'new@example.test', new AbortController().signal)).rejects.toMatchObject({ code: 'EMAIL_CHANGE_NOT_ALLOWED' });
    expect(mocks.api.requestEmailChange).not.toHaveBeenCalled();
    expect(mocks.verifyEmailChange).not.toHaveBeenCalled();
  });

  it('confirms only after the verified Firebase email matches the synchronized profile', async () => {
    const target = 'new@example.test';
    mocks.auth.currentUser = firebaseUser({ email: target, emailVerified: false });
    await expect(confirmVerifiedEmailChange('u1', target)).resolves.toBeUndefined();
    expect(mocks.api.getProfile).not.toHaveBeenCalled();
    mocks.auth.currentUser.emailVerified = true;
    mocks.api.getProfile.mockResolvedValueOnce({ uid: 'u1', profileStatus: 'complete', profile: { ...profile, email: target } });
    await expect(confirmVerifiedEmailChange('u1', target)).resolves.toMatchObject({ profile: { email: target }, user: { email: target } });
  });

  it('does not send Firebase verification when identity changes during eligibility', async () => {
    const user = firebaseUser({ providerData: [{ providerId: 'password' }] });
    mocks.auth.currentUser = user;
    mocks.api.requestEmailChange.mockImplementationOnce(async () => {
      mocks.auth.currentUser = firebaseUser({ uid: 'u2' });
      return { eligible: true, currentEmail: user.email, targetEmail: 'new@example.test', nextStep: 'verify_before_update_email' };
    });
    await expect(requestVerifiedEmailChange('u1', 'new@example.test', new AbortController().signal)).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    expect(mocks.verifyEmailChange).not.toHaveBeenCalled();
  });

  it('does not call eligibility when password reauthentication fails', async () => {
    mocks.auth.currentUser = firebaseUser({ providerData: [{ providerId: 'password' }] });
    mocks.reauthenticate.mockRejectedValueOnce({ code: 'auth/invalid-credential' });
    await expect(requestVerifiedEmailChange('u1', 'new@example.test', new AbortController().signal, 'wrong-fixture'))
      .rejects.toMatchObject({ code: 'auth/invalid-credential' });
    expect(mocks.api.requestEmailChange).not.toHaveBeenCalled();
    expect(mocks.verifyEmailChange).not.toHaveBeenCalled();
  });

  it('reports Firebase email delivery failure after eligibility', async () => {
    const target = 'new@example.test';
    const user = firebaseUser({ providerData: [{ providerId: 'password' }] });
    mocks.auth.currentUser = user;
    mocks.api.requestEmailChange.mockResolvedValueOnce({
      eligible: true, currentEmail: user.email, targetEmail: target, nextStep: 'verify_before_update_email',
    });
    mocks.verifyEmailChange.mockRejectedValueOnce({ code: 'auth/network-request-failed' });
    await expect(requestVerifiedEmailChange('u1', target, new AbortController().signal))
      .rejects.toMatchObject({ code: 'auth/network-request-failed' });
    expect(mocks.verifyEmailChange).toHaveBeenCalledOnce();
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it('reauthenticates a Google-linked identity using its provider before refreshing the token', async () => {
    const user = firebaseUser({ providerData: [{ providerId: 'google.com' }] });
    mocks.auth.currentUser = user;
    await reauthenticateForDeletion(user as unknown as Parameters<typeof reauthenticateForDeletion>[0], 'google.com');
    expect(mocks.reauthenticatePopup).toHaveBeenCalledWith(user, expect.any(Object));
    expect(user.getIdToken).toHaveBeenCalledWith(true);
    expect(mocks.api.deleteProfile).not.toHaveBeenCalled();
  });

  it('keeps the definitive receipt if Firebase removes the current identity during deletion', async () => {
    mocks.auth.currentUser = firebaseUser();
    mocks.api.deleteProfile.mockImplementationOnce(async () => {
      mocks.auth.currentUser = null;
      return { status: 'completed', statusToken: 'fixture' };
    });
    await expect(deleteUserAccount()).resolves.toMatchObject({ status: 'completed' });
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

});
