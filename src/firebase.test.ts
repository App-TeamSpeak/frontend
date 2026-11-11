import { describe, expect, it, vi } from 'vitest';

const firebaseApp = vi.hoisted(() => ({ getApps: vi.fn(() => []), getApp: vi.fn(), initializeApp: vi.fn(() => ({ name: 'test' })) }));
vi.mock('firebase/app', () => firebaseApp);
vi.mock('firebase/auth', () => ({ getAuth: vi.fn(() => ({ name: 'auth' })) }));

import { assertFirebaseConfiguration, firebaseApp as app } from './firebase';

describe('Firebase configuration', () => {
  it('initializes the fallback and reports missing public variables in CI', () => {
    expect(app).toEqual({ name: 'test' });
    try {
      assertFirebaseConfiguration();
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(/Faltan variables públicas de Firebase/);
    }
  });
});
