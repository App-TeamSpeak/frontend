import { describe, expect, it } from 'vitest';
import {
  CHAT_BOTTOM_THRESHOLD_PX,
  formatNewMessagesLabel,
  isNearBottom,
} from './chatScroll';

describe('chatScroll', () => {
  it('considera el chat al final cuando el contenido cabe en el contenedor', () => {
    expect(isNearBottom({ scrollTop: 0, scrollHeight: 0, clientHeight: 0 })).toBe(true);
    expect(isNearBottom({ scrollTop: 0, scrollHeight: 200, clientHeight: 200 })).toBe(true);
    expect(
      isNearBottom({
        scrollTop: 0,
        scrollHeight: 200 + CHAT_BOTTOM_THRESHOLD_PX,
        clientHeight: 200,
      }),
    ).toBe(true);
  });

  it('detecta cuando el usuario está cerca del final o leyendo mensajes anteriores', () => {
    expect(isNearBottom({ scrollTop: 576, scrollHeight: 800, clientHeight: 200 })).toBe(true);
    expect(isNearBottom({ scrollTop: 575, scrollHeight: 800, clientHeight: 200 })).toBe(false);
    expect(isNearBottom({ scrollTop: 60, scrollHeight: 800, clientHeight: 200 })).toBe(false);
    expect(isNearBottom({ scrollTop: 0, scrollHeight: 800, clientHeight: 0 })).toBe(false);
  });

  it('formatea el indicador de Mensajes nuevos con conteo y acción Ir al final', () => {
    expect(formatNewMessagesLabel(1)).toBe('Mensajes nuevos (1) · Ir al final');
    expect(formatNewMessagesLabel(3)).toBe('Mensajes nuevos (3) · Ir al final');
  });
});
