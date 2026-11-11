import { describe, expect, it, vi } from 'vitest';

const firebaseApp = vi.hoisted(() => ({ getApps: vi.fn(() => []), getApp: vi.fn(), initializeApp: vi.fn(() => ({ name: 'test' })) }));
vi.mock('firebase/app', () => firebaseApp);
vi.mock('firebase/auth', () => ({ getAuth: vi.fn(() => ({ name: 'auth' })) }));

import { assertFirebaseConfiguration, firebaseApp as app } from './firebase';

describe('Firebase configuration', () => {
  it('initializes Firebase and validates the configured public variables', () => {
    expect(app).toEqual({ name: 'test' });
    expect(() => assertFirebaseConfiguration()).not.toThrow();
  });
});
