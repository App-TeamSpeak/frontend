import { describe, expect, it } from 'vitest';
import { validateRoomId } from './roomId';

describe('validateRoomId', () => {
  it('rechaza un ID vacío o compuesto solo por espacios', () => {
    for (const raw of ['', '   ', '\t\n  ']) {
      expect(validateRoomId(raw)).toEqual({
        ok: false,
        kind: 'empty',
        message: 'Ingresa el código de la Sala para continuar',
      });
    }
  });

  it('normaliza espacios exteriores en identificadores válidos', () => {
    expect(validateRoomId('  CALC-8F2K  ')).toEqual({
      ok: true,
      roomId: 'CALC-8F2K',
    });
  });

  it('rechaza identificadores que contienen barras inclinadas', () => {
    for (const raw of ['nested/room', '/room', 'room/', 'a/b/c']) {
      expect(validateRoomId(raw)).toEqual({
        ok: false,
        kind: 'invalid',
        message: 'El código ingresado no tiene un formato válido',
      });
    }
  });

  it('rechaza identificadores reservados por Firestore o rutas relativas', () => {
    for (const raw of ['.', '..', '  ..  ', '__reserved__', '____', '  __admin__  ']) {
      expect(validateRoomId(raw)).toEqual({
        ok: false,
        kind: 'invalid',
        message: 'El código ingresado no tiene un formato válido',
      });
    }
  });

  it('acepta identificadores similares que no son reservados', () => {
    expect(validateRoomId('...')).toEqual({ ok: true, roomId: '...' });
    expect(validateRoomId('__prefix')).toEqual({ ok: true, roomId: '__prefix' });
    expect(validateRoomId('suffix__')).toEqual({ ok: true, roomId: 'suffix__' });
  });

  it('aplica la longitud máxima de 128 caracteres después de recortar espacios', () => {
    const maxValid = 'a'.repeat(128);
    expect(validateRoomId(`  ${maxValid}  `)).toEqual({
      ok: true,
      roomId: maxValid,
    });

    expect(validateRoomId('a'.repeat(129))).toEqual({
      ok: false,
      kind: 'invalid',
      message: 'El código ingresado no tiene un formato válido',
    });
  });
});
