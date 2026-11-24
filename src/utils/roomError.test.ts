import { describe, expect, it } from 'vitest';
import { ApiError } from '../services/api';
import { roomError } from './roomError';

describe('roomError', () => {
  const fallback = 'No pudimos completar la operación.';

  it.each([
    ['AUTH_REQUIRED', 'Tu sesión expiró. Vuelve a iniciar sesión.'],
    ['AUTH_INVALID', 'Tu sesión expiró. Vuelve a iniciar sesión.'],
    ['EMAIL_NOT_VERIFIED', 'Verifica tu correo para continuar.'],
    ['PROFILE_INCOMPLETE', 'Completa tu perfil para continuar.'],
    ['PROFILE_INCONSISTENT', 'Tu perfil requiere revisión.'],
    ['ACCOUNT_DELETION_PENDING', 'Tu cuenta no tiene acceso a las salas.'],
    ['ACCOUNT_DELETION_BLOCKED', 'Tu cuenta no tiene acceso a las salas.'],
    ['ACCOUNT_DELETED', 'Tu cuenta no tiene acceso a las salas.'],
    ['ROOM_NOT_FOUND', 'La sala no existe.'],
    ['ROOM_ACCESS_DENIED', 'No tienes acceso a esta sala.'],
    ['AUTH_UNAVAILABLE', 'El servicio no está disponible. Inténtalo de nuevo.'],
    ['FIRESTORE_UNAVAILABLE', 'El servicio no está disponible. Inténtalo de nuevo.'],
  ])('mapea el código %s a su mensaje esperado', (code, expected) => {
    const error = new ApiError(400, { success: false, code, message: 'Mensaje crudo' });
    expect(roomError(error, fallback)).toBe(expected);
  });

  it('devuelve el fallback para códigos desconocidos de ApiError, incluido VALIDATION_ERROR', () => {
    for (const code of ['VALIDATION_ERROR', 'API_ERROR', 'UNKNOWN_CODE']) {
      const error = new ApiError(400, { success: false, code, message: 'Mensaje crudo' });
      expect(roomError(error, fallback)).toBe(fallback);
    }
  });

  it('devuelve el fallback para errores que no son ApiError', () => {
    for (const error of [new Error('fallo de red'), 'error plano', null, undefined, { code: 'ROOM_NOT_FOUND' }]) {
      expect(roomError(error, fallback)).toBe(fallback);
    }
  });
});
