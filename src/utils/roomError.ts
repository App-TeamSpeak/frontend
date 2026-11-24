import { ApiError } from '../services/api';

/**
 * Traduce códigos de error de salas de la API a mensajes comprensibles para el usuario.
 */
export function roomError(error: unknown, fallback: string): string {
  switch (error instanceof ApiError ? error.code : '') {
    case 'AUTH_REQUIRED':
    case 'AUTH_INVALID': return 'Tu sesión expiró. Vuelve a iniciar sesión.';
    case 'EMAIL_NOT_VERIFIED': return 'Verifica tu correo para continuar.';
    case 'PROFILE_INCOMPLETE': return 'Completa tu perfil para continuar.';
    case 'PROFILE_INCONSISTENT': return 'Tu perfil requiere revisión.';
    case 'ACCOUNT_DELETION_PENDING':
    case 'ACCOUNT_DELETION_BLOCKED':
    case 'ACCOUNT_DELETED': return 'Tu cuenta no tiene acceso a las salas.';
    case 'ROOM_NOT_FOUND': return 'La sala no existe.';
    case 'ROOM_ACCESS_DENIED': return 'No tienes acceso a esta sala.';
    case 'AUTH_UNAVAILABLE':
    case 'FIRESTORE_UNAVAILABLE': return 'El servicio no está disponible. Inténtalo de nuevo.';
    default: return fallback;
  }
}
