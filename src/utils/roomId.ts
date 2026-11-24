export type RoomIdValidation =
  | { ok: true; roomId: string }
  | { ok: false; kind: 'empty' | 'invalid'; message: string };

const MAX_ROOM_ID_LENGTH = 128;
const INVALID_ROOM_ID_PATTERN = /\/|^\.{1,2}$|^__.*__$/;

/**
 * Normaliza y valida un identificador de sala siguiendo las reglas del backend.
 */
export function validateRoomId(rawRoomId: string): RoomIdValidation {
  const roomId = rawRoomId.trim();
  if (!roomId) {
    return {
      ok: false,
      kind: 'empty',
      message: 'Ingresa el código de la Sala para continuar',
    };
  }
  if (roomId.length > MAX_ROOM_ID_LENGTH || INVALID_ROOM_ID_PATTERN.test(roomId)) {
    return {
      ok: false,
      kind: 'invalid',
      message: 'El código ingresado no tiene un formato válido',
    };
  }
  return { ok: true, roomId };
}
