import { describe, expect, it } from 'vitest';
import {
  appendLiveMessage,
  formatMessageAuthor,
  mergeHistoryPage,
  messageAvatarTone,
  normalizeHistoryResult,
} from './chatHistory';

describe('chatHistory', () => {
  it('combina la carga inicial anteponiendo el historial a mensajes recibidos en vivo sin duplicados', () => {
    const live = [
      { id: 'm2', text: 'Segundo' },
      { id: 'm3', text: 'En vivo' },
    ];
    const initial = [
      { id: 'm1', text: 'Primero' },
      { id: 'm2', text: 'Segundo' },
    ];

    expect(mergeHistoryPage(live, initial, 'initial')).toEqual([
      { id: 'm1', text: 'Primero' },
      { id: 'm2', text: 'Segundo' },
      { id: 'm3', text: 'En vivo' },
    ]);
  });

  it('ordena cronológicamente cuando la carga inicial reintentada se intercala con mensajes en vivo', () => {
    const live = [
      { id: 'm2', createdAt: '2026-01-01T12:02:00Z', text: 'Segundo' },
      { id: 'm4', createdAt: '2026-01-01T12:04:00Z', text: 'Cuarto' },
    ];
    const initial = [
      { id: 'm1', createdAt: '2026-01-01T12:01:00Z', text: 'Primero' },
      { id: 'm2', createdAt: '2026-01-01T12:02:00Z', text: 'Segundo' },
      { id: 'm3', createdAt: '2026-01-01T12:03:00Z', text: 'Tercero' },
      { id: 'm4', createdAt: '2026-01-01T12:04:00Z', text: 'Cuarto' },
    ];

    expect(mergeHistoryPage(live, initial, 'initial')).toEqual([
      { id: 'm1', createdAt: '2026-01-01T12:01:00Z', text: 'Primero' },
      { id: 'm2', createdAt: '2026-01-01T12:02:00Z', text: 'Segundo' },
      { id: 'm3', createdAt: '2026-01-01T12:03:00Z', text: 'Tercero' },
      { id: 'm4', createdAt: '2026-01-01T12:04:00Z', text: 'Cuarto' },
    ]);
  });

  it('antepone páginas más antiguas conservando el orden cronológico y deduplicando ids', () => {
    const current = [
      { id: 'm3', text: 'Tercero' },
      { id: 'm4', text: 'Cuarto' },
    ];
    const older = [
      { id: 'm1', text: 'Primero' },
      { id: 'm2', text: 'Segundo' },
      { id: 'm3', text: 'Tercero duplicado' },
    ];

    expect(mergeHistoryPage(current, older, 'older')).toEqual([
      { id: 'm1', text: 'Primero' },
      { id: 'm2', text: 'Segundo' },
      { id: 'm3', text: 'Tercero' },
      { id: 'm4', text: 'Cuarto' },
    ]);
  });

  it('deduplica mensajes recibidos en vivo al añadirlos al final', () => {
    const current = [{ id: 'm1', text: 'Hola' }];
    expect(appendLiveMessage(current, { id: 'm1', text: 'Hola' })).toBe(current);
    expect(appendLiveMessage(current, { id: 'm2', text: 'Nuevo' })).toEqual([
      { id: 'm1', text: 'Hola' },
      { id: 'm2', text: 'Nuevo' },
    ]);
  });

  it('normaliza resultados paginados y arreglos heredados', () => {
    const msg = { id: 'm1', roomId: 'r1', authorId: 'u1', text: 'Hola', createdAt: '2026-01-01T00:00:00Z' };
    expect(normalizeHistoryResult({ messages: [msg], nextCursor: 'abc' })).toEqual({
      messages: [msg],
      nextCursor: 'abc',
    });
    expect(normalizeHistoryResult([msg])).toEqual({
      messages: [msg],
      nextCursor: null,
    });
  });

  it('formatea autores propios, otros usuarios y autores eliminados', () => {
    expect(formatMessageAuthor({ authorId: 'u1' }, 'u1')).toEqual({
      sender: 'Tú',
      initials: 'T',
    });
    expect(formatMessageAuthor({ authorId: 'u1', authorName: 'Mateo López' }, 'u1')).toEqual({
      sender: 'Tú',
      initials: 'T',
    });
    expect(formatMessageAuthor({ authorId: 'u2', authorName: 'Ana Martínez' }, 'u1')).toEqual({
      sender: 'Ana Martínez',
      initials: 'AM',
    });
    expect(formatMessageAuthor({ authorId: 'abcdef123' }, 'u1')).toEqual({
      sender: 'Usuario abcdef',
      initials: 'UA',
    });
    expect(formatMessageAuthor({ authorId: null, authorDeleted: true, authorName: 'Ana Martínez' }, 'u1')).toEqual({
      sender: 'Usuario eliminado',
      initials: 'UE',
    });
    expect(formatMessageAuthor({ authorId: null }, 'u1')).toEqual({
      sender: 'Usuario eliminado',
      initials: 'UE',
    });
  });

  it('asigna un tono determinista y consistente por remitente', () => {
    expect(messageAvatarTone({ authorId: 'u1' }, 'u1')).toBe(0);
    const toneA = messageAvatarTone({ authorId: 'FkX1RVabc' }, 'u1');
    expect([1, 2, 3]).toContain(toneA);
    expect(messageAvatarTone({ authorId: 'FkX1RVabc' }, 'u1')).toBe(toneA);
    expect(messageAvatarTone({ authorId: null, authorDeleted: true }, 'u1')).toBe(1);
    expect(messageAvatarTone({ authorId: null }, 'u1')).toBe(1);
  });
});
